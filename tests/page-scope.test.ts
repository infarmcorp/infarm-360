import { describe, it, expect } from 'vitest';
import {
  grantedScope, grantedAccess, allowedDeptsFor, resolveDept, deptScopeFilter, applyDeptScope,
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

describe('Review Hasil Akhir — grant halaman (Tahap 1: lihat-saja berlingkup)', () => {
  it("'review' ada di katalog grant, berjenis administrator", () => {
    expect(GRANTABLE_PAGES).toContain('review');
    expect(GRANTABLE_PAGE_KIND.review).toBe('administrator');
  });
  it('grantedScope membaca lingkup review; halaman lain → null', () => {
    expect(grantedScope([{ section: 'review', scope: 'own_division' }], 'review')).toBe('own_division');
    expect(grantedScope([{ section: 'monitor', scope: 'all' }], 'review')).toBeNull();
  });
  it('Tahap 1 = hanya-lihat: grantedAccess canEdit=false meski grant ada', () => {
    // Konsol belum menyetel can_edit → default false; halaman review Tahap 1 memang read-only.
    expect(grantedAccess([{ section: 'review', scope: 'all' }], 'review')).toEqual({ scope: 'all', canEdit: false });
    expect(grantedAccess([{ section: 'review', scope: 'other_divisions', can_edit: true }], 'review')).toEqual({ scope: 'other_divisions', canEdit: true });
  });
  it('lingkup review memakai deptScopeFilter yang SAMA (other_divisions kecualikan divisi sendiri + dept null)', () => {
    const f = deptScopeFilter('other_divisions', OWN, 'all');
    expect(applyDeptScope(ROSTER, f).map((e) => e.id).sort()).toEqual(['b1', 'b2', 'c1']);
  });
});
