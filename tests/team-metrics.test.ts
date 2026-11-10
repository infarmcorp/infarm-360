import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import { teamAverages } from '@/lib/team-metrics';

describe('teamAverages — Trend "Belum terbaca" tetap dihitung (pemilik 2026-11-10)', () => {
  it('pegawai dengan KPI 1 dari 3 bulan ikut rerata KPI tim', () => {
    const r = teamAverages([
      { kpiAvg: 90, s360: 80 },
      { kpiAvg: 70, s360: null }, // mis. baru mengisi 1 bulan (Trend "Belum terbaca")
      { kpiAvg: null, s360: 90 },
    ]);
    expect(r.kpi).toBe(80);
    expect(r.s360).toBe(85);
  });

  it('tanpa data → null', () => {
    expect(teamAverages([])).toEqual({ kpi: null, s360: null });
  });
});
