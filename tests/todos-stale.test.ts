import { describe, it, expect } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';
import { countStaleFinalReports } from '@/lib/todos/compute';
import { finalScoreOf, kpiAvgOf } from '@/lib/scoring';

// "N laporan Final skornya berubah" (sidebar HRD) — membandingkan Skor Akhir tersimpan dengan skor
// terkini. KPI semua pegawai Final × bulan periode bisa > 1.000 baris → tak boleh terpotong diam-diam.
const P = 'p1';
const YMS = ['2026-07', '2026-08', '2026-09'];
const id = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;

/** n pegawai Final; KPI 3 bulan; final_score tersimpan = skor terkini (tak basi) kecuali `staleIdx`. */
function fixture(n: number, staleIdx: number[] = []) {
  const kpi: Record<string, unknown>[] = [];
  const reports: Record<string, unknown>[] = [];
  const r360: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const scores = [80 + (i % 7), 82 + (i % 5), 78 + (i % 3)];
    YMS.forEach((ym, k) => kpi.push({ employee_id: id(i), ym, score: scores[k] }));
    const s360 = 75 + (i % 11);
    r360.push({ employee_id: id(i), period_id: P, score: s360 });
    const live = finalScoreOf(kpiAvgOf(scores), s360, true)!;
    reports.push({ employee_id: id(i), period_id: P, status: 'finalized', final_score: staleIdx.includes(i) ? live + 5 : live });
  }
  return fakeDb({
    final_reports: reports, kpi_scores: kpi, result_360: r360,
    period_months: YMS.map((ym) => ({ period_id: P, ym })),
  });
}

describe('countStaleFinalReports — laporan Final yang skornya basi', () => {
  it('data kecil (< 1.000 baris KPI): hasil sama seperti sebelumnya', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await countStaleFinalReports(fixture(20, [3, 7]) as any, P, true)).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await countStaleFinalReports(fixture(20) as any, P, true)).toBe(0);
  });

  it('data besar (400 pegawai × 3 bulan = 1.200 baris KPI): tidak terpotong', async () => {
    // Bila KPI terpotong di 1.000 baris, pegawai di ujung daftar kehilangan bulan → dikira basi.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await countStaleFinalReports(fixture(400, [399]) as any, P, true)).toBe(1);
  });

  it('daftar id panjang dipecah per kelompok (bukan satu URL raksasa)', async () => {
    const db = fixture(400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await countStaleFinalReports(db as any, P, true);
    expect(db.requests.kpi_scores).toBeGreaterThan(1);
  });

  it('gagal membaca KPI → error dilempar, bukan dihitung dengan data kosong', async () => {
    const db = fakeDb({
      final_reports: [{ employee_id: id(1), period_id: P, status: 'finalized', final_score: 80 }],
      period_months: [{ period_id: P, ym: '2026-07' }],
      result_360: [],
    }, { failOn: ['kpi_scores'] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(countStaleFinalReports(db as any, P, true)).rejects.toThrow();
  });
});
