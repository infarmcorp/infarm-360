import type { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, type EmailAttachment } from '@/lib/email/mailer';
import { releaseEmailHtml, releaseSubject, type ReleaseContent, type ReleaseImageSrc, type ReleasePeriod } from '@/lib/email/release-template';
import { loadReleaseImages, RELEASE_IMAGES } from '@/lib/report-release';
import { tableMissing } from '@/lib/report-folder';

/**
 * INTI pengiriman Email Rilis Laporan — dipakai bersama tombol manual (Server Action, HRD Mode Admin)
 * dan jadwal (route cron). Pemanggil WAJIB sudah lolos otorisasi; fungsi ini membaca via service_role.
 * Syarat penerima ditegakkan DI SINI (sumber tunggal): laporan periode itu FINAL + Folder Laporan terisi +
 * punya email akun. Yang tak memenuhi dilewati beserta alasan (bukan error). Tidak menulis log — pemanggil
 * mencatat (aksi RELEASE_EMAIL_ACTION, `meta.sent_ids`) agar "sudah dikirimi" terhitung lintas jalur.
 */
type Db = ReturnType<typeof createAdminClient>;
export type ReleasePerson = { id: string; name: string; reason: string };
export type DeliveryResult = { sent: string[]; skipped: ReleasePerson[]; failed: ReleasePerson[] };

/**
 * Gambar periode → lampiran inline (CID) + sumber <img> untuk template. Gambar yang URL publiknya tak
 * terjangkau dilewati (cek sekali per gelombang) agar satu gambar rusak tak menggagalkan semua email.
 */
export async function releaseImageParts(db: Db, periodId: string) {
  const { images } = await loadReleaseImages(db, periodId);
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

/**
 * Kirim email rilis ke `ids` (urutan dipertahankan). `alreadySent` (opsional) = pegawai yang sudah pernah
 * dikirimi periode ini → dilewati (dipakai jadwal; tombol manual boleh kirim ulang dengan sengaja).
 */
export async function deliverReleaseEmails(db: Db, args: {
  period: ReleasePeriod & { id: string }; ids: string[]; content: ReleaseContent; appUrl?: string; alreadySent?: Set<string>;
}): Promise<({ ok: true } & DeliveryResult) | { ok: false; error: string }> {
  const { period, content, appUrl, alreadySent } = args;
  const ids = [...new Set(args.ids)];
  const [{ data: emps }, { data: reports }, folderRes] = await Promise.all([
    db.from('employees').select('id, name').in('id', ids),
    db.from('final_reports').select('employee_id').eq('period_id', period.id).eq('status', 'finalized').in('employee_id', ids),
    db.from('employee_report_folders').select('employee_id, url').in('employee_id', ids),
  ]);
  if (folderRes.error && !tableMissing(folderRes.error)) return { ok: false, error: 'Gagal membaca Folder Laporan: ' + folderRes.error.message };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.name]));
  const finalSet = new Set((reports ?? []).map((r) => r.employee_id));
  const folderSet = new Set((folderRes.data ?? []).filter((f) => f.url).map((f) => f.employee_id));

  const { attachments, src } = await releaseImageParts(db, period.id);
  const sent: string[] = []; const skipped: ReleasePerson[] = []; const failed: ReleasePerson[] = [];
  for (const id of ids) {
    const name = nameById.get(id) ?? '—';
    if (!nameById.has(id)) { skipped.push({ id, name, reason: 'pegawai tidak ditemukan' }); continue; }
    if (alreadySent?.has(id)) { skipped.push({ id, name, reason: 'sudah pernah dikirimi email rilis periode ini' }); continue; }
    if (!finalSet.has(id)) { skipped.push({ id, name, reason: 'laporan belum Final' }); continue; }
    if (!folderSet.has(id)) { skipped.push({ id, name, reason: 'Folder Laporan (PDF) belum diisi' }); continue; }
    const { data: u } = await db.auth.admin.getUserById(id);
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
  return { ok: true, sent, skipped, failed };
}
