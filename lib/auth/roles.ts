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
  'progress', 'kepatuhan', 'laporan', 'suksesi', 'dashboard', 'ekspor', 'audit',
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
  suksesi: 'Promosi & Suksesi',
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
export const GRANTABLE_PAGES = ['monitor', 'review', 'dashboard', 'struktur', 'progress', 'kepatuhan', 'kpi'] as const;
export type GrantablePage = (typeof GRANTABLE_PAGES)[number];

/** Label Indonesia tiap halaman yang bisa diberikan — dipakai di halaman Manajemen Akses. */
export const GRANTABLE_PAGE_LABELS: Record<GrantablePage, string> = {
  monitor: 'Monitor Kinerja Pegawai',
  review: 'Review Hasil Akhir',
  dashboard: 'Dashboard Organisasi',
  struktur: 'Struktur Organisasi',
  progress: 'Progress 360 Feedback',
  kepatuhan: 'Flag Kepatuhan',
  kpi: 'Monitoring & Audit KPI',
};

/**
 * Target PERAN untuk pemberian akses MASSAL (Fase 2). Bukan role DB murni: 'koordinator' = pemegang
 * grant `is_coordinator`; 'pegawai' = role 'employee'. Pemberian ke peran = MATERIALISASI ke anggota
 * SAAT INI (Pendekatan B; pegawai baru TIDAK otomatis ikut). Dipakai server (validasi) & klien (UI).
 */
export const GRANT_ROLE_TARGETS = ['spv', 'koordinator', 'pegawai', 'direksi'] as const;
export type GrantRoleTarget = (typeof GRANT_ROLE_TARGETS)[number];
export const GRANT_ROLE_TARGET_LABELS: Record<GrantRoleTarget, string> = {
  spv: 'SPV', koordinator: 'Koordinator', pegawai: 'Pegawai', direksi: 'Direksi',
};

/**
 * Jenis halaman (menentukan apakah opsi EDIT relevan):
 *   'pemantauan'    → selalu LIHAT-saja (mengabaikan can_edit).
 *   'administrator' → dapat-edit: grant punya flag boleh-edit / hanya-lihat.
 *
 * ⚠️ 'review' (Review Hasil Akhir) TAHAP 1 = LIHAT-SAJA berlingkup (finalisasi tetap HRD).
 * Kemampuan EDIT/finalisasi untuk non-HRD = TAHAP 2 (guard tulis service_role per-aksi) — belum
 * diaktifkan. Konsol belum menampilkan toggle edit & setPageGrant menyetel can_edit=false secara
 * efektif, jadi tak ada rasa aman palsu meski jenisnya 'administrator'.
 */
export type PageKind = 'pemantauan' | 'administrator';
export const GRANTABLE_PAGE_KIND: Record<GrantablePage, PageKind> = {
  monitor: 'pemantauan',
  review: 'administrator',
  dashboard: 'pemantauan',
  struktur: 'pemantauan',
  progress: 'pemantauan',
  kepatuhan: 'pemantauan',
  kpi: 'pemantauan',
};

/**
 * Lingkup data sebuah grant halaman (ditegakkan server via service_role berfilter).
 *   'all' / 'own_division' / 'other_divisions' → berbasis DIVISI (deptScopeFilter).
 *   'self' → berbasis ID: HANYA catatan pemegang grant sendiri (disaring `eq('id', <pemegang>)` di
 *            tiap halaman target; helper dept FAIL-CLOSED untuk 'self' agar tak bocor bila lupa cabang).
 *   'coordinator_team' → berbasis ID: HANYA anggota `coordinator_team_members` milik pemegang (relatif
 *            per-pemegang). Dipakai saat memberi akses ke PERAN Koordinator (Fase 2): tiap koordinator
 *            melihat TIM NAUNGANNYA sendiri, bukan seluruh divisi. Helper dept juga FAIL-CLOSED (bukan
 *            berbasis divisi) → penegakan nyata lewat `employeeInScopes(..., teamIds)`.
 */
export const PAGE_SCOPES = ['all', 'own_division', 'other_divisions', 'self', 'coordinator_team'] as const;
export type PageScope = (typeof PAGE_SCOPES)[number];

/** Label Indonesia tiap lingkup — dipakai di dialog pemberian akses. */
export const PAGE_SCOPE_LABELS: Record<PageScope, string> = {
  all: 'Seluruh pegawai',
  own_division: 'Hanya divisinya',
  other_divisions: 'Selain divisinya',
  self: 'Diri sendiri',
  coordinator_team: 'Tim naungannya',
};

