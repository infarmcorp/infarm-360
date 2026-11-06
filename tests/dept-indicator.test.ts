import { describe, it, expect } from 'vitest';
import { deptIndicatorForPeriod, deptIndicatorMatrix } from '@/lib/dashboard/dept-indicator';
import type { Groups360 } from '@/lib/score360';
import type { RelationKind } from '@/lib/database.types';

const aspects = [
  { id: 'a2', name: 'Jujur', order_idx: 1 },
  { id: 'a1', name: 'Berusaha', order_idx: 0 },
];
const indicators = [
  { id: 'i3', aspect_id: 'a2', text: 'Terbuka', order_idx: 0, is_active: true },
  { id: 'i2', aspect_id: 'a1', text: 'Tuntas', order_idx: 1, is_active: true },
  { id: 'i1', aspect_id: 'a1', text: 'Inisiatif', order_idx: 0, is_active: true },
  { id: 'i4', aspect_id: 'a1', text: 'Dinonaktifkan HRD', order_idx: 2, is_active: false },
];
const asmtInfo = new Map([
  ['s1', { assessor: 'atasan1', target: 'e1' }],
  ['s2', { assessor: 'rekan1', target: 'e1' }],
  ['s3', { assessor: 'rekan2', target: 'e2' }],
  ['self', { assessor: 'e1', target: 'e1' }],
]);
const relByPair = new Map<string, RelationKind>([['atasan1:e1', 'Atasan'], ['rekan1:e1', 'Peer'], ['rekan2:e2', 'Peer']]);
const empDept = new Map([['e1', 'Sales'], ['e2', 'Marketing']]);
const avgNonSelf = (g: Groups360) => {
  const all = [...g.atasan, ...g.peer, ...g.cross, ...g.bawahan];
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
};
const period = (scoreRows: { assessment_id: string; indicator_id: string; rating: number | null }[], scoreOfG = avgNonSelf) =>
  deptIndicatorForPeriod({ aspects, indicators, scoreRows, asmtInfo, relByPair, empDept, scoreOfG });

describe('Heatmap Divisi × Indikator', () => {
  it('kolom = indikator aktif saja, urut aspek lalu indikator (sesuai Kelola Pertanyaan)', () => {
    const { cols } = deptIndicatorMatrix([period([])], []);
    expect(cols.map((c) => c.text)).toEqual(['Inisiatif', 'Tuntas', 'Terbuka']);
    expect(cols.map((c) => c.aspect)).toEqual(['Berusaha', 'Berusaha', 'Jujur']);
  });

  it('rating ×20 per kelas penilai, per divisi target', () => {
    const seen: Groups360[] = [];
    const p = period([
      { assessment_id: 's1', indicator_id: 'i1', rating: 5 },
      { assessment_id: 's2', indicator_id: 'i1', rating: 4 },
      { assessment_id: 's3', indicator_id: 'i1', rating: 3 },
    ], (g) => { seen.push(g); return avgNonSelf(g); });
    expect(seen[0].atasan).toEqual([100]);
    expect(seen[0].peer).toEqual([80]);
    const { rows } = deptIndicatorMatrix([p], ['Marketing', 'Sales']);
    expect(rows.find((r) => r.dept === 'Sales')?.cells['Berusaha|Inisiatif']).toBe(90);
    expect(rows.find((r) => r.dept === 'Marketing')?.cells['Berusaha|Inisiatif']).toBe(60);
  });

  it('penilaian diri, rating kosong, dan indikator nonaktif tidak masuk skor', () => {
    const p = period([
      { assessment_id: 'self', indicator_id: 'i1', rating: 5 },
      { assessment_id: 's2', indicator_id: 'i1', rating: null },
      { assessment_id: 's2', indicator_id: 'i4', rating: 5 },
      { assessment_id: 's2', indicator_id: 'i2', rating: 2 },
    ]);
    const { cols, rows } = deptIndicatorMatrix([p], ['Sales']);
    expect(cols.some((c) => c.text === 'Dinonaktifkan HRD')).toBe(false);
    expect(rows[0].cells['Berusaha|Inisiatif']).toBeNull();
    expect(rows[0].cells['Berusaha|Tuntas']).toBe(40);
  });

  it('divisi tanpa skor sama sekali tidak ditampilkan', () => {
    const p = period([{ assessment_id: 's3', indicator_id: 'i1', rating: 4 }]);
    expect(deptIndicatorMatrix([p], ['Marketing', 'Sales']).rows.map((r) => r.dept)).toEqual(['Marketing']);
  });

  it('beberapa periode: rata-rata antar-kuartal per nama indikator, kuartal tanpa data tidak dihitung', () => {
    const q1 = period([{ assessment_id: 's3', indicator_id: 'i1', rating: 4 }]);
    const q2 = period([{ assessment_id: 's3', indicator_id: 'i1', rating: 2 }]);
    const q3 = period([]);
    const { rows } = deptIndicatorMatrix([q1, q2, q3], ['Marketing']);
    expect(rows[0].cells['Berusaha|Inisiatif']).toBe(60);
  });
});
