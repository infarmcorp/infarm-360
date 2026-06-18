'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { emailConfigured, sendEmail, reminderHtml } from '@/lib/email/mailer';

/**
 * Progress 360 (HRD): pantau kelengkapan pengisian + intervensi.
 *  - forceComplete: tandai penilaian (assessor→target) sebagai 'submitted' walau kosong
 *    (RLS asmt_hrd mengizinkan HRD tulis assessment mana pun). Menghentikan flag pending.
 *  - sendReminder/massReminder: email via Resend (DORMAN — aktif bila RESEND_API_KEY diset).
 */
type Result = { ok: true; msg?: string } | { ok: false; error: string };

const NOT_ACTIVE = 'Fitur email pengingat belum aktif (set SMTP_USER+SMTP_PASS [Gmail] atau RESEND_API_KEY di Vercel).';

/** Pasangan assessor→target yang BELUM submitted untuk periode aktif. */
async function pendingByAssessor(
  supabase: Awaited<ReturnType<typeof createClient>>, periodId: string,
): Promise<Map<string, string[]>> {
  const [{ data: maps }, { data: subs }] = await Promise.all([
    supabase.from('mappings').select('assessor_id, target_id').eq('period_id', periodId).eq('is_active', true),
    supabase.from('assessments').select('assessor_id, target_id').eq('period_id', periodId).eq('status', 'submitted'),
  ]);
  const done = new Set((subs ?? []).map((s) => `${s.assessor_id}|${s.target_id}`));
  const byAssessor = new Map<string, string[]>();
  (maps ?? []).forEach((m) => {
    if (done.has(`${m.assessor_id}|${m.target_id}`)) return;
    const arr = byAssessor.get(m.assessor_id) ?? [];
    arr.push(m.target_id);
    byAssessor.set(m.assessor_id, arr);
  });
  return byAssessor;
}

async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false as const, error: 'Hanya HRD yang dapat mengakses Progress 360' };
  return { ok: true as const, userId: user.id };
}

const Id = z.string().uuid();

export async function forceComplete(assessorId: string, targetId: string): Promise<Result> {
  if (!Id.safeParse(assessorId).success || !Id.safeParse(targetId).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { error } = await supabase.from('assessments').upsert(
    { period_id: ap.id, assessor_id: assessorId, target_id: targetId, status: 'submitted', submitted_at: new Date().toISOString() },
    { onConflict: 'period_id,assessor_id,target_id' },
  );
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  await logHrdAction({
    action: 'progress.force_complete', category: 'progress',
    summary: 'Memaksa-selesai satu penilaian 360° (penyesuaian manual)',
    targetType: 'assessment', meta: { assessor_id: assessorId, target_id: targetId },
  });
  revalidatePath('/admin/progress');
  revalidatePath('/admin/kepatuhan');
  return { ok: true, msg: 'Penilaian ditandai selesai.' };
}

/** Kirim email pengingat 360° ke satu penilai (daftar target yang belum ia nilai). */
export async function sendReminder(assessorId: string): Promise<Result> {
  if (!Id.safeParse(assessorId).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!emailConfigured()) return { ok: true, msg: NOT_ACTIVE };

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const pendingIds = (await pendingByAssessor(supabase, ap.id)).get(assessorId) ?? [];
  if (pendingIds.length === 0) return { ok: true, msg: 'Penilai ini sudah menyelesaikan semua penilaian.' };

  // Nama penilai & target + email penilai (email ada di auth → admin client).
  const { data: assessorEmp } = await supabase.from('employees').select('name').eq('id', assessorId).maybeSingle();
  const { data: targetEmps } = await supabase.from('employees').select('id, name').in('id', pendingIds);
  const names = (targetEmps ?? []).map((e) => e.name);

  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(assessorId);
  const email = u.user?.email;
  if (!email) return { ok: false, error: 'Penilai belum punya email akun untuk dikirimi pengingat.' };

  const send = await sendEmail({
    to: email,
    subject: `Pengingat Penilaian 360° — ${ap.label}`,
    html: reminderHtml(assessorEmp?.name ?? 'Rekan', ap.label, names),
  });
  if (!send.ok) {
    return send.reason === 'not_configured'
      ? { ok: true, msg: NOT_ACTIVE }
      : { ok: false, error: 'Gagal mengirim email' + (send.detail ? `: ${send.detail}` : '') };
  }

  await logHrdAction({
    action: 'progress.reminder', category: 'progress',
    summary: `Kirim pengingat 360° ke ${assessorEmp?.name ?? assessorId} (${pendingIds.length} penilaian)`,
    targetType: 'employee', targetId: assessorId, targetLabel: assessorEmp?.name ?? null,
    meta: { pending: pendingIds.length },
  });
  return { ok: true, msg: `Pengingat terkirim ke ${assessorEmp?.name ?? 'penilai'} (${email}).` };
}

/** Kirim pengingat ke SEMUA penilai yang masih punya tugas belum selesai. */
export async function massReminder(): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!emailConfigured()) return { ok: true, msg: NOT_ACTIVE };

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const pending = await pendingByAssessor(supabase, ap.id);
  if (pending.size === 0) return { ok: true, msg: 'Semua penilai sudah lengkap — tak ada pengingat dikirim.' };

  // Peta nama (semua employee) + peta email (auth, via admin listUsers berhalaman).
  const { data: emps } = await supabase.from('employees').select('id, name');
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.name]));

  const admin = createAdminClient();
  const emailById = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    data.users.forEach((x) => { if (x.email) emailById.set(x.id, x.email); });
    if (data.users.length < 200) break;
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const [assessorId, targetIds] of pending) {
    const email = emailById.get(assessorId);
    if (!email) { skipped++; continue; }
    const names = targetIds.map((id) => nameById.get(id) ?? '—');
    const r = await sendEmail({
      to: email,
      subject: `Pengingat Penilaian 360° — ${ap.label}`,
      html: reminderHtml(nameById.get(assessorId) ?? 'Rekan', ap.label, names),
    });
    if (r.ok) sent++; else failed++;
  }

  await logHrdAction({
    action: 'progress.mass_reminder', category: 'progress',
    summary: `Pengingat massal 360° "${ap.label}": ${sent} terkirim, ${failed} gagal, ${skipped} tanpa email`,
    targetType: 'period', targetId: ap.id, targetLabel: ap.label,
    meta: { sent, failed, skipped },
  });
  return {
    ok: true,
    msg: `Pengingat massal: ${sent} terkirim${failed ? `, ${failed} gagal` : ''}${skipped ? `, ${skipped} tanpa email` : ''}.`,
  };
}