/**
 * Satu baris grant halaman (subset kolom page_grants untuk otorisasi). `scopes` = lingkup MULTI
 * (migrasi 0028); `scope` = kolom tunggal LAMA (fallback backward-compat bila `scopes` kosong).
 */
export type PageGrantRow = { section: string; scope?: string | null; scopes?: string[] | null; can_edit?: boolean; can_finalize?: boolean };

/** Daftar lingkup SAH sebuah baris grant (utamakan `scopes[]`; fallback ke `scope` tunggal lama). */
function scopesOf(g: PageGrantRow): PageScope[] {
  const raw = (g.scopes && g.scopes.length ? g.scopes : (g.scope ? [g.scope] : []));
  return raw.filter((s): s is PageScope => (PAGE_SCOPES as readonly string[]).includes(s));
}

/**
 * Akses lengkap (DAFTAR lingkup + boleh-edit) untuk halaman `page`, atau `null` bila tak diberi /
 * tak ada lingkup sah. Sumber kebenaran grant halaman. `canEdit`/`canFinalize` hanya bermakna untuk
 * halaman jenis 'administrator'; 'pemantauan' selalu lihat-saja. HRD penuh TIDAK lewat jalur ini
 * (pakai canSection). Tiga tingkat: Lihat (edit false) · Meringkas (edit true, finalize false) ·
 * Finalisasi (edit true, finalize true). `canFinalize` selalu menyiratkan `canEdit`.
 */
export function grantedAccess(grants: PageGrantRow[] | null | undefined, page: GrantablePage): { scopes: PageScope[]; canEdit: boolean; canFinalize: boolean } | null {
  const g = grants?.find((x) => x.section === page);
  if (!g) return null;
  const scopes = scopesOf(g);
  if (!scopes.length) return null;
  const canEdit = !!g.can_edit;
  // canFinalize menyiratkan canEdit (pertahanan bila data tak konsisten).
  return { scopes, canEdit, canFinalize: canEdit && !!g.can_finalize };
}

/** Konvenien: lingkup PERTAMA yang diberikan untuk `page` (null bila tak ada). Untuk pemakai yang
 *  hanya butuh satu nilai indikatif; penegakan sebenarnya pakai `grantedAccess().scopes` (multi). */
export function grantedScope(grants: PageGrantRow[] | null | undefined, page: GrantablePage): PageScope | null {
  return grantedAccess(grants, page)?.scopes[0] ?? null;
}

/**
 * ── PENYARINGAN LINGKUP DIVISI (dipakai halaman Monitor + diuji) ───────────────────────────────
 * Logika murni yang menerjemahkan lingkup grant → daftar divisi boleh-pilih, divisi terpilih yang
 * sah, dan rencana filter (cerminan query server eq/neq). Diekstrak agar bisa DIUJI unit tanpa DB —
 * mencegah regresi seperti "own_division/other_divisions bocor ke semua pegawai".
 */

/** Divisi yang boleh DIPILIH pemegang lingkup (untuk dropdown filter). */
export function allowedDeptsFor(depts: string[], scope: PageScope, ownDept: string): string[] {
  if (scope === 'self' || scope === 'coordinator_team') return []; // berbasis ID, bukan divisi → tak ada pilihan divisi
  if (scope === 'own_division') return depts.filter((d) => d === ownDept);
  if (scope === 'other_divisions') return depts.filter((d) => d !== ownDept);
  return depts; // 'all'
}

/**
 * Divisi terpilih yang SAH. `deptParam` (dari ?dept=) HANYA diterima bila ada di daftar `allowed` —
 * jadi tak bisa dipakai menembus lingkup. `own_division` default ke divisi sendiri; selain itu 'all'.
 */
export function resolveDept(deptParam: string | null | undefined, allowed: string[], scope: PageScope, ownDept: string): string {
  if (deptParam && allowed.includes(deptParam)) return deptParam;
  return scope === 'own_division' ? (ownDept || 'all') : 'all';
}

/**
 * Rencana filter divisi OTORITATIF — cerminan langsung query server (Supabase eq/neq/none).
 * `op:'none'` = FAIL-CLOSED (tak cocok siapa pun): dipakai untuk lingkup 'self' yang TIDAK berbasis
 * divisi — halaman target WAJIB menyaring sendiri per-ID (`eq('id', <pemegang>)`). Bila sebuah halaman
 * lupa cabang self dan tetap memakai rencana ini, hasilnya kosong (aman), bukan bocor ke semua.
 */
export type DeptScopeFilter = { op: 'all' } | { op: 'none' } | { op: 'eq' | 'neq'; dept: string };

