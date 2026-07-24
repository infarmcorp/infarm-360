import { describe, it, expect } from 'vitest';
import {
  grantedScope, grantedAccess, allowedDeptsFor, allowedDeptsForMulti, resolveDept, deptScopeFilter,
  applyDeptScope, isDeptInScope, employeeInScopes,
  GRANTABLE_PAGES, GRANTABLE_PAGE_KIND,
  type PageScope, type DeptScopeFilter,
} from '@/lib/auth/roles';

/**
 * Penyaringan lingkup divisi halaman Monitor (RBAC page_grants, migrasi 0024). Menguji logika MURNI
 * yang dipakai app/(app)/admin/monitor/page.tsx — tanpa DB, tanpa login-as-role (kendala uji lintas
 * peran di produksi). Mengunci: own_division → hanya divisi sendiri; other_divisions → semua SELAIN
 * divisi sendiri; 'all' → semua; dan ?dept= TAK BISA menembus lingkup.
 */

// Roster contoh meniru data nyata (mis. Ulfa di HRD-GA). `dept: null` menguji semantik neq.
const ROSTER: { id: string; dept: string | null }[] = [
  { id: 'a1', dept: 'HRD-GA' },
  { id: 'a2', dept: 'HRD-GA' },
  { id: 'b1', dept: 'Marketing' },
  { id: 'b2', dept: 'Marketing' },
  { id: 'c1', dept: 'Sales' },
  { id: 'd1', dept: null }, // pegawai tanpa divisi
];
const ALL_DEPTS = ['HRD-GA', 'Marketing', 'Sales'];
const OWN = 'HRD-GA';

/** Pembantu: id yang tampil bila viewer berlingkup `scope` (dari OWN) memilih `deptParam`. */
function visibleIds(scope: PageScope, deptParam: string | null | undefined): string[] {
  const allowed = allowedDeptsFor(ALL_DEPTS, scope, OWN);
  const dept = resolveDept(deptParam, allowed, scope, OWN);
  const f = deptScopeFilter(scope, OWN, dept);
  return applyDeptScope(ROSTER, f).map((e) => e.id);
}

describe('grantedScope — baca lingkup grant halaman', () => {
  it('mengembalikan scope untuk halaman yang cocok', () => {
    expect(grantedScope([{ section: 'monitor', scope: 'other_divisions' }], 'monitor')).toBe('other_divisions');
  });
  it('null bila tak ada grant / halaman lain / scope tak dikenal', () => {
    expect(grantedScope([], 'monitor')).toBeNull();
    expect(grantedScope([{ section: 'lain', scope: 'all' }], 'monitor')).toBeNull();
    expect(grantedScope([{ section: 'monitor', scope: 'ngawur' }], 'monitor')).toBeNull();
    expect(grantedScope(null, 'monitor')).toBeNull();
  });
});

describe('allowedDeptsFor — divisi yang boleh dipilih di dropdown', () => {
  it('own_division → hanya divisi sendiri', () => {
    expect(allowedDeptsFor(ALL_DEPTS, 'own_division', OWN)).toEqual(['HRD-GA']);
  });
  it('other_divisions → semua kecuali divisi sendiri', () => {
    expect(allowedDeptsFor(ALL_DEPTS, 'other_divisions', OWN)).toEqual(['Marketing', 'Sales']);
  });
  it('all → semua divisi', () => {
    expect(allowedDeptsFor(ALL_DEPTS, 'all', OWN)).toEqual(ALL_DEPTS);
  });
});

