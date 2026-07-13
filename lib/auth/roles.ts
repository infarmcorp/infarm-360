/**
 * Otorisasi peran — pemisahan "izin HRD Admin" dari posisi dasar (`role`).
 *
 * "HRD Admin" = KAPABILITAS (boleh mengoperasikan aplikasi), bukan jabatan. Seseorang
 * bisa berposisi `employee`/`spv` TAPI diberi grant `is_hrd_admin` (migrasi 0013).
 * Gunakan `canAdmin()` untuk gerbang fitur HRD, BUKAN `role === 'hrd'` mentah —
 * agar pemegang grant berposisi non-HRD tetap lolos. Selaras dengan RLS `is_hrd()`
 * yang juga = `role='hrd' OR is_hrd_admin`.
 */
export type ActorRow = { role?: string | null; is_hrd_admin?: boolean | null; is_cross_reviewer?: boolean | null; is_coordinator?: boolean | null };

/** Boleh mengoperasikan fitur HRD Admin? = posisi HRD ATAU diberi grant is_hrd_admin. */
export function canAdmin(m: ActorRow | null | undefined): boolean {
  return m?.role === 'hrd' || !!m?.is_hrd_admin;
}

/**
 * Boleh meninjau Hasil Akhir LINTAS DIVISI (selain divisinya sendiri)? = grant
 * `is_cross_reviewer` (migrasi 0018). Kapabilitas SEMPIT & terpisah dari HRD Admin:
 * hanya membuka jalur /peninjau (lihat + tulis Ringkasan Aspek untuk divisi lain),
 * BUKAN akses HRD penuh. Penegakan lingkup "divisi ≠ divisi sendiri" ada di server
 * (lib/report.ts loadCrossDivisionReport). Tidak memengaruhi is_hrd()/RLS.
 */
export function canCrossReview(m: ActorRow | null | undefined): boolean {
  return !!m?.is_cross_reviewer;
}

/**
 * Boleh MELIHAT "Laporan Kinerja Tim" sebagai Koordinator? = grant `is_coordinator`
 * (migrasi 0021). Kapabilitas SEMPIT & lihat-saja: membuka Laporan Kinerja Tim untuk
 * DAFTAR pegawai eksplisit (coordinator_team_members) yang dinaunginya — TANPA input KPI/
 * ACC/finalisasi & TANPA memengaruhi 360°. Seperti Peninjau, grant ini TIDAK menyalakan
 * is_hrd()/is_my_member; lingkup ditegakkan di server (service_role) + L3 dibuang.
 */
export function canCoordinate(m: ActorRow | null | undefined): boolean {
  return !!m?.is_coordinator;
}
