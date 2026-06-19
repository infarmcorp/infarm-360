/**
 * Otorisasi peran — pemisahan "izin HRD Admin" dari posisi dasar (`role`).
 *
 * "HRD Admin" = KAPABILITAS (boleh mengoperasikan aplikasi), bukan jabatan. Seseorang
 * bisa berposisi `employee`/`spv` TAPI diberi grant `is_hrd_admin` (migrasi 0013).
 * Gunakan `canAdmin()` untuk gerbang fitur HRD, BUKAN `role === 'hrd'` mentah —
 * agar pemegang grant berposisi non-HRD tetap lolos. Selaras dengan RLS `is_hrd()`
 * yang juga = `role='hrd' OR is_hrd_admin`.
 */
export type ActorRow = { role?: string | null; is_hrd_admin?: boolean | null };

/** Boleh mengoperasikan fitur HRD Admin? = posisi HRD ATAU diberi grant is_hrd_admin. */
export function canAdmin(m: ActorRow | null | undefined): boolean {
  return m?.role === 'hrd' || !!m?.is_hrd_admin;
}
