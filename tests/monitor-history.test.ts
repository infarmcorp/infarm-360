import { describe, it, expect } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';
import { loadMonitorHistory } from '@/lib/monitor/history';

// Monitor Kinerja: riwayat KPI (semua bulan, semua tahun), Skor 360° & laporan per periode untuk
// pegawai dalam lingkup. HRD Mode-SPV = sedivisi (±50 orang × 24+ bulan > 1.000 baris).
const id = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const sortKey = (r: Record<string, unknown>) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]));
const asSet = (rows: Record<string, unknown>[]) => rows.map(sortKey).sort();

function fixture(nEmp: number, nMonths: number, extra: { failOn?: string[] } = {}) {
  const yms = Array.from({ length: nMonths }, (_, k) => `${2024 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`);
  const periods = Array.from({ length: Math.ceil(nMonths / 3) }, (_, k) => `p${k}`);
  const kpi = []; const r360 = []; const reps = [];
  for (let i = 0; i < nEmp; i++) {
    for (const ym of yms) kpi.push({ employee_id: id(i), ym, score: 70 + ((i + ym.length) % 30) });
    for (const p of periods) {
      r360.push({ employee_id: id(i), period_id: p, score: 80 });
      reps.push({ employee_id: id(i), period_id: p, status: 'finalized', final_score: 81 });
    }
  }
  // Pegawai di luar lingkup → tak boleh ikut terbaca.
  kpi.push({ employee_id: id(9999), ym: yms[0], score: 1 });
  return { db: fakeDb({ kpi_scores: kpi, result_360: r360, final_reports: reps }, extra), kpi, r360, reps };
}

describe('loadMonitorHistory — riwayat lintas periode untuk Monitor', () => {
  it('data kecil (< 1.000 baris): isi identik dengan query langsung sebelumnya', async () => {
    const { db } = fixture(5, 12);
    const ids = Array.from({ length: 5 }, (_, i) => id(i));
    // Query lama (tanpa paginasi) — aman selama < 1.000 baris.
    const old = {
      reports: (await db.from('final_reports').select('employee_id, period_id, status, final_score').in('employee_id', ids)).data!,
      kpi: (await db.from('kpi_scores').select('employee_id, ym, score').in('employee_id', ids)).data!,
      r360: (await db.from('result_360').select('employee_id, period_id, score').in('employee_id', ids)).data!,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const now = await loadMonitorHistory(db as any, ids);
    expect(asSet(now.reports)).toEqual(asSet(old.reports));
    expect(asSet(now.kpi)).toEqual(asSet(old.kpi));
    expect(asSet(now.r360)).toEqual(asSet(old.r360));
  });

  it('data besar (60 pegawai × 30 bulan = 1.800 baris KPI): tidak terpotong', async () => {
    const { db, kpi } = fixture(60, 30);
    const ids = Array.from({ length: 60 }, (_, i) => id(i));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const now = await loadMonitorHistory(db as any, ids);
    expect(now.kpi.length).toBe(kpi.length - 1); // tanpa baris pegawai di luar lingkup
    expect(now.kpi.some((r) => r.employee_id === id(9999))).toBe(false);
  });

  it('gagal membaca → error dilempar, bukan tampil dengan data kosong', async () => {
    const { db } = fixture(3, 3, { failOn: ['kpi_scores'] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(loadMonitorHistory(db as any, [id(0)])).rejects.toThrow();
  });
});