describe('resolveDept — cegah tembus lingkup lewat ?dept=', () => {
  it('menerima deptParam yang ADA di daftar diizinkan', () => {
    expect(resolveDept('Marketing', ['Marketing', 'Sales'], 'other_divisions', OWN)).toBe('Marketing');
  });
  it('MENGABAIKAN deptParam di luar daftar diizinkan (fallback aman)', () => {
    // other_divisions mencoba memilih divisi sendiri → ditolak → 'all' (tetap kecualikan sendiri).
    expect(resolveDept('HRD-GA', ['Marketing', 'Sales'], 'other_divisions', OWN)).toBe('all');
    // own_division mencoba divisi lain → ditolak → divisi sendiri.
    expect(resolveDept('Marketing', ['HRD-GA'], 'own_division', OWN)).toBe('HRD-GA');
  });
  it('own_division tanpa deptParam → divisi sendiri; other/all → all', () => {
    expect(resolveDept(null, ['HRD-GA'], 'own_division', OWN)).toBe('HRD-GA');
    expect(resolveDept(null, ['Marketing', 'Sales'], 'other_divisions', OWN)).toBe('all');
    expect(resolveDept(undefined, ALL_DEPTS, 'all', OWN)).toBe('all');
  });
});

describe('deptScopeFilter — rencana filter cerminan query server', () => {
  it('own_division → eq divisi sendiri', () => {
    expect(deptScopeFilter('own_division', OWN, 'HRD-GA')).toEqual<DeptScopeFilter>({ op: 'eq', dept: 'HRD-GA' });
  });
  it('other_divisions all → neq divisi sendiri; divisi terpilih → eq', () => {
    expect(deptScopeFilter('other_divisions', OWN, 'all')).toEqual<DeptScopeFilter>({ op: 'neq', dept: 'HRD-GA' });
    expect(deptScopeFilter('other_divisions', OWN, 'Marketing')).toEqual<DeptScopeFilter>({ op: 'eq', dept: 'Marketing' });
  });
  it('all → none; divisi terpilih → eq', () => {
    expect(deptScopeFilter('all', OWN, 'all')).toEqual<DeptScopeFilter>({ op: 'all' });
    expect(deptScopeFilter('all', OWN, 'Sales')).toEqual<DeptScopeFilter>({ op: 'eq', dept: 'Sales' });
  });
});

describe('END-TO-END lingkup — siapa yang tampil (mirror kasus Ulfa)', () => {
  it('own_division → HANYA divisi sendiri', () => {
    expect(visibleIds('own_division', null).sort()).toEqual(['a1', 'a2']);
  });

  it('other_divisions → SEMUA SELAIN divisi sendiri (HRD-GA & dept null dikecualikan)', () => {
    // Kunci bug Ulfa: HRD-GA (a1,a2) TAK boleh muncul; d1 (dept null) juga dikecualikan spt SQL neq.
    expect(visibleIds('other_divisions', null).sort()).toEqual(['b1', 'b2', 'c1']);
  });

  it('other_divisions + coba ?dept=HRD-GA (divisi sendiri) → tetap dikecualikan (tak tembus)', () => {
    expect(visibleIds('other_divisions', 'HRD-GA').sort()).toEqual(['b1', 'b2', 'c1']);
  });

  it('other_divisions + ?dept=Marketing (divisi lain yang sah) → hanya Marketing', () => {
    expect(visibleIds('other_divisions', 'Marketing').sort()).toEqual(['b1', 'b2']);
  });

  it('all → semua pegawai (termasuk dept null)', () => {
    expect(visibleIds('all', null).sort()).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'd1']);
  });

  it('own_division dengan dept kosong (edge) → tak seorang pun (aman, tak bocor ke semua)', () => {
    const allowed = allowedDeptsFor(ALL_DEPTS, 'own_division', '');
    const dept = resolveDept(null, allowed, 'own_division', '');
    const f = deptScopeFilter('own_division', '', dept);
    // dept kosong → eq('') → tak cocok siapa pun di roster (semua dept non-'' atau null).
    expect(applyDeptScope(ROSTER, f)).toEqual([]);
  });
});

