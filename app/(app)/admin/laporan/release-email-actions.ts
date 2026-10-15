'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { appBaseUrl } from '@/lib/app-url';
import { emailConfigured, sendEmail, type EmailAttachment } from '@/lib/email/mailer';
import { releaseEmailHtml, releaseSubject, type ReleaseContent, type ReleaseImageSrc } from '@/lib/email/release-template';
import {
  loadReleasePeriod, loadReleaseImages, releaseImageFolder,
  RELEASE_EMAIL_ACTION, RELEASE_BUCKET, RELEASE_IMAGES,
} from '@/lib/report-release';
import { tableMissing } from '@/lib/report-folder';

/**
 * Email Rilis Laporan PA (Review & Finalisasi): kabari pegawai bahwa PDF laporannya sudah bisa
 * diunduh di portal (Laporan Hasil Saya → Unduh PDF → Folder Laporan Drive).
 *  - Hanya HRD penuh (bagian Laporan + Mode Admin); pemegang grant Review tidak mengirim email.
 *  - Penerima ditegakkan ulang di server: laporan periode itu FINAL + Folder Laporan terisi + punya
 *    email akun. Yang tidak memenuhi dilewati beserta alasannya (bukan error).
 *  - Dikirim per gelombang kecil dari klien (MAX_BATCH) agar tak melewati batas waktu server dan
 *    progres terlihat. Tiap gelombang dicatat di log HRD (`meta.sent_ids`) → dasar "sudah dikirim".
 *  - Gambar pendamping (unggahan HRD per periode, bucket `email-assets`) disisipkan inline lewat CID.
 */

const MAX_BATCH = 20;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const NOT_ACTIVE = 'Fitur email belum aktif (set SMTP_USER+SMTP_PASS [Gmail] atau RESEND_API_KEY di Vercel).';
const STORAGE_OFF = 'Penyimpanan gambar belum aktif — jalankan migrasi 0051 (bucket email-assets).';

const Content = z.object({
  cycle: z.string().trim().max(40),
  includeLate: z.boolean(),
  steps: z.array(z.object({ when: z.string().trim().max(80), text: z.string().trim().max(600) })).max(8),
});
const Id = z.string().uuid();
const ImageKey = z.enum(RELEASE_IMAGES.map((i) => i.key) as [string, ...string[]]);

type Person = { id: string; name: string; reason: string };
export type ReleaseSendResult =
  | { ok: true; sent: string[]; skipped: Person[]; failed: Person[] }
  | { ok: false; error: string };
type Simple = { ok: true; msg: string } | { ok: false; error: string };

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

/**
 * Gambar periode → lampiran inline (CID) + sumber <img> untuk template. Gambar yang URL publiknya tak
 * terjangkau dilewati (cek sekali per gelombang) agar satu gambar rusak tak menggagalkan semua email.
 */
async function releaseImageParts(admin: ReturnType<typeof createAdminClient>, periodId: string) {
  const { images } = await loadReleaseImages(admin, periodId);
  const attachments: EmailAttachment[] = [];
  const src: ReleaseImageSrc = {};
  for (const def of RELEASE_IMAGES) {
    const img = images[def.key];
    if (!img) continue;
    const reachable = await fetch(img.url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
    if (!reachable) continue;
    const cid = `rilis-${def.key}@infarm360`;
    attachments.push({ filename: `${def.label}.${img.path.split('.').pop()}`, path: img.url, cid });
    src[def.key] = `cid:${cid}`;
  }
  return { attachments, src };
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
  const { attachments, src } = await releaseImageParts(admin, periodId);
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
      html: releaseEmailHtml({ name, period, content, appUrl, images: src }),
      ...(attachments.length ? { attachments } : {}),
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
export async function sendReleaseEmailTest(input: { periodId: string; content: ReleaseContent }): Promise<Simple> {
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
  const { attachments, src } = await releaseImageParts(admin, period.id);
  const r = await sendEmail({
    to: email,
    subject: `[UJI] ${releaseSubject(period.label, name)}`,
    html: releaseEmailHtml({ name, period, content: parsed.data.content, appUrl: base ? `${base}/laporan` : undefined, images: src }),
    ...(attachments.length ? { attachments } : {}),
  });
  if (!r.ok) return { ok: false, error: r.reason === 'error' ? 'Gagal mengirim email' + (r.detail ? `: ${r.detail}` : '') : NOT_ACTIVE };
  return { ok: true, msg: `Email uji terkirim ke ${email}.` };
}

/** Unggah/ganti satu gambar pendamping periode (FormData: periodId, key, file). JPG/PNG/WebP ≤ 2 MB. */
export async function uploadReleaseImage(form: FormData): Promise<Simple> {
  const parsed = z.object({ periodId: Id, key: ImageKey }).safeParse({ periodId: form.get('periodId'), key: form.get('key') });
  const file = form.get('file');
  if (!parsed.success || !(file instanceof File)) return { ok: false, error: 'Input tidak valid' };
  const ext = IMAGE_EXT[file.type];
  if (!ext) return { ok: false, error: 'Format gambar harus JPG, PNG, atau WebP.' };
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Ukuran gambar maksimal 2 MB.' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;

  const { periodId, key } = parsed.data;
  const admin = createAdminClient();
  const store = admin.storage.from(RELEASE_BUCKET);
  const folder = releaseImageFolder(periodId);
  const { data: existing, error: listErr } = await store.list(folder);
  if (listErr) return { ok: false, error: STORAGE_OFF };
  const path = `${folder}/${key}.${ext}`;
  const { error } = await store.upload(path, file, { contentType: file.type, upsert: true });
  if (error) return { ok: false, error: 'Gagal mengunggah gambar: ' + error.message };
  // Ekstensi lama yang berbeda (mis. .png → .jpg) dihapus agar satu kunci = satu berkas.
  const stale = (existing ?? []).filter((o) => o.name !== `${key}.${ext}` && o.name.replace(/\.[^.]+$/, '') === key);
  if (stale.length) await store.remove(stale.map((o) => `${folder}/${o.name}`));

  const label = RELEASE_IMAGES.find((i) => i.key === key)?.label ?? key;
  await logHrdAction({
    action: 'laporan.release_image_upload', category: 'laporan',
    summary: `Mengunggah gambar email rilis "${label}"`, targetType: 'period', targetId: periodId, meta: { key },
  });
  revalidatePath('/admin/laporan');
  return { ok: true, msg: `Gambar "${label}" tersimpan.` };
}

/** Hapus satu gambar pendamping periode. */
export async function removeReleaseImage(input: { periodId: string; key: string }): Promise<Simple> {
  const parsed = z.object({ periodId: Id, key: ImageKey }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;

  const { periodId, key } = parsed.data;
  const store = createAdminClient().storage.from(RELEASE_BUCKET);
  const folder = releaseImageFolder(periodId);
  const { data: existing, error: listErr } = await store.list(folder);
  if (listErr) return { ok: false, error: STORAGE_OFF };
  const mine = (existing ?? []).filter((o) => o.name.replace(/\.[^.]+$/, '') === key);
  if (mine.length) {
    const { error } = await store.remove(mine.map((o) => `${folder}/${o.name}`));
    if (error) return { ok: false, error: 'Gagal menghapus gambar: ' + error.message };
  }
  await logHrdAction({
    action: 'laporan.release_image_remove', category: 'laporan',
    summary: 'Menghapus gambar email rilis', targetType: 'period', targetId: periodId, meta: { key },
  });
  revalidatePath('/admin/laporan');
  return { ok: true, msg: 'Gambar dihapus.' };
}
