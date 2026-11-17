import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
let mode = 'spv';
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: mode }) })) }));
vi.mock('@/lib/report', async (orig) => ({ ...(await orig<typeof import('@/lib/report')>()), loadReport: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { loadReport, type ReportData } from '@/lib/report';
import { loadPaPdf } from '@/lib/pdf/pa-load';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => vi.mocked(createClient).mockResolvedValue(c as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (c: MockClient) => vi.mocked(createAdminClient).mockReturnValue(c as any);

const ME = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const PERIOD = { id: 'p3', label: 'Q3 2026', has_360: true, status: 'active', start_date: '2026-07-01', end_date: '2026-09-30', pa_pdf: null };
const REPORT = {
  emp: { id: ME, name: 'Pegawai', dept: 'Sales' }, periodLabel: 'Q3 2026', has360: true, status: 'finalized',
  finalScore: 80, kpiAvg: 80, s360: 80, latePenalty360: 0, aspects: [], assessors: [], byAspect: [], essays: [],
  aspectSummaries: {}, qualSummaries: {}, qualQuestions: [], pdfNotes: {},
} as unknown as ReportData;

beforeEach(() => { vi.clearAllMocks(); mode = 'spv'; vi.mocked(loadReport).mockResolvedValue(REPORT); });

describe('loadPaPdf — unduh dari Laporan Hasil Saya', () => {
  it('pegawai mengunduh laporannya sendiri yang Final (dibaca via service_role)', async () => {
    use(makeClient({ user: { id: ME }, tables: { employees: [{ data: { role: 'employee' } }] } }));
    useAdmin(makeClient({ tables: {
      periods: [{ data: [PERIOD] }],
      final_reports: [{ data: { status: 'finalized' } }],
      employees: [{ data: { role: 'employee' } }],
    } }));
    const r = await loadPaPdf(ME, 'p3', { allowSelf: true });
    expect(r.ok).toBe(true);
  });

  it('laporan sendiri yang belum Final → ditolak', async () => {
    use(makeClient({ user: { id: ME }, tables: { employees: [{ data: { role: 'employee' } }] } }));
    useAdmin(makeClient({ tables: { periods: [{ data: [PERIOD] }], final_reports: [{ data: { status: 'in_review' } }] } }));
    const r = await loadPaPdf(ME, 'p3', { allowSelf: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(loadReport).not.toHaveBeenCalled();
  });

  it('laporan pegawai lain → ditolak (bukan HRD Mode Admin)', async () => {
    use(makeClient({ user: { id: ME }, tables: { employees: [{ data: { role: 'spv' } }] } }));
    const r = await loadPaPdf(OTHER, 'p3', { allowSelf: true });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('tanpa allowSelf (halaman kontrol HRD) pegawai tak bisa membuka laporannya sendiri', async () => {
    use(makeClient({ user: { id: ME }, tables: { employees: [{ data: { role: 'employee' } }] } }));
    const r = await loadPaPdf(ME, 'p3');
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});
