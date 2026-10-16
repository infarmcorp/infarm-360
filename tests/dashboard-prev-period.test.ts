import { describe, it, expect } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';
import { loadPrevPeriodScores } from '@/lib/dashboard/prev-period';

// Dashboard Organisasi, selisih "vs periode lalu": Skor 360° & laporan periode sebelumnya untuk id
// SELURUH organisasi. Dulu `.in('employee_id', empIds)` tanpa pemecahan (URL raksasa / terpotong).
const id = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const asSet = (rows: Record<string, unknown>[]) => rows.map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]))).sort();

function fixture(n: number, opts: { failOn?: string[] } = {}) {
  const r360 = []; const reps = [];
  for (let i = 0; i < n; i++) {
    r360.push({ employee_id: id(i), period_id: 'prev', score: 70 + (i % 25) });
    r360.push({ employee_id: id(i), period_id: 'other', score: 1 });
    reps.push({ employee_id: id(i), period_id: 'prev', status: i % 3 ? 'finalized' : 'draft', final_score: 75 + (i % 20) });
  }
  return fakeDb({ result_360: r360, final_reports: reps }, opts);
}

describe('loadPrevPeriodScores — Skor 360° & laporan periode lalu', () => {
  it('data kecil: isi IDENTIK dengan query lama (tanpa pemecahan)', async () => {
    const db = fixture(40);
    const ids = Array.from({ length: 40 }, (_, i) => id(i));
    const oldR360 = (await db.from('result_360').select('employee_id, score').eq('period_id', 'prev').in('employee_id', ids)).data!;
    const oldReps = (await db.from('final_reports').select('employee_id, status, final_score').eq('period_id', 'prev').in('employee_id', ids)).data!;
    // (tiruan DB tak menyaring kolom select → bandingkan kolom yang dipakai saja)
    const strip = (rows: Record<string, unknown>[], keep: string[]) => rows.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]])));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const now = await loadPrevPeriodScores(db as any, 'prev', ids);
    expect(asSet(strip(now.r360, ['employee_id', 'score']))).toEqual(asSet(strip(oldR360, ['employee_id', 'score'])));
    expect(asSet(strip(now.reports, ['employee_id', 'status', 'final_score']))).toEqual(asSet(strip(oldReps, ['employee_id', 'status', 'final_score'])));
  });

  it('organisasi besar (1.200 pegawai): lengkap & id dipecah per kelompok', async () => {
    const db = fixture(1200);
    const ids = Array.from({ length: 1200 }, (_, i) => id(i));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const now = await loadPrevPeriodScores(db as any, 'prev', ids);
    expect(now.r360).toHaveLength(1200);
    expect(now.reports).toHaveLength(1200);
    expect(db.requests.result_360).toBeGreaterThan(1);
  });

  it('gangguan baca → kosong (sama seperti sebelumnya: selisih periode lalu tak tampil, halaman tetap jalan)', async () => {
    const db = fixture(5, { failOn: ['result_360'] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const now = await loadPrevPeriodScores(db as any, 'prev', [id(0)]);
    expect(now.r360).toEqual([]);
    expect(now.reports).toHaveLength(1);
  });
});
