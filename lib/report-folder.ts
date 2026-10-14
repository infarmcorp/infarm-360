import { z } from 'zod';

/**
 * Folder Laporan (Google Drive) per pegawai — migrasi 0050 `employee_report_folders`.
 * Tombol "Unduh PDF" di Laporan Hasil Saya membuka folder ini (PDF semua kuartal, disiapkan HRD).
 */

/** Tautan folder/berkas Google Drive yang sah: https + host persis drive.google.com. */
export function isDriveUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === 'drive.google.com';
  } catch {
    return false;
  }
}

/** Input URL dari form: kosong → null (hapus tautan); selain itu wajib tautan Google Drive. */
export const ReportFolderUrl = z.string().trim().max(500, 'Tautan terlalu panjang (maks. 500 karakter)')
  .refine((v) => v === '' || isDriveUrl(v), 'Tautan harus folder Google Drive (https://drive.google.com/…)')
  .transform((v) => (v ? v : null));

/** Tabel belum ada — migrasi 0050 belum diterapkan di database ini. */
export const tableMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /could not find the table|does not exist/i.test(e.message ?? ''));