describe('isDeptInScope — guard TULIS satu pegawai (Review Hasil Akhir Tahap 2)', () => {
  it('own_division → hanya target sedivisi pemegang', () => {
    expect(isDeptInScope('own_division', 'HRD-GA', 'HRD-GA')).toBe(true);
    expect(isDeptInScope('own_division', 'HRD-GA', 'Marketing')).toBe(false);
    expect(isDeptInScope('own_division', 'HRD-GA', null)).toBe(false);
  });
  it('other_divisions → semua SELAIN divisi pemegang (dept null dikecualikan spt SQL neq)', () => {
    expect(isDeptInScope('other_divisions', 'HRD-GA', 'Marketing')).toBe(true);
    expect(isDeptInScope('other_divisions', 'HRD-GA', 'HRD-GA')).toBe(false);
    expect(isDeptInScope('other_divisions', 'HRD-GA', null)).toBe(false);
  });
  it('all → target mana pun dalam lingkup (termasuk dept null)', () => {
    expect(isDeptInScope('all', 'HRD-GA', 'Sales')).toBe(true);
    expect(isDeptInScope('all', 'HRD-GA', null)).toBe(true);
  });
  it('own_division dgn dept pemegang kosong → tak ada target yang lolos (aman)', () => {
    expect(isDeptInScope('own_division', '', 'Marketing')).toBe(false);
    expect(isDeptInScope('own_division', '', '')).toBe(true); // eq('') hanya cocok target '' persis
  });
});

describe("lingkup 'self' (Diri sendiri) — berbasis ID, FAIL-CLOSED di helper divisi", () => {
  it('deptScopeFilter self → op none (tak cocok siapa pun via divisi)', () => {
    expect(deptScopeFilter('self', 'HRD-GA', 'all')).toEqual<DeptScopeFilter>({ op: 'none' });
    expect(deptScopeFilter('self', 'HRD-GA', 'Marketing')).toEqual<DeptScopeFilter>({ op: 'none' });
  });
  it('applyDeptScope op none → daftar kosong (aman, tak bocor)', () => {
    expect(applyDeptScope(ROSTER, { op: 'none' })).toEqual([]);
  });
  it('allowedDeptsFor self → tak ada pilihan divisi', () => {
    expect(allowedDeptsFor(ALL_DEPTS, 'self', OWN)).toEqual([]);
  });
  it('isDeptInScope self → SELALU false (guard tulis harus cek per-ID, bukan divisi)', () => {
    // Penegakan self yang benar = employeeId === pemegang, dilakukan di resolver/halaman;
    // helper divisi ini sengaja fail-closed agar lupa-cabang tak membocorkan data.
    expect(isDeptInScope('self', 'HRD-GA', 'HRD-GA')).toBe(false);
    expect(isDeptInScope('self', 'HRD-GA', null)).toBe(false);
  });
  it('grantedScope/grantedAccess mengenali self sebagai scope sah', () => {
    expect(grantedScope([{ section: 'monitor', scope: 'self' }], 'monitor')).toBe('self');
    expect(grantedAccess([{ section: 'review', scope: 'self', can_edit: true }], 'review')).toEqual({ scopes: ['self'], canEdit: true, canFinalize: false });
  });
});

