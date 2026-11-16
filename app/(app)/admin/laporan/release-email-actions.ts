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
import {
  loadReleasePeriod, releaseImageFolder,
  RELEASE_EMAIL_ACTION, RELEASE_BUCKET, RELEASE_IMAGES,
} from '@/lib/report-release';
import { deliverReleaseEmails, releaseImageParts, type ReleasePerson } from '@/lib/release-delivery';
import { ReleaseContentSchema, sendAtError, fmtScheduleWib } from '@/lib/release-schedule';
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
const NOT_ACTIVE = 'Fitur email belum aktif. Hubungi admin aplikasi untuk mengaktifkannya.';
const STORAGE_OFF = 'Penyimpanan gambar belum aktif. Hubungi admin aplikasi untuk mengaktifkannya.';

const Content = ReleaseContentSchema;
const Id = z.string().uuid();
const MAX_SCHEDULE_RECIPIENTS = 500;
const SCHEDULE_OFF = 'Fitur jadwal belum aktif. Hubungi admin aplikasi untuk mengaktifkannya.';
const ImageKey = z.enum(RELEASE_IMAGES.map((i) => i.key) as [string, ...string[]]);

export type ReleaseSendResult =
  | { ok: true; sent: string[]; skipped: ReleasePerson[]; failed: ReleasePerson[] }
  | { ok: false; error: string };
type Simple = { ok: true; msg: string } | { ok: false; error: string };

async function requireHrdAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir. Silakan masuk kembali.' };
  const { data: me } = await supabase.from('employees').select('name, role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  if (!canSection(me, 'laporan') || jar.get('hrd_mode')?.value !== 'admin') {
    return { ok: false as const, error: 'Hanya HRD (Mode Admin) yang dapat mengirim email rilis laporan' };
  }
  return { ok: true as const, userId: user.id, userName: me?.name ?? null };
}

