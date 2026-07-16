import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
// finalScoreOf (lib/scoring) SENGAJA tidak di-mock — pakai rumus asli agar tes juga menjaga integrasi.

import { createClient } from '@/lib/supabase/server';
import { saveOrFinalizeReport, releaseToSpv } from '@/app/(app)/admin/laporan/actions';

const mockCreate = vi.mocked(createClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }

const HRD = { role: 'hrd', is_hrd_admin: false };
const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const ACTIVE = { data: { id: 'p1', has_360: true, status: 'active' } };

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

  it('tolak bila bukan HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv' } }] } }));
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
