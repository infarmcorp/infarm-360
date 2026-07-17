/**
 * Otorisasi peran — pemisahan "izin HRD Admin" dari posisi dasar (`role`).
 *
 * "HRD Admin" = KAPABILITAS (boleh mengoperasikan aplikasi), bukan jabatan. Seseorang
 * bisa berposisi `employee`/`spv` TAPI diberi grant `is_hrd_admin` (migrasi 0013).
 * Gunakan `canAdmin()` untuk gerbang fitur HRD, BUKAN `role === 'hrd'` mentah —
 * agar pemegang grant berposisi non-HRD tetap lolos. Selaras dengan RLS `is_hrd()`
 * yang juga = `role='hrd' OR is_hrd_admin`.
 */
export type ActorRow = { role?: string | null; is_hrd_admin?: boolean | null; is_cross_reviewer?: boolean | null; is_coordinator?: boolean | null; hrd_sections?: string[] | null };

/** Boleh mengoperasikan fitur HRD Admin? = posisi HRD ATAU diberi grant is_hrd_admin. */
export function canAdmin(m: ActorRow | null | undefined): boolean {
  return m?.role === 'hrd' || !!m?.is_hrd_admin;
}

/**
 * Katalog TETAP bagian HRD (untuk akses granular per-halaman, migrasi 0023). Bukan URL bebas —
 * daftar baku yang dicentang HRD Admin. Setiap kunci memetakan ke satu halaman/menu admin.
 */
export const HRD_SECTIONS = [
  'pegawai', 'struktur', 'periode', 'pemetaan', 'pertanyaan', 'bobot',
  'progress', 'kepatuhan', 'laporan', 'dashboard', 'ekspor', 'audit',
] as const;
export type HrdSection = (typeof HRD_SECTIONS)[number];

/** Label Indonesia tiap bagian — dipakai di dialog "Atur Akses" Kelola Pegawai. */
export const HRD_SECTION_LABELS: Record<HrdSection, string> = {
  pegawai: 'Kelola Pegawai',
  struktur: 'Struktur Organisasi',
  periode: 'Kelola Periode',
  pemetaan: 'Pemetaan 360°',
  pertanyaan: 'Kelola Pertanyaan',
  bobot: 'Bobot & Kalkulasi 360°',
  progress: 'Progress 360°',
  kepatuhan: 'Flag Kepatuhan',
  laporan: 'Review Hasil Akhir',
  dashboard: 'Dashboard Organisasi',
  ekspor: 'Ekspor Dataset',
  audit: 'Log Aktivitas & Audit KPI',
};

/**
 * Boleh membuka bagian admin `section`? (akses HRD granular, Jalur A / migrasi 0023).
 *   - Bukan HRD (canAdmin false) → selalu false.
 *   - `hrd_sections` NULL / kosong → AKSES PENUH (semua bagian) — perilaku lama.
 *   - berisi daftar → hanya bagian yang tercantum.
 * ⚠️ Ini pembatasan tingkat MENU + guard halaman (rekan HRD tepercaya), BUKAN batas RLS:
 * pemegang grant tetap is_hrd() penuh di database. Batas data nyata = Jalur B (ditunda).
 */
export function canSection(m: ActorRow | null | undefined, section: HrdSection): boolean {
  if (!canAdmin(m)) return false;
  const secs = m?.hrd_sections;
  if (!secs || secs.length === 0) return true; // penuh (default)
  return secs.includes(section);
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

/**
 * Apakah `dept` termasuk DIVISI HRD? Grant sensitif "HRD Admin" & "Peninjau Lintas Divisi"
 * hanya boleh diaktifkan untuk pegawai divisi HRD (kebijakan 2026-07-15) — bukan seluruh
 * pegawai. Pengenal: `dept` diawali "HRD" (mis. "HRD-GA"); tak ada divisi lain berawalan HRD.
 * Dipakai di UI (sembunyikan tombol) & server (tolak grant) Kelola Pegawai.
 */
export function isHrdDept(dept: string | null | undefined): boolean {
  return !!dept && dept.trim().toUpperCase().startsWith('HRD');
}