/** Kirim email rilis ke sekelompok pegawai (≤ MAX_BATCH per panggilan). Inti kirim = lib/release-delivery. */
export async function sendReleaseEmails(input: { periodId: string; employeeIds: string[]; content: ReleaseContent }): Promise<ReleaseSendResult> {
  const parsed = z.object({ periodId: Id, employeeIds: z.array(Id).min(1).max(MAX_BATCH), content: Content }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Isian tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;
  if (!emailConfigured()) return { ok: false, error: NOT_ACTIVE };

  const { periodId, content } = parsed.data;
  const ids = [...new Set(parsed.data.employeeIds)];
  const admin = createAdminClient();
  const period = await loadReleasePeriod(admin, periodId);
  if (!period) return { ok: false, error: 'Periode tidak ditemukan' };

  const base = await appBaseUrl();
  const res = await deliverReleaseEmails(admin, { period, ids, content, appUrl: base ? `${base}/laporan` : undefined });
  if (!res.ok) return res;
  const { sent, skipped, failed } = res;

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
  if (!parsed.success) return { ok: false, error: 'Isian tidak valid' };
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
  if (!parsed.success || !(file instanceof File)) return { ok: false, error: 'Isian tidak valid' };
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
  if (!parsed.success) return { ok: false, error: 'Isian tidak valid' };
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

// ── Jadwal Email Rilis (migrasi 0053, lib/release-schedule.ts) ───────────────────────────────────
// Penerima & isi DIKUNCI saat menjadwalkan (keputusan pemilik 2026-10-16). Ubah hanya selama belum mulai
// terkirim; Batalkan menghentikan sisa yang belum terkirim. Pengiriman dijalankan route cron.

const ScheduleInput = z.object({
  sendAt: z.string().min(10).max(40),
  employeeIds: z.array(Id).min(1).max(MAX_SCHEDULE_RECIPIENTS),
  content: Content,
});

/** Penerima terkunci = pegawai yang benar-benar ada (sisanya dicek ulang saat jam kirim). */
async function checkRecipients(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  const { data, error } = await admin.from('employees').select('id').in('id', ids);
  if (error) return 'Gagal membaca data pegawai: ' + error.message;
  if ((data ?? []).length !== ids.length) return 'Sebagian penerima tidak ditemukan — muat ulang halaman lalu coba lagi.';
  return null;
}

/** Buat jadwal kirim email rilis untuk satu periode (maks. satu jadwal aktif per periode). */
export async function scheduleReleaseEmail(input: { periodId: string; sendAt: string; employeeIds: string[]; content: ReleaseContent }): Promise<Simple> {
  const parsed = ScheduleInput.extend({ periodId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Isian tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;
  if (!emailConfigured()) return { ok: false, error: NOT_ACTIVE };
  const { periodId, sendAt, content } = parsed.data;
  const ids = [...new Set(parsed.data.employeeIds)];
  const timeErr = sendAtError(sendAt, Date.now());
  if (timeErr) return { ok: false, error: timeErr };

  const admin = createAdminClient();
  const period = await loadReleasePeriod(admin, periodId);
  if (!period) return { ok: false, error: 'Periode tidak ditemukan' };
  const recErr = await checkRecipients(admin, ids);
  if (recErr) return { ok: false, error: recErr };

  const { error } = await admin.from('release_email_schedules').insert({
    period_id: periodId, send_at: new Date(sendAt).toISOString(), content, recipient_ids: ids,
    created_by: auth.userId, created_by_name: auth.userName,
  });
  if (error) {
    if (tableMissing(error)) return { ok: false, error: SCHEDULE_OFF };
    if (error.code === '23505') return { ok: false, error: 'Sudah ada jadwal aktif untuk periode ini — ubah atau batalkan dulu.' };
    return { ok: false, error: 'Gagal menyimpan jadwal: ' + error.message };
  }
  await logHrdAction({
    action: 'laporan.release_schedule_create', category: 'laporan',
    summary: `Menjadwalkan email rilis laporan "${period.label}" ke ${ids.length} pegawai pada ${fmtScheduleWib(sendAt)}`,
    targetType: 'period', targetId: periodId, targetLabel: period.label, meta: { send_at: sendAt, recipients: ids.length },
  });
  revalidatePath('/admin/laporan');
  return { ok: true, msg: `Terjadwal: ${fmtScheduleWib(sendAt)} ke ${ids.length} pegawai.` };
}

/** Ubah jam/penerima/isi jadwal — hanya selama BELUM mulai terkirim. */
export async function updateReleaseSchedule(input: { id: string; sendAt: string; employeeIds: string[]; content: ReleaseContent }): Promise<Simple> {
  const parsed = ScheduleInput.extend({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Isian tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;
  const { id, sendAt, content } = parsed.data;
  const ids = [...new Set(parsed.data.employeeIds)];
  const timeErr = sendAtError(sendAt, Date.now());
  if (timeErr) return { ok: false, error: timeErr };

  const admin = createAdminClient();
  const recErr = await checkRecipients(admin, ids);
  if (recErr) return { ok: false, error: recErr };
  // Atomik: hanya jadwal yang masih menunggu & belum ada yang terkirim (started_at kosong, sent_ids kosong).
  const { data, error } = await admin.from('release_email_schedules')
    .update({ send_at: new Date(sendAt).toISOString(), content, recipient_ids: ids, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'scheduled').is('started_at', null).filter('sent_ids', 'eq', '{}')
    .select('period_id');
  if (error) return { ok: false, error: tableMissing(error) ? SCHEDULE_OFF : 'Gagal mengubah jadwal: ' + error.message };
  if (!data?.length) return { ok: false, error: 'Jadwal ini sudah berjalan, selesai, atau dibatalkan, jadi tidak bisa diubah. Muat ulang halaman.' };
  await logHrdAction({
    action: 'laporan.release_schedule_update', category: 'laporan',
    summary: `Mengubah jadwal email rilis laporan: ${ids.length} pegawai pada ${fmtScheduleWib(sendAt)}`,
    targetType: 'period', targetId: data[0].period_id, meta: { schedule_id: id, send_at: sendAt, recipients: ids.length },
  });
  revalidatePath('/admin/laporan');
  return { ok: true, msg: `Jadwal diubah: ${fmtScheduleWib(sendAt)} ke ${ids.length} pegawai.` };
}

/** Batalkan jadwal yang masih menunggu (pegawai yang sudah terkirim tetap tercatat terkirim). */
export async function cancelReleaseSchedule(input: { id: string }): Promise<Simple> {
  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Isian tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const { data, error } = await admin.from('release_email_schedules')
    .update({ status: 'cancelled', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id).eq('status', 'scheduled')
    .select('period_id, sent_ids');
  if (error) return { ok: false, error: tableMissing(error) ? SCHEDULE_OFF : 'Gagal membatalkan jadwal: ' + error.message };
  if (!data?.length) return { ok: false, error: 'Jadwal sedang dikirim, sudah selesai, atau sudah dibatalkan. Muat ulang halaman.' };
  const already = data[0].sent_ids?.length ?? 0;
  await logHrdAction({
    action: 'laporan.release_schedule_cancel', category: 'laporan',
    summary: `Membatalkan jadwal email rilis laporan${already ? ` (${already} pegawai sudah terlanjur dikirimi)` : ''}`,
    targetType: 'period', targetId: data[0].period_id, meta: { schedule_id: parsed.data.id, already_sent: already },
  });
  revalidatePath('/admin/laporan');
  return { ok: true, msg: already ? `Jadwal dibatalkan. ${already} pegawai sudah terlanjur dikirimi sebelumnya.` : 'Jadwal dibatalkan.' };
}
