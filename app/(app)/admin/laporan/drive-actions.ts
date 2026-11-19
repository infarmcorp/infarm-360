'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import { loadPaPeriods, paInputFor } from '@/lib/pdf/pa-load';
import { renderPaReport } from '@/lib/pdf/pa-report';
import { pdfFileName } from '@/lib/pa-pdf';
import { cleanDriveName, driveFoldersFor, planFileOps } from '@/lib/drive-layout';
import { loadDriveTeams } from '@/lib/drive/layout-server';
import {
  checkRootFolder, driveConfigured, driveRootFolderId, ensureFolderPath, findPaFiles,
  replacePaPdf, trashFile, uploadPaPdf, DriveError,
} from '@/lib/drive/google-drive';

/**
 * Transfer PDF ke Drive (Review & Finalisasi, keputusan pemilik 2026-11-18): PDF Pegawai semua laporan FINAL
 * periode itu dibuat di server lalu diunggah ke Shared Drive, tersusun per divisi lalu per atasan langsung
 * (lib/drive-layout.ts). Folder diserahkan HRD ke koordinator/SPV DI LUAR aplikasi.
 *  - Hanya HRD (bagian Laporan) di Mode Admin — sama dengan Email Rilis. Pemegang grant Review tidak.
 *  - Isi PDF = PDF Pegawai (skor + ringkasan HRD), tanpa komentar mentah & tanpa nama penilai.
 *  - Per gelombang kecil dari klien (MAX_BATCH) agar tak melewati batas waktu server & progres terlihat.
 *  - Susunan folder dihitung ulang di server (klien hanya mengirim id) — tak percaya jalur dari browser.
 *  - Transfer ulang: berkas lama (penanda appProperties) ditimpa / dipindah bila atasan berganti / dibuang ke Sampah.
 */

const MAX_BATCH = 5;
const Id = z.string().uuid();
const NOT_ACTIVE = 'Transfer ke Drive belum aktif. Hubungi admin aplikasi untuk mengaktifkannya.';

export type DriveTransferItem = { id: string; name: string; reason: string };
export type DriveTransferResult =
  | { ok: true; done: { id: string; name: string; folders: string[] }[]; skipped: DriveTransferItem[]; failed: DriveTransferItem[] }
  | { ok: false; error: string };

async function requireHrdAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir. Silakan login ulang.' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  const jar = await cookies();
  if (!canSection(me, 'laporan') || jar.get('hrd_mode')?.value !== 'admin') {
    return { ok: false as const, error: 'Hanya HRD (Mode Admin) yang dapat mentransfer PDF ke Drive.' };
  }
  return { ok: true as const };
}

/** Transfer PDF sekelompok pegawai (≤ MAX_BATCH per panggilan). */
export async function transferPdfsToDrive(input: { periodId: string; employeeIds: string[] }): Promise<DriveTransferResult> {
  const parsed = z.object({ periodId: Id, employeeIds: z.array(Id).min(1).max(MAX_BATCH) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const auth = await requireHrdAdmin();
  if (!auth.ok) return auth;
  const rootId = driveRootFolderId();
  if (!driveConfigured() || !rootId) return { ok: false, error: NOT_ACTIVE };

  const admin = createAdminClient();
  const { periodId } = parsed.data;
  const ids = [...new Set(parsed.data.employeeIds)];
  const { periods } = await loadPaPeriods(admin);
  const ap = periods.find((p) => p.id === periodId);
  if (!ap) return { ok: false, error: 'Periode tidak ditemukan' };

  try {
    await checkRootFolder(rootId);
  } catch (e) {
    return { ok: false, error: e instanceof DriveError ? e.message : 'Gagal menghubungi Google Drive.' };
  }

  const [{ data: emps }, { data: reps }, teams] = await Promise.all([
    admin.from('employees').select('id, name, dept, role').in('id', ids),
    admin.from('final_reports').select('employee_id, status').eq('period_id', periodId).in('employee_id', ids),
    loadDriveTeams(admin),
  ]);
  const empBy = new Map((emps ?? []).map((e) => [e.id, e]));
  const finalSet = new Set((reps ?? []).filter((r) => r.status === 'finalized').map((r) => r.employee_id));

  const done: { id: string; name: string; folders: string[] }[] = [];
  const skipped: DriveTransferItem[] = [];
  const failed: DriveTransferItem[] = [];
  const folderCache = new Map<string, string>();
  const periodFolder = cleanDriveName(ap.label) || ap.id;

  for (const id of ids) {
    const emp = empBy.get(id);
    if (!emp) { skipped.push({ id, name: id, reason: 'pegawai tidak ditemukan' }); continue; }
    if (!finalSet.has(id)) { skipped.push({ id, name: emp.name, reason: 'laporan belum Final' }); continue; }
    try {
      const built = await paInputFor(admin, id, ap);
      if (!built) { skipped.push({ id, name: emp.name, reason: 'data laporan tidak ditemukan' }); continue; }
      const pdf = await renderPaReport(built.input, built.settings);
      const fileName = pdfFileName(built.input.dept, built.input.name, ap.label);
      const paths = driveFoldersFor({ id, dept: emp.dept, role: emp.role }, teams);
      const folderIds: string[] = [];
      for (const p of paths) folderIds.push(await ensureFolderPath(rootId, [periodFolder, ...p], folderCache));

      const ops = planFileOps(await findPaFiles(periodId, id), folderIds);
      for (const u of ops.update) {
        await replacePaPdf(u.fileId, fileName, pdf, u.move ? { folderId: u.folderId, fromParent: u.fromParent } : null);
      }
      for (const folderId of ops.create) await uploadPaPdf(folderId, fileName, pdf, { periodId, employeeId: id });
      for (const fileId of ops.trash) await trashFile(fileId);
      done.push({ id, name: emp.name, folders: paths.map((p) => p.join(' / ')) });
    } catch (e) {
      failed.push({ id, name: emp.name, reason: e instanceof DriveError ? e.message : (e as Error)?.message || 'gagal' });
    }
  }

  if (done.length || failed.length) {
    await logHrdAction({
      action: 'report.drive_transfer', category: 'laporan',
      summary: `Transfer PDF ke Drive "${ap.label}": ${done.length} berhasil, ${failed.length} gagal, ${skipped.length} dilewati`,
      targetType: 'period', targetId: periodId, targetLabel: ap.label,
      meta: { done: done.map((d) => d.id), failed: failed.map((f) => f.id), skipped: skipped.map((s) => s.id) },
    });
  }
  return { ok: true, done, skipped, failed };
}
