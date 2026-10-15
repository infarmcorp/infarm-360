'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { appBaseUrl } from '@/lib/app-url';
import { emailConfigured, sendEmail } from '@/lib/email/mailer';
import { releaseEmailHtml, releaseSubject, type ReleaseContent } from '@/lib/email/release-template';
import { loadReleasePeriod, RELEASE_EMAIL_ACTION } from '@/lib/report-release';
import { tableMissing } from '@/lib/report-folder';

/**
 * Email Rilis Laporan PA (Review & Finalisasi): kabari pegawai bahwa PDF laporannya sudah bisa
 * diunduh di portal (Laporan Hasil Saya → Unduh PDF → Folder Laporan Drive).
 *  - Hanya HRD penuh (bagian Laporan + Mode Admin); pemegang grant Review tidak mengirim email.
 *  - Penerima ditegakkan ulang di server: laporan periode itu FINAL + Folder Laporan terisi + punya
 *    email akun. Yang tidak memenuhi dilewati beserta alasannya (bukan error).
 *  - Dikirim per gelombang kecil dari klien (MAX_BATCH) agar tak melewati batas waktu server dan
 *    progres terlihat. Tiap gelombang dicatat di log HRD (`meta.sent_ids`) → dasar "sudah dikirim".
 */

const MAX_BATCH = 20;
const NOT_ACTIVE = 'Fitur email belum aktif (set SMTP_USER+SMTP_PASS [Gmail] atau RESEND_API_KEY di Vercel).';

const Content = z.object({
  cycle: z.string().trim().max(40),
  includeLate: z.boolean(),
  steps: z.array(z.object({ when: z.string().trim().max(80), text: z.string().trim().max(600) })).max(8),
});
const Id = z.string().uuid();

type Person = { id: string; name: string; reason: string };
export type ReleaseSendResult =
  | { ok: true; sent: string[]; skipped: Person[]; failed: Person[] }
  | { ok: false; error: string };

async function requireHrdAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('name, role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  if (!canSection(me, 'laporan') || jar.get('hrd_mode')?.value !== 'admin') {
    return { ok: false as const, error: 'Hanya HRD (Mode Admin) yang dapat mengirim email rilis laporan' };
  }
  return { ok: true as const, userId: user.id, userName: me?.name ?? null };
}

/** Kirim email rilis ke sekelompok pegawai (≤ MAX_BATCH per panggilan). */
export async function sendReleaseEmails(input: { periodId: string; employeeIds: string[]; content: ReleaseContent }): Promise<ReleaseSendResult> {
  const parsed = z.object({ periodId: Id, employeeIds: z.array(Id).min(1).max(MAX_BATCH), content: Content }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;
  if (!emailConfigured()) return { ok: false, error: NOT_ACTIVE };

  const { periodId, content } = parsed.data;
  const ids = [...new Set(parsed.data.employeeIds)];
  const admin = createAdminClient();
  const period = await loadReleasePeriod(admin, periodId);
  if (!period) return { ok: false, error: 'Periode tidak ditemukan' };

  const [{ data: emps }, { data: reports }, folderRes] = await Promise.all([
    admin.from('employees').select('id, name').in('id', ids),
    admin.from('final_reports').select('employee_id').eq('period_id', periodId).eq('status', 'finalized').in('employee_id', ids),
    admin.from('employee_report_folders').select('employee_id, url').in('employee_id', ids),
  ]);
  if (folderRes.error && !tableMissing(folderRes.error)) return { ok: false, error: 'Gagal membaca Folder Laporan: ' + folderRes.error.message };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.name]));
  const finalSet = new Set((reports ?? []).map((r) => r.employee_id));
  const folderSet = new Set((folderRes.data ?? []).filter((f) => f.url).map((f) => f.employee_id));

  const base = await appBaseUrl();
  const appUrl = base ? `${base}/laporan` : undefined;
  const sent: string[] = []; const skipped: Person[] = []; const failed: Person[] = [];
  for (const id of ids) {
    const name = nameById.get(id) ?? '—';
    if (!nameById.has(id)) { skipped.push({ id, name, reason: 'pegawai tidak ditemukan' }); continue; }
    if (!finalSet.has(id)) { skipped.push({ id, name, reason: 'laporan belum Final' }); continue; }
    if (!folderSet.has(id)) { skipped.push({ id, name, reason: 'Folder Laporan (PDF) belum diisi' }); continue; }
    const { data: u } = await admin.auth.admin.getUserById(id);
    const email = u.user?.email;
    if (!email) { skipped.push({ id, name, reason: 'tanpa email akun' }); continue; }
    const r = await sendEmail({
      to: email,
      subject: releaseSubject(period.label, name),
      html: releaseEmailHtml({ name, period, content, appUrl }),
    });
    if (r.ok) sent.push(id);
    else failed.push({ id, name, reason: r.reason === 'error' ? (r.detail ?? 'gagal kirim') : 'email belum aktif' });
  }

  if (sent.length || failed.length) {
    await logHrdAction({
      action: RELEASE_EMAIL_ACTION, category: 'laporan',
      summary: `Email rilis laporan "${period.label}": ${sent.length} terkirim, ${failed.length} gagal, ${skipped.length} dilewati`,
      targetType: 'period', targetId: periodId, targetLabel: period.label,
      meta: { sent_ids: sent, failed: failed.map((f) => f.id), skipped: skipped.map((s) => s.id) },
    });
  }
  revalidatePath('/admin/laporan');
  return { ok: true, sent, skipped, failed };
}

/** Kirim UJI ke email HRD yang sedang login (nama penerima = nama sendiri). Tidak dicatat sebagai terkirim. */
export async function sendReleaseEmailTest(input: { periodId: string; content: ReleaseContent }): Promise<{ ok: true; msg: string } | { ok: false; error: string }> {
  const parsed = z.object({ periodId: Id, content: Content }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;
  if (!emailConfigured()) return { ok: false, error: NOT_ACTIVE };

  const admin = createAdminClient();
  const period = await loadReleasePeriod(admin, parsed.data.periodId);
  if (!period) return { ok: false, error: 'Periode tidak ditemukan' };
  const { data: u } = await admin.auth.admin.getUserById(auth.userId);
  const email = u.user?.email;
  if (!email) return { ok: false, error: 'Akun Anda belum punya email.' };

  const base = await appBaseUrl();
  const name = auth.userName ?? 'Pegawai';
  const r = await sendEmail({
    to: email,
    subject: `[UJI] ${releaseSubject(period.label, name)}`,
    html: releaseEmailHtml({ name, period, content: parsed.data.content, appUrl: base ? `${base}/laporan` : undefined }),
  });
  if (!r.ok) return { ok: false, error: r.reason === 'error' ? 'Gagal mengirim email' + (r.detail ? `: ${r.detail}` : '') : NOT_ACTIVE };
  return { ok: true, msg: `Email uji terkirim ke ${email}.` };
}