describe('employeeInScopes — penegakan MULTI-lingkup (OR) di halaman ter-grant', () => {
  const OWN_ID = 'me-1';
  const mk = (id: string, dept: string | null) => ({ id, dept });
  it('all → semua pegawai', () => {
    expect(employeeInScopes(['all'], 'HRD-GA', OWN_ID, mk('x', 'Sales'))).toBe(true);
    expect(employeeInScopes(['all'], 'HRD-GA', OWN_ID, mk('x', null))).toBe(true);
  });
  it('self → hanya pemegang grant sendiri (per-ID)', () => {
    expect(employeeInScopes(['self'], 'HRD-GA', OWN_ID, mk(OWN_ID, 'Sales'))).toBe(true);
    expect(employeeInScopes(['self'], 'HRD-GA', OWN_ID, mk('other', 'HRD-GA'))).toBe(false);
  });
  it('own_division / other_divisions (dept null dikecualikan seperti SQL <>)', () => {
    expect(employeeInScopes(['own_division'], 'HRD-GA', OWN_ID, mk('x', 'HRD-GA'))).toBe(true);
    expect(employeeInScopes(['own_division'], 'HRD-GA', OWN_ID, mk('x', 'Sales'))).toBe(false);
    expect(employeeInScopes(['other_divisions'], 'HRD-GA', OWN_ID, mk('x', 'Sales'))).toBe(true);
    expect(employeeInScopes(['other_divisions'], 'HRD-GA', OWN_ID, mk('x', 'HRD-GA'))).toBe(false);
    expect(employeeInScopes(['other_divisions'], 'HRD-GA', OWN_ID, mk('x', null))).toBe(false);
  });
  it('KOMBINASI "selain divisi + diri sendiri" = divisi lain OR catatan sendiri (bukan sedivisi)', () => {
    const scopes: PageScope[] = ['other_divisions', 'self'];
    expect(employeeInScopes(scopes, 'HRD-GA', OWN_ID, mk('x', 'Sales'))).toBe(true);       // divisi lain
    expect(employeeInScopes(scopes, 'HRD-GA', OWN_ID, mk(OWN_ID, 'HRD-GA'))).toBe(true);    // diri sendiri
    expect(employeeInScopes(scopes, 'HRD-GA', OWN_ID, mk('teman', 'HRD-GA'))).toBe(false);  // teman sedivisi TIDAK
  });
  it('coordinator_team → hanya anggota tim naungan (via teamIds); tanpa teamIds → FAIL-CLOSED', () => {
    const team = new Set(['t1', 't2']);
    expect(employeeInScopes(['coordinator_team'], 'HRD-GA', OWN_ID, mk('t1', 'Sales'), team)).toBe(true);
    expect(employeeInScopes(['coordinator_team'], 'HRD-GA', OWN_ID, mk('x', 'HRD-GA'), team)).toBe(false);
    // pemanggil lupa memuat teamIds → tak cocok siapa pun (aman), bukan bocor ke divisi lain.
    expect(employeeInScopes(['coordinator_team'], 'HRD-GA', OWN_ID, mk('t1', 'Sales'))).toBe(false);
  });
  it('coordinator_team lintas divisi + kombinasi dengan diri sendiri', () => {
    const team = new Set(['t1']);
    const scopes: PageScope[] = ['coordinator_team', 'self'];
    expect(employeeInScopes(scopes, 'HRD-GA', OWN_ID, mk('t1', 'Sales'), team)).toBe(true);    // anggota tim (divisi lain)
    expect(employeeInScopes(scopes, 'HRD-GA', OWN_ID, mk(OWN_ID, 'HRD-GA'), team)).toBe(true);  // diri sendiri
    expect(employeeInScopes(scopes, 'HRD-GA', OWN_ID, mk('z', 'Sales'), team)).toBe(false);     // bukan tim, bukan diri
  });
});

describe('allowedDeptsForMulti — dropdown divisi untuk gabungan lingkup', () => {
  it('all → semua divisi', () => {
    expect(allowedDeptsForMulti(ALL_DEPTS, ['all'], OWN)).toEqual(ALL_DEPTS);
  });
  it('own + other → semua (union), self tak menambah divisi', () => {
    expect(allowedDeptsForMulti(ALL_DEPTS, ['own_division', 'other_divisions'], OWN)).toEqual(ALL_DEPTS);
    expect(allowedDeptsForMulti(ALL_DEPTS, ['other_divisions', 'self'], OWN)).toEqual(['Marketing', 'Sales']);
    expect(allowedDeptsForMulti(ALL_DEPTS, ['self'], OWN)).toEqual([]);
  });
  it('coordinator_team → menambah divisi anggota tim (teamDepts), tetap dibatasi daftar divisi sah', () => {
    expect(allowedDeptsForMulti(ALL_DEPTS, ['coordinator_team'], OWN, ['Sales', 'Marketing'])).toEqual(['Marketing', 'Sales']);
    expect(allowedDeptsForMulti(ALL_DEPTS, ['coordinator_team'], OWN, [])).toEqual([]);
  });
});

