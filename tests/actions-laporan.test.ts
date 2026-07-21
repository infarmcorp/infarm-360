import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
// SADAR-MODE: aksi membaca cookie hrd_mode. Default 'admin' agar jalur HRD-penuh aktif; tes jalur
// grant memakai aktor NON-canAdmin sehingga mode tak relevan (isHrdFull tetap false).
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })) }));
// finalScoreOf (lib/scoring) SENGAJA tidak di-mock — pakai rumus asli agar tes juga menjaga integrasi.

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { saveOrFinalizeReport, releaseToSpv } from '@/app/(app)/admin/laporan/actions';

const mockCreate = vi.mocked(createClient);
const mockCreateAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockCreateAdmin.mockReturnValue(c as any); }

const HRD = { role: 'hrd', is_hrd_admin: false };
const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const ACTIVE = { data: { id: 'p1', has_360: true, status: 'active' } };
/** Pemegang grant non-HRD (mis. Ulfa Mode-SPV) berdivisi Marketing. */
const GRANT_HOLDER = { role: 'employee', is_hrd_admin: false, hrd_sections: null, dept: 'Marketing', name: 'Ulfa' };

/** Antrean computeFinal untuk skor non-null: KPI 90 & 360 70 → finalScoreOf = 80. */
function computeTablesNonNull(): Record<string, QResult[]> {
  return {
    period_months: [{ data: [{ ym: '2026-01' }] }],
    kpi_scores: [{ data: [{ score: 90 }] }],
    result_360: [{ data: { score: 70 } }],
    compliance_penalties: [{ data: null }],
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('saveOrFinalizeReport — otorisasi & prasyarat skor', () => {
  it('tolak bila sesi berakhir', async () => {
    use(makeClient({ user: null }));
    const r = await saveOrFinalizeReport(EMP, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sesi berakhir/i);
  });

  it('tolak bila bukan HRD & tanpa grant review', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'spv' } }],
      page_grants: [{ data: [] }], // tak ada grant → grantedAccess null
    } }));
    const r = await saveOrFinalizeReport(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/i);
  });

  it('tolak bila tak ada periode aktif', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }], periods: [{ data: null }] } }));
    const r = await saveOrFinalizeReport(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/periode aktif/i);
  });

  it('tolak bila KPI & 360° dua-duanya kosong (Skor Akhir null)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      periods: [ACTIVE],
      period_months: [{ data: [] }],   // tak ada bulan → KPI tak di-query, kpiAvg null
      result_360: [{ data: null }],    // 360 null
      compliance_penalties: [{ data: null }],
    } }));
    const r = await saveOrFinalizeReport(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/keduanya masih kosong/i);
  });

  it('simpan draf sukses (baris sudah ada) → finalized:false, skor 80', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: { name: 'Andi' } }],
      periods: [ACTIVE],
      ...computeTablesNonNull(),
      final_reports: [{ data: { id: 'r1' } }, { error: null }],
    } }));
    const r = await saveOrFinalizeReport(EMP, false);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.finalized).toBe(false); expect(r.finalScore).toBe(80); }
  });

  it('finalisasi sukses (baris belum ada → insert) → finalized:true', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: { name: 'Andi' } }],
      periods: [ACTIVE],
      ...computeTablesNonNull(),
      final_reports: [{ data: null }, { error: null }],
    } }));
    const r = await saveOrFinalizeReport(EMP, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finalized).toBe(true);
  });
});

describe('releaseToSpv — tolak menurunkan laporan yang sudah final', () => {
  it('tolak bila laporan sudah finalized', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      periods: [ACTIVE],
      ...computeTablesNonNull(),
      final_reports: [{ data: { id: 'r1', status: 'finalized' } }],
    } }));
    const r = await releaseToSpv(EMP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sudah difinalisasi/i);
  });

  it('rilis sukses (draf → in_review)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: { name: 'Andi' } }],
      periods: [ACTIVE],
      ...computeTablesNonNull(),
      final_reports: [{ data: { id: 'r1', status: 'draft' } }, { error: null }],
    } }));
    const r = await releaseToSpv(EMP);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finalized).toBe(false);
  });
});

describe('saveOrFinalizeReport — jalur GRANT "Review Hasil Akhir" (Tahap 2)', () => {
  it('tolak pemegang grant HANYA-LIHAT (can_edit=false)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: GRANT_HOLDER }],
      page_grants: [{ data: [{ section: 'review', scope: 'all', can_edit: false }] }],
    } }));
    const r = await saveOrFinalizeReport(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/hanya-lihat/i);
  });

  it('tolak bila target di LUAR LINGKUP (own_division, divisi target beda)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: GRANT_HOLDER }], // dept Marketing
      page_grants: [{ data: [{ section: 'review', scope: 'own_division', can_edit: true }] }],
    } }));
    useAdmin(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { dept: 'Sales' } }], // target di Sales → di luar own_division Marketing
    } }));
    const r = await saveOrFinalizeReport(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/di luar lingkup/i);
  });

  it("lingkup 'self' — TOLAK bila target bukan diri sendiri", async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: GRANT_HOLDER }],
      page_grants: [{ data: [{ section: 'review', scope: 'self', can_edit: true }] }],
    } }));
    const r = await saveOrFinalizeReport(EMP, true); // EMP ≠ UID
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/laporan Anda sendiri/i);
  });

  it("lingkup 'self' — SUKSES bila target = diri sendiri (via service_role)", async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: GRANT_HOLDER }],
      page_grants: [{ data: [{ section: 'review', scope: 'self', can_edit: true }] }],
    } }));
    useAdmin(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { name: 'Ulfa' } }], // self branch tak baca dept target; hanya nama di akhir
      periods: [ACTIVE],
      ...computeTablesNonNull(),
      final_reports: [{ data: null }, { error: null }],
    } }));
    const r = await saveOrFinalizeReport(UID, true); // employeeId === user.id
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finalized).toBe(true);
  });

  it('finalisasi SUKSES bila boleh-edit + target DALAM lingkup (tulis via service_role)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: GRANT_HOLDER }], // dept Marketing
      page_grants: [{ data: [{ section: 'review', scope: 'own_division', can_edit: true }] }],
    } }));
    // Semua baca/tulis laporan lewat service_role (admin): target dept, periode, computeFinal, final_reports, nama.
    useAdmin(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { dept: 'Marketing' } }, { data: { name: 'Andi' } }],
      periods: [ACTIVE],
      ...computeTablesNonNull(),
      final_reports: [{ data: null }, { error: null }],
    } }));
    const r = await saveOrFinalizeReport(EMP, true);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.finalized).toBe(true); expect(r.finalScore).toBe(80); }
    expect(mockCreateAdmin).toHaveBeenCalled();
  });
});