export function deptScopeFilter(scope: PageScope, ownDept: string, dept: string): DeptScopeFilter {
  if (scope === 'self' || scope === 'coordinator_team') return { op: 'none' }; // berbasis ID, bukan divisi → fail-closed di sini
  if (scope === 'own_division') return { op: 'eq', dept: ownDept };
  if (scope === 'other_divisions') return dept !== 'all' ? { op: 'eq', dept } : { op: 'neq', dept: ownDept };
  return dept !== 'all' ? { op: 'eq', dept } : { op: 'all' };
}

/**
 * Terapkan rencana filter ke daftar pegawai (mirror semantik SQL: `eq` cocok persis; `neq`
 * MENGECUALIKAN dept null — sama seperti Postgres `<>`; `none` → kosong). Dipakai untuk pengujian;
 * halaman memakai rencana yang sama untuk membangun query DB.
 */
export function applyDeptScope<T extends { dept: string | null }>(employees: T[], f: DeptScopeFilter): T[] {
  if (f.op === 'all') return employees.slice();
  if (f.op === 'none') return [];
  if (f.op === 'eq') return employees.filter((e) => e.dept === f.dept);
  return employees.filter((e) => e.dept != null && e.dept !== f.dept); // neq
}

/**
 * Apakah SATU pegawai (dept `targetDept`) berada di dalam LINGKUP grant `scope` milik pemegang
 * berdivisi `ownDept`? Dipakai guard TULIS per-aksi (mis. finalisasi Review Hasil Akhir oleh
 * pemegang grant) untuk menolak target di luar lingkup. Memakai primitif yang SAMA & teruji
 * (`deptScopeFilter`+`applyDeptScope`) agar tak pernah menyimpang dari filter daftar di halaman.
 * `dept` null diperlakukan seperti SQL: cocok 'eq' hanya bila keduanya null; DIKECUALIKAN oleh 'neq'.
 */
export function isDeptInScope(scope: PageScope, ownDept: string, targetDept: string | null): boolean {
  return applyDeptScope([{ dept: targetDept }], deptScopeFilter(scope, ownDept, 'all')).length > 0;
}

/**
 * ── PENEGAKAN MULTI-LINGKUP (migrasi 0028) ─────────────────────────────────────────────────────
 * Apakah `emp` termasuk dalam SALAH SATU lingkup yang diberikan (OR)? Ini sumber kebenaran tunggal
 * untuk menyaring pegawai di halaman ter-grant (halaman "ambil semua → saring di JS") DAN untuk guard
 * tulis target-tunggal. Semantik tiap lingkup:
 *   all              → semua
 *   self             → hanya pemegang grant sendiri (per-ID)
 *   own_division     → sedivisi dengan pemegang
 *   other_divisions  → divisi ≠ pemegang (dept null DIKECUALIKAN, seperti SQL `<>`)
 *   coordinator_team → hanya anggota tim naungan pemegang (per-ID; `teamIds` = daftar
 *                      coordinator_team_members milik pemegang, WAJIB diberikan pemanggil).
 * `teamIds` opsional: hanya perlu bila `scopes` memuat 'coordinator_team' (tanpa itu → tak cocok).
 */
export function employeeInScopes(
  scopes: PageScope[], ownDept: string, ownId: string, emp: { id: string; dept: string | null },
  teamIds?: ReadonlySet<string> | null,
): boolean {
  return scopes.some((s) => {
    if (s === 'all') return true;
    if (s === 'self') return emp.id === ownId;
    if (s === 'own_division') return emp.dept === ownDept;
    if (s === 'coordinator_team') return !!teamIds && teamIds.has(emp.id);
    return emp.dept != null && emp.dept !== ownDept; // other_divisions
  });
}

/**
 * Divisi yang boleh DIPILIH di dropdown filter untuk gabungan lingkup (union). 'all' → semua divisi;
 * own_division menambah divisi sendiri; other_divisions menambah semua divisi lain; 'self' tak menambah
 * divisi apa pun. `coordinator_team` menambah divisi-divisi anggota tim naungan (`teamDepts`) — tim bisa
 * lintas divisi. (Dipakai halaman Monitor untuk membatasi pilihan dropdown sesuai lingkup grant.)
 */
export function allowedDeptsForMulti(depts: string[], scopes: PageScope[], ownDept: string, teamDepts: string[] = []): string[] {
  if (scopes.includes('all')) return depts;
  const set = new Set<string>();
  if (scopes.includes('own_division')) depts.filter((d) => d === ownDept).forEach((d) => set.add(d));
  if (scopes.includes('other_divisions')) depts.filter((d) => d !== ownDept).forEach((d) => set.add(d));
  if (scopes.includes('coordinator_team')) teamDepts.filter((d) => depts.includes(d)).forEach((d) => set.add(d));
  return depts.filter((d) => set.has(d)); // pertahankan urutan asli
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