describe("lingkup 'coordinator_team' — berbasis daftar tim, FAIL-CLOSED di helper divisi", () => {
  it('deptScopeFilter / allowedDeptsFor / isDeptInScope fail-closed (bukan berbasis divisi)', () => {
    expect(deptScopeFilter('coordinator_team', OWN, 'all')).toEqual<DeptScopeFilter>({ op: 'none' });
    expect(allowedDeptsFor(ALL_DEPTS, 'coordinator_team', OWN)).toEqual([]);
    expect(isDeptInScope('coordinator_team', 'HRD-GA', 'Sales')).toBe(false);
  });
  it('grantedAccess mengenali coordinator_team sebagai scope sah', () => {
    expect(grantedAccess([{ section: 'monitor', scope: 'coordinator_team', scopes: ['coordinator_team'] }], 'monitor'))
      .toEqual({ scopes: ['coordinator_team'], canEdit: false, canFinalize: false });
  });
});

describe('Review Hasil Akhir — grant halaman (Tahap 1: lihat-saja berlingkup)', () => {
  it("'review' ada di katalog grant, berjenis administrator", () => {
    expect(GRANTABLE_PAGES).toContain('review');
    expect(GRANTABLE_PAGE_KIND.review).toBe('administrator');
  });
  it('grantedScope membaca lingkup review; halaman lain → null', () => {
    expect(grantedScope([{ section: 'review', scope: 'own_division' }], 'review')).toBe('own_division');
    expect(grantedScope([{ section: 'monitor', scope: 'all' }], 'review')).toBeNull();
  });
  it('grantedAccess mengembalikan DAFTAR lingkup + canEdit (fallback scope tunggal lama → [scope])', () => {
    expect(grantedAccess([{ section: 'review', scope: 'all' }], 'review')).toEqual({ scopes: ['all'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'review', scope: 'other_divisions', can_edit: true }], 'review')).toEqual({ scopes: ['other_divisions'], canEdit: true, canFinalize: false });
    // kolom `scopes[]` baru diutamakan bila ada
    expect(grantedAccess([{ section: 'review', scope: 'other_divisions', scopes: ['other_divisions', 'self'], can_edit: true }], 'review'))
      .toEqual({ scopes: ['other_divisions', 'self'], canEdit: true, canFinalize: false });
  });
  it('grantedAccess izin 3-tingkat: canFinalize hanya bila can_finalize, & selalu menyiratkan canEdit', () => {
    // Meringkas: edit true, finalize false
    expect(grantedAccess([{ section: 'review', scope: 'all', can_edit: true, can_finalize: false }], 'review'))
      .toEqual({ scopes: ['all'], canEdit: true, canFinalize: false });
    // Finalisasi: edit true, finalize true
    expect(grantedAccess([{ section: 'review', scope: 'all', can_edit: true, can_finalize: true }], 'review'))
      .toEqual({ scopes: ['all'], canEdit: true, canFinalize: true });
    // Data tak konsisten (finalize true tanpa edit) → canFinalize dipaksa false (menyiratkan canEdit).
    expect(grantedAccess([{ section: 'review', scope: 'all', can_edit: false, can_finalize: true }], 'review'))
      .toEqual({ scopes: ['all'], canEdit: false, canFinalize: false });
  });
  it('lingkup review memakai deptScopeFilter yang SAMA (other_divisions kecualikan divisi sendiri + dept null)', () => {
    const f = deptScopeFilter('other_divisions', OWN, 'all');
    expect(applyDeptScope(ROSTER, f).map((e) => e.id).sort()).toEqual(['b1', 'b2', 'c1']);
  });
});

