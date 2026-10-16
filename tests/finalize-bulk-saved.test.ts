import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

// Finalisasi massal: "berhasil" HANYA laporan yang benar-benar tersimpan; yang gagal dilaporkan
// beserta namanya (audit gelombang 2b, poin 2b).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })) }));

import { createClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { bulkFinalizeAccepted } from '@/app/(app)/admin/laporan/actions';

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const E1 = '11111111-1111-1111-1111-111111111111';
const E2 = '22222222-2222-2222-2222-222222222222';
const HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const ACTIVE = { data: { id: 'p1', has_360: true, status: 'active' } };
const compute = (): Record<string, QResult[]> => ({
  period_months: [{ data: [{ ym: '2026-07' }] }], kpi_scores: [{ data: [{ score: 90 }] }], result_360: [{ data: { score: 70 } }],
});
function merge(...parts: Record<string, QResult[]>[]): Record<string, QResult[]> {
  const out: Record<string, QResult[]> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = [...(out[k] ?? []), ...v];
  return out;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => vi.mocked(createClient).mockResolvedValue(c as any);
const twoCandidates = { data: [{ id: 'r1', employee_id: E1, final_score: 80 }, { id: 'r2', employee_id: E2, final_score: 80 }] };

beforeEach(() => vi.clearAllMocks());

describe('bulkFinalizeAccepted — hitung hanya yang tersimpan', () => {
  it('update tanpa error tetapi 0 baris berubah (ditolak diam-diam) → GAGAL, bukan berhasil', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }, { id: E2, name: 'Budi' }] }], periods: [ACTIVE] },
      { final_reports: [twoCandidates] },
      compute(), { final_reports: [{ data: [{ id: 'r1' }], error: null }] },   // Andi tersimpan
      compute(), { final_reports: [{ data: [], error: null }] },               // Budi: 0 baris
    ) }));
    const r = await bulkFinalizeAccepted();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.finalized).toBe(1);
    expect(r.skipped).toEqual([]);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].name).toBe('Budi');
    expect(r.failed[0].reason).toMatch(/tidak tersimpan/i);
  });

  it('error database saat menyimpan → masuk daftar gagal beserta nama & pesannya', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute(), { final_reports: [{ data: null, error: { message: 'RLS menolak' } }] },
    ) }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 0, skipped: [], failed: [{ name: 'Andi', reason: 'Gagal disimpan: RLS menolak' }] });
  });

  it('update hanya mengenai laporan yang MASIH in_review & membaca balik baris tersimpan', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute(), { final_reports: [{ data: [{ id: 'r1' }], error: null }] },
    ) });
    use(c);
    expect(await bulkFinalizeAccepted()).toEqual({ ok: true, finalized: 1, skipped: [], failed: [] });
    const u = c.calls.filter((x) => x.table === 'final_reports' && x.op === 'update');
    expect(u[0].filters).toEqual([['eq', 'id', 'r1'], ['eq', 'status', 'in_review']]);
  });

  it('gagal membaca daftar laporan → pesan gagal (bukan "0 difinalisasi")', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }], periods: [ACTIVE], final_reports: [{ data: null, error: { message: 'timeout' } }],
    } }));
    expect(await bulkFinalizeAccepted()).toEqual({ ok: false, error: 'Gagal membaca daftar laporan: timeout' });
  });

  it('Log Aktivitas mencatat jumlah & NAMA yang berhasil/gagal', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }, { id: E2, name: 'Budi' }] }], periods: [ACTIVE] },
      { final_reports: [twoCandidates] },
      compute(), { final_reports: [{ data: [{ id: 'r1' }], error: null }] },
      compute(), { final_reports: [{ data: [], error: null }] },
    ) }));
    await bulkFinalizeAccepted();
    const log = vi.mocked(logHrdAction).mock.calls[0][0];
    expect(log.summary).toBe('Finalisasi massal 1 laporan ber-ACC (1 gagal disimpan: Budi)');
    expect(log.meta).toMatchObject({ finalized: 1, skipped: 0, failed: 1, finalized_names: ['Andi'], failed_list: [{ name: 'Budi' }] });
  });
});
