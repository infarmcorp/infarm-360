'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { randomBytes } from 'crypto';
import { emailConfigured, sendEmail, reminderHtml, onboardingHtml, panduanAttachment, type EmailAttachment } from '@/lib/email/mailer';

/**
 * URL dasar aplikasi untuk tautan di email — selalu domain PRODUKSI yang stabil,
 * BUKAN host tempat HRD membuka portal (mis. preview deploy/localhost). Prioritas:
 *   1) env eksplisit NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL (override penuh),
 *   2) VERCEL_PROJECT_PRODUCTION_URL (domain produksi kanonik yang diisi Vercel),
 *   3) fallback host permintaan (hanya untuk dev lokal).
 * Mengembalikan '' bila tak terdeteksi (tombol disembunyikan).
 */
async function appBaseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, '');
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod.replace(/\/+$/, '')}`;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

/**
 * Cek PDF panduan benar-benar ada di URL publik sebelum dilampirkan — cegah file
 * hilang (404) memblokir pengiriman onboarding (Resend menolak lampiran tak terjangkau).
 * `cache` opsional untuk dedup dalam loop massal (Map baru tiap pemanggilan → tak basi).
 */
async function pdfReachable(url: string, cache?: Map<string, boolean>): Promise<boolean> {
  if (cache?.has(url)) return cache.get(url)!;
  let ok = false;
  try {
    const r = await fetch(url, { method: 'HEAD' });
    ok = r.ok && (r.headers.get('content-type') ?? '').toLowerCase().includes('pdf');
  } catch { ok = false; }
  cache?.set(url, ok);
  return ok;
}

/** Lampiran panduan PDF utk penerima, atau undefined bila tak ada/ tak terjangkau. */
async function panduanFor(role: string, isHrdAdmin: boolean, base: string, cache?: Map<string, boolean>): Promise<EmailAttachment[] | undefined> {
  const att = panduanAttachment(role, isHrdAdmin, base);
  if (att && await pdfReachable(att.path, cache)) return [att];
  return undefined;
}

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
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false as const, error: 'Hanya HRD yang dapat mengakses Progress 360' };
  return { ok: true as const, userId: user.id };
}

const Id = z.string().uuid();

/**
 * Filter penerima onboarding. Selama TRIAL hanya kirim ke alamat @gmail.com (alamat
 * placeholder spt. @infarm.test akan bounce). Default = gmail-only; untuk produksi
 * penuh set env `ONBOARDING_GMAIL_ONLY=false` agar semua domain ikut.
 */
function onboardingAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  if (process.env.ONBOARDING_GMAIL_ONLY === 'false') return true;
  return /@gmail\.com$/i.test(email.trim());
}

/** Sandi awal acak unik per orang (mudah dibaca: huruf+angka, tanpa karakter ambigu). */
function genPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let body = '';
  for (let i = 0; i < 10; i++) body += alphabet[bytes[i] % alphabet.length];
  return `Inf-${body}`;
}

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

  const base = await appBaseUrl();
  const send = await sendEmail({
    to: email,
    subject: `Pengingat Penilaian 360° — ${ap.label}`,
    html: reminderHtml(assessorEmp?.name ?? 'Rekan', ap.label, names, base ? `${base}/login` : undefined),
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

  const base = await appBaseUrl();
  const link = base ? `${base}/login` : undefined;
  let sent = 0, failed = 0, skipped = 0;
  for (const [assessorId, targetIds] of pending) {
    const email = emailById.get(assessorId);
    if (!email) { skipped++; continue; }
    const names = targetIds.map((id) => nameById.get(id) ?? '—');
    const r = await sendEmail({
      to: email,
      subject: `Pengingat Penilaian 360° — ${ap.label}`,
      html: reminderHtml(nameById.get(assessorId) ?? 'Rekan', ap.label, names, link),
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

/**
 * Email "Undangan & Info Akun" (onboarding, sekali di awal periode) ke SATU pegawai.
 * Opsi A: menyetel sandi acak unik (admin.updateUserById) lalu mengirimkannya di email
 * bersama peran, email login, link, daftar belum dinilai, & panduan per peran.
 * TRIAL: hanya alamat @gmail.com (lihat onboardingAllowed) — non-gmail DILEWATI tanpa
 * mengubah sandi (cegah akun terkunci dgn sandi yang tak pernah terkirim).
 */
export async function sendOnboarding(employeeId: string): Promise<Result> {
  if (!Id.safeParse(employeeId).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!emailConfigured()) return { ok: true, msg: NOT_ACTIVE };

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: emp } = await supabase.from('employees').select('name, role, is_hrd_admin, is_active').eq('id', employeeId).maybeSingle();
  if (!emp) return { ok: false, error: 'Pegawai tidak ditemukan' };
  // Pegawai nonaktif: jangan reset sandi & kirim undangan (akun terkunci, di luar siklus).
  if (!emp.is_active) return { ok: false, error: 'Pegawai berstatus nonaktif — undangan tidak dikirim.' };

  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(employeeId);
  const email = u.user?.email;
  if (!email) return { ok: false, error: 'Pegawai belum punya email akun.' };
  if (!onboardingAllowed(email)) return { ok: true, msg: `Dilewati: ${email} bukan @gmail.com (mode trial).` };

  // Set sandi acak unik LALU kirim (urutan penting: jangan reset bila gagal kirim email).
  const password = genPassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(employeeId, { password });
  if (pwErr) return { ok: false, error: 'Gagal menyetel sandi: ' + pwErr.message };

  const pendingIds = (await pendingByAssessor(supabase, ap.id)).get(employeeId) ?? [];
  const { data: targetEmps } = pendingIds.length
    ? await supabase.from('employees').select('id, name').in('id', pendingIds) : { data: [] };
  const names = (targetEmps ?? []).map((e) => e.name);

  const base = await appBaseUrl();
  const attachments = await panduanFor(emp.role, emp.is_hrd_admin, base);
  const send = await sendEmail({
    to: email,
    subject: `Undangan & Info Akun — Infarm 360° (${ap.label})`,
    html: onboardingHtml({
      name: emp.name, role: emp.role, isHrdAdmin: emp.is_hrd_admin, email, password,
      periodLabel: ap.label, pendingNames: names, appUrl: base ? `${base}/login` : undefined,
    }),
    attachments,
  });
  if (!send.ok) {
    return send.reason === 'not_configured'
      ? { ok: true, msg: NOT_ACTIVE }
      : { ok: false, error: 'Sandi sudah diubah tapi email gagal dikirim' + (send.detail ? `: ${send.detail}` : '') };
  }

  await logHrdAction({
    action: 'progress.onboarding', category: 'progress',
    summary: `Kirim undangan & info akun ke ${emp.name} (sandi di-set ulang)`,
    targetType: 'employee', targetId: employeeId, targetLabel: emp.name,
  });
  return { ok: true, msg: `Undangan terkirim ke ${emp.name} (${email}).` };
}

/**
 * Kirim "Undangan & Info Akun" ke SEMUA pegawai aktif yang ber-email @gmail.com (trial).
 * Tiap penerima disetel sandi acak unik. Non-gmail & tanpa email DILEWATI (tak diubah).
 */
export async function massOnboarding(): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!emailConfigured()) return { ok: true, msg: NOT_ACTIVE };

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: emps } = await supabase.from('employees').select('id, name, role, is_hrd_admin').eq('is_active', true);
  const list = emps ?? [];
  const nameById = new Map(list.map((e) => [e.id, e.name]));
  const pending = await pendingByAssessor(supabase, ap.id);

  const admin = createAdminClient();
  const emailById = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    data.users.forEach((x) => { if (x.email) emailById.set(x.id, x.email); });
    if (data.users.length < 200) break;
  }

  const base = await appBaseUrl();
  const link = base ? `${base}/login` : undefined;
  const pdfCache = new Map<string, boolean>(); // dedup cek PDF per peran dalam satu run
  let sent = 0, failed = 0, skipped = 0;
  for (const emp of list) {
    const email = emailById.get(emp.id);
    if (!onboardingAllowed(email)) { skipped++; continue; } // non-gmail / tanpa email → tak diubah
    const password = genPassword();
    const { error: pwErr } = await admin.auth.admin.updateUserById(emp.id, { password });
    if (pwErr) { failed++; continue; }
    const names = (pending.get(emp.id) ?? []).map((id) => nameById.get(id) ?? '—');
    const attachments = await panduanFor(emp.role, emp.is_hrd_admin, base, pdfCache);
    const r = await sendEmail({
      to: email!,
      subject: `Undangan & Info Akun — Infarm 360° (${ap.label})`,
      html: onboardingHtml({
        name: emp.name, role: emp.role, isHrdAdmin: emp.is_hrd_admin, email: email!, password,
        periodLabel: ap.label, pendingNames: names, appUrl: link,
      }),
      attachments,
    });
    if (r.ok) sent++; else failed++;
  }

  await logHrdAction({
    action: 'progress.mass_onboarding', category: 'progress',
    summary: `Undangan massal "${ap.label}": ${sent} terkirim, ${failed} gagal, ${skipped} dilewati (non-gmail/tanpa email)`,
    targetType: 'period', targetId: ap.id, targetLabel: ap.label,
    meta: { sent, failed, skipped },
  });
  return {
    ok: true,
    msg: `Undangan massal: ${sent} terkirim${failed ? `, ${failed} gagal` : ''}${skipped ? `, ${skipped} dilewati (non-gmail)` : ''}.`,
  };
}