describe('Dashboard Organisasi — grant halaman (pemantauan, lihat-saja berlingkup)', () => {
  it("'dashboard' ada di katalog grant, berjenis pemantauan (selalu lihat-saja)", () => {
    expect(GRANTABLE_PAGES).toContain('dashboard');
    expect(GRANTABLE_PAGE_KIND.dashboard).toBe('pemantauan');
  });
  it('grantedAccess membaca lingkup dashboard (mis. coordinator_team); halaman lain → null', () => {
    expect(grantedAccess([{ section: 'dashboard', scope: 'own_division' }], 'dashboard')).toEqual({ scopes: ['own_division'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'dashboard', scope: 'coordinator_team', scopes: ['coordinator_team'] }], 'dashboard')).toEqual({ scopes: ['coordinator_team'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'monitor', scope: 'all' }], 'dashboard')).toBeNull();
  });
});

describe('Struktur Organisasi — grant halaman (pemantauan, lihat-saja berlingkup)', () => {
  it("'struktur' ada di katalog grant, berjenis pemantauan", () => {
    expect(GRANTABLE_PAGES).toContain('struktur');
    expect(GRANTABLE_PAGE_KIND.struktur).toBe('pemantauan');
  });
  it('grantedAccess membaca lingkup struktur; halaman lain → null', () => {
    expect(grantedAccess([{ section: 'struktur', scope: 'own_division' }], 'struktur')).toEqual({ scopes: ['own_division'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'dashboard', scope: 'all' }], 'struktur')).toBeNull();
  });
});

describe('Progress 360 Feedback — grant halaman (pemantauan, lihat-saja berlingkup)', () => {
  it("'progress' ada di katalog grant, berjenis pemantauan", () => {
    expect(GRANTABLE_PAGES).toContain('progress');
    expect(GRANTABLE_PAGE_KIND.progress).toBe('pemantauan');
  });
  it('grantedAccess membaca lingkup progress; halaman lain → null', () => {
    expect(grantedAccess([{ section: 'progress', scope: 'coordinator_team', scopes: ['coordinator_team'] }], 'progress')).toEqual({ scopes: ['coordinator_team'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'struktur', scope: 'all' }], 'progress')).toBeNull();
  });
});

describe('Flag Kepatuhan — grant halaman (pemantauan/lihat-saja; punishment tetap HRD-only)', () => {
  it("'kepatuhan' ada di katalog grant, berjenis pemantauan (lihat-saja)", () => {
    expect(GRANTABLE_PAGES).toContain('kepatuhan');
    expect(GRANTABLE_PAGE_KIND.kepatuhan).toBe('pemantauan');
  });
  it('grantedAccess membaca lingkup kepatuhan; halaman lain → null', () => {
    expect(grantedAccess([{ section: 'kepatuhan', scope: 'own_division' }], 'kepatuhan')).toEqual({ scopes: ['own_division'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'progress', scope: 'all' }], 'kepatuhan')).toBeNull();
  });
});

describe('Monitoring & Audit KPI — grant halaman (pemantauan/lihat-saja; input KPI tetap SPV/HRD)', () => {
  it("'kpi' ada di katalog grant, berjenis pemantauan (lihat-saja)", () => {
    expect(GRANTABLE_PAGES).toContain('kpi');
    expect(GRANTABLE_PAGE_KIND.kpi).toBe('pemantauan');
  });
  it('grantedAccess membaca lingkup kpi (mono & multi); halaman lain → null', () => {
    expect(grantedAccess([{ section: 'kpi', scope: 'coordinator_team' }], 'kpi')).toEqual({ scopes: ['coordinator_team'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'kpi', scopes: ['own_division', 'other_divisions'] }], 'kpi')).toEqual({ scopes: ['own_division', 'other_divisions'], canEdit: false, canFinalize: false });
    expect(grantedAccess([{ section: 'monitor', scope: 'all' }], 'kpi')).toBeNull();
  });
});
