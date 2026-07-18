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
 * HRD "PENUH" — pemegang izin HRD Admin yang TIDAK dibatasi `hrd_sections`. Hanya mereka yang boleh
 * membuka halaman Manajemen Akses (`/admin/akses`) & mengubah grant halaman orang lain — agar rekan
 * HRD yang aksesnya sudah dibatasi tak bisa menaikkan aksesnya sendiri. (Halaman Manajemen Akses
 * SENGAJA di luar katalog HRD_SECTIONS; gerbangnya helper ini, bukan canSection.)
 */
export function isFullHrd(m: ActorRow | null | undefined): boolean {
  if (!canAdmin(m)) return false;
  const secs = m?.hrd_sections;
  return !secs || secs.length === 0;
}

/**
 * ── AKSES HALAMAN BER-LINGKUP (RBAC data-driven, migrasi 0024) ────────────────────────────────
 * HRD Admin dapat MEMBERIKAN akses halaman tertentu ke pegawai non-HRD (SPV/Koordinator/Direksi/
 * Employee) dengan LINGKUP data (seluruh pegawai / hanya divisinya / selain divisinya). Berbeda dari
 * `hrd_sections` (yang membatasi rekan HRD ke SUBSET halaman admin) — ini MENAMBAH akses ke satu
 * halaman untuk non-HRD, lengkap dengan lingkup yang ditegakkan server (service_role berfilter).
 *
 * KATALOG SENGAJA SEMPIT: HANYA halaman yang enforcement lingkupnya SUDAH ditegakkan di server boleh
 * masuk sini. Jangan pernah menambah halaman ke katalog sebelum server benar-benar menyaring datanya
 * per lingkup — menawarkan akses yang tak tersaring = rasa aman palsu (lawan prinsip app ini).
 */
export const GRANTABLE_PAGES = ['monitor'] as const;
export type GrantablePage = (typeof GRANTABLE_PAGES)[number];

/** Label Indonesia tiap halaman yang bisa diberikan — dipakai di halaman Manajemen Akses. */
export const GRANTABLE_PAGE_LABELS: Record<GrantablePage, string> = {
  monitor: 'Monitor Kinerja Pegawai',
};

/** Lingkup data sebuah grant halaman (ditegakkan server via service_role berfilter). */
export const PAGE_SCOPES = ['all', 'own_division', 'other_divisions'] as const;
export type PageScope = (typeof PAGE_SCOPES)[number];

/** Label Indonesia tiap lingkup — dipakai di dialog pemberian akses. */
export const PAGE_SCOPE_LABELS: Record<PageScope, string> = {
  all: 'Seluruh pegawai',
  own_division: 'Hanya divisinya',
  other_divisions: 'Selain divisinya',
};

/** Satu baris grant halaman (subset kolom page_grants yang dibutuhkan untuk otorisasi). */
export type PageGrantRow = { section: string; scope: string };

/**
 * Lingkup yang diberikan kepada pemegang grant untuk halaman `page`, atau `null` bila tak diberi.
 * Dipakai di guard halaman & filter menu. Nilai scope tak dikenal diperlakukan sbagai tak-diberi
 * (aman default-tutup). HRD penuh TIDAK lewat jalur ini — mereka pakai canSection.
 */
export function grantedScope(grants: PageGrantRow[] | null | undefined, page: GrantablePage): PageScope | null {
  const g = grants?.find((x) => x.section === page);
  if (!g) return null;
  return (PAGE_SCOPES as readonly string[]).includes(g.scope) ? (g.scope as PageScope) : null;
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
