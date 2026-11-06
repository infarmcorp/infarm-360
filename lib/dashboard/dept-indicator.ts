import { classOf, type Groups360 } from '@/lib/score360';
import type { RelationKind } from '@/lib/database.types';

/**
 * Heatmap Dashboard "Divisi × Indikator". Kolom mengikuti Kelola Pertanyaan: hanya indikator AKTIF pada periode itu,
 * urut aspek → indikator. Metodologi SAMA dengan Divisi × Aspek (rating ×20, per kelas penilai, `scoreOfG` pemanggil;
 * Self dikecualikan), hanya granularitasnya indikator. Murni — pemanggil yang membaca data & menyiapkan bobot.
 */
export type DeptIndicatorCol = { key: string; text: string; aspect: string };
export type DeptIndicatorRow = { dept: string; cells: Record<string, number | null> };
/** Hasil satu periode. `key` = aspek + teks agar indikator bernama sama bisa dirata-rata antar-kuartal (id beda tiap periode). */
export type DeptIndicatorPeriod = {
  cols: (DeptIndicatorCol & { aspectOrder: number; order: number })[];
  scores: Map<string, Map<string, number>>; // dept → (key → skor 0–100)
};

export const EMPTY_DEPT_INDICATOR: DeptIndicatorPeriod = { cols: [], scores: new Map() };

export function deptIndicatorForPeriod({ aspects, indicators, scoreRows, asmtInfo, relByPair, empDept, scoreOfG }: {
  aspects: { id: string; name: string; order_idx: number | null }[];
  indicators: { id: string; aspect_id: string; text: string; order_idx: number | null; is_active: boolean }[];
  scoreRows: { assessment_id: string; indicator_id: string; rating: number | null }[];
  asmtInfo: Map<string, { assessor: string; target: string }>;
  relByPair: Map<string, RelationKind>;
  empDept: Map<string, string>;
  scoreOfG: (g: Groups360) => number | null;
}): DeptIndicatorPeriod {
  const aspectById = new Map(aspects.map((a) => [a.id, a]));
  const colById = new Map<string, DeptIndicatorPeriod['cols'][number]>();
  for (const i of indicators) {
    const a = aspectById.get(i.aspect_id);
    if (!a || !i.is_active) continue;
    colById.set(i.id, { key: `${a.name}|${i.text}`, text: i.text, aspect: a.name, aspectOrder: a.order_idx ?? 0, order: i.order_idx ?? 0 });
  }

  const groups = new Map<string, Map<string, Groups360>>();
  for (const s of scoreRows) {
    if (s.rating == null) continue;
    const col = colById.get(s.indicator_id);
    const info = asmtInfo.get(s.assessment_id);
    const dept = info && empDept.get(info.target);
    if (!col || !info || !dept) continue;
    const score100 = s.rating * 20;
    if (score100 <= 0) continue;
    const rel: RelationKind = info.assessor === info.target ? 'Self' : (relByPair.get(`${info.assessor}:${info.target}`) ?? 'Peer');
    let byKey = groups.get(dept); if (!byKey) { byKey = new Map(); groups.set(dept, byKey); }
    let g = byKey.get(col.key); if (!g) { g = { atasan: [], peer: [], cross: [], bawahan: [], self: [] }; byKey.set(col.key, g); }
    g[classOf(rel)].push(score100);
  }

  const scores: DeptIndicatorPeriod['scores'] = new Map();
  for (const [dept, byKey] of groups) {
    const out = new Map<string, number>();
    for (const [key, g] of byKey) {
      const v = scoreOfG(g);
      if (v != null && v > 0) out.set(key, v);
    }
    scores.set(dept, out);
  }
  return { cols: [...colById.values()], scores };
}

/** Gabung hasil per periode → kolom & baris tabel. Satu periode = apa adanya; beberapa = rata-rata antar-kuartal per nama indikator. */
export function deptIndicatorMatrix(periods: DeptIndicatorPeriod[], depts: string[]): { cols: DeptIndicatorCol[]; rows: DeptIndicatorRow[] } {
  const firstByKey = new Map<string, DeptIndicatorPeriod['cols'][number]>();
  for (const p of periods) for (const c of p.cols) if (!firstByKey.has(c.key)) firstByKey.set(c.key, c);
  const cols = [...firstByKey.values()]
    .sort((a, b) => a.aspectOrder - b.aspectOrder || a.order - b.order)
    .map(({ key, text, aspect }) => ({ key, text, aspect }));
  const rows = depts
    .map((dept) => ({
      dept,
      cells: Object.fromEntries(cols.map((c) => {
        const vals = periods.map((p) => p.scores.get(dept)?.get(c.key)).filter((v): v is number => v != null);
        return [c.key, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null];
      })) as Record<string, number | null>,
    }))
    .filter((r) => Object.values(r.cells).some((v) => v != null));
  return { cols, rows };
}
