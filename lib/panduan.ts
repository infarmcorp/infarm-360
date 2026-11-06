/**
 * Pemetaan panduan PDF per peran (disajikan statik dari public/panduan/ — 0 byte DB/Storage).
 * Kini hanya dipakai lampiran email Undangan (lib/email/mailer.ts). Kartu unduh di Akun Saya
 * dihapus 2026-11-06 karena isi PDF usang; kelak Akun Saya menaut ke panduan Notion per peran.
 */
export type PanduanDef = { file: string; filename: string; label: string };

/** Peran efektif → definisi PDF. HRD (role 'hrd' atau pemegang grant is_hrd_admin) → panduan HRD.
 *  Panduan 'spv' berlaku untuk Supervisor DAN Koordinator (satu file panduan-spv-koor.pdf). */
export const PANDUAN_PDF: Record<string, PanduanDef> = {
  hrd:      { file: 'panduan-hrd.pdf',       filename: 'Panduan HRD Admin - Infarm 360.pdf',              label: 'Panduan HRD Admin' },
  spv:      { file: 'panduan-spv-koor.pdf',  filename: 'Panduan Supervisor & Koordinator - Infarm 360.pdf', label: 'Panduan Supervisor & Koordinator' },
  direksi:  { file: 'panduan-direksi.pdf',   filename: 'Panduan Direksi - Infarm 360.pdf',                label: 'Panduan Direksi' },
  employee: { file: 'panduan-pegawai.pdf',   filename: 'Panduan Pegawai - Infarm 360.pdf',                label: 'Panduan Pegawai' },
};

/**
 * Peran efektif untuk memilih panduan (urutan menentukan):
 *  1) HRD (role 'hrd' atau grant is_hrd_admin) → panduan HRD;
 *  2) Supervisor ATAU pemegang grant Koordinator (is_coordinator) → panduan SPV & Koordinator;
 *  3) sisanya sesuai role (Pegawai/Direksi). Pegawai TANPA grant koordinator → panduan Pegawai.
 */
export function panduanKeyFor(role: string | null | undefined, isHrdAdmin: boolean, isCoordinator = false): string {
  if (role === 'hrd' || isHrdAdmin) return 'hrd';
  if (role === 'spv' || isCoordinator) return 'spv';
  return role ?? 'employee';
}

export function panduanFor(role: string | null | undefined, isHrdAdmin: boolean, isCoordinator = false): PanduanDef {
  return PANDUAN_PDF[panduanKeyFor(role, isHrdAdmin, isCoordinator)] ?? PANDUAN_PDF.employee;
}
