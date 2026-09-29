import { createAdminClient } from '@/lib/supabase/server';
import { classOf, avg as avg360, weightedScore360, type Groups360 } from '@/lib/score360';
import type { RelationKind, WeightValues } from '@/lib/database.types';
import { fetchAllByIds, fetchAllPaged } from '@/lib/supabase/paginate';

/**
 * Skor 360° per-ASPEK per-PEGAWAI untuk SATU periode. Dipakai Monitor Kinerja untuk menguraikan
 * "di aspek mana kinerja 360° naik/turun" antar dua periode. Meniru pipeline aspek pada
 * `lib/dashboard/aggregate.ts` (weight_schemes/mappings/classOf/weightedScore360), tetapi
 * mengelompokkan per TARGET pegawai × aspek — bukan agregat org/divisi.
 *
 * RUMUS SAMA dengan skor 360° resmi (Self dikecualikan, bobot per weight_scheme aktif). Scope
 * pemanggil = tim/naungan kecil → aman & murah (dibaca via service_role, di-scope ke `empIds`).
 */
export type IndicatorCol = { id: string; text: string; aspect: string }; // kolom indikator (+ aspek induk)
export type EmpAspect = {
  byEmp: Map<string, Map<string, number>>;      // empId → (nama aspek → skor 0–100)
  names: string[];                              // nama aspek terurut (order_idx)
  indByEmp: Map<string, Map<string, number>>;   // empId → (indicator_id → skor 0–100)
  indicators: IndicatorCol[];                   // daftar indikator terurut (aspek → order)
};

/** Bentuk data heatmap per-pegawai (aspek & indikator) dari hasil aspectScoresByEmployee. Murni. */
export function heatDataFromAspect(selAsp: EmpAspect, emps: { id: string; name: string; nickname?: string | null; dept: string }[]) {
  const aspectCols = selAsp.names.map((nm) => ({ key: nm, label: nm, full: nm }));
  const aspectRows = emps.filter((e) => selAsp.byEmp.has(e.id)).map((e) => ({
    id: e.id, name: e.name, nickname: e.nickname ?? null, dept: e.dept,
    cells: Object.fromEntries(selAsp.names.map((nm) => [nm, selAsp.byEmp.get(e.id)?.get(nm) ?? null])) as Record<string, number | null>,
  }));
  const indCols = selAsp.indicators.map((ind) => ({ key: ind.id, label: ind.text, full: ind.text, group: ind.aspect }));
  const indRows = emps.filter((e) => selAsp.indByEmp.has(e.id)).map((e) => ({
    id: e.id, name: e.name, nickname: e.nickname ?? null, dept: e.dept,
    cells: Object.fromEntries(selAsp.indicators.map((ind) => [ind.id, selAsp.indByEmp.get(e.id)?.get(ind.id) ?? null])) as Record<string, number | null>,
  }));
  return { aspectCols, aspectRows, indCols, indRows };
}

/**
 * Rata-rata skor per NAMA aspek dari EmpAspect, di-mean ATAS PEGAWAI (opsional dibatasi `ids`).
 * Metodologi = mean skor-aspek per-pegawai — apel-ke-apel dengan Profil Aspek tim. Pure.
 */
export function aspectAveragesFrom(asp: EmpAspect, ids?: string[]): Map<string, number> {
  const scope = ids ? new Set(ids) : null;
  const out = new Map<string, number>();
  for (const nm of asp.names) {
    const vals: number[] = [];
    for (const [id, m] of asp.byEmp) {
      if (scope && !scope.has(id)) continue;
      const v = m.get(nm);
      if (v != null) vals.push(v);
    }
    if (vals.length) out.set(nm, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

/**
 * Rata-rata 360° per aspek untuk SELURUH pegawai internal (non-direksi) pada satu periode —
 * pembanding "vs organisasi" untuk Profil Aspek tim/divisi. Metodologi SAMA dgn Profil Aspek
 * (mean skor aspek per-pegawai). Agregat anonim, dibaca via service_role.
 */
export async function orgAspectAverages(periodId: string): Promise<Map<string, number>> {
  const admin = createAdminClient();
  const { data: emps } = await admin.from('employees').select('id').eq('is_external', false).neq('role', 'direksi');
  const ids = (emps ?? []).map((e) => e.id);
  if (!ids.length) return new Map();
  const asp = await aspectScoresByEmployee(periodId, ids);
  return aspectAveragesFrom(asp);
}

export async function aspectScoresByEmployee(periodId: string, empIds: string[]): Promise<EmpAspect> {
  const byEmp = new Map<string, Map<string, number>>();
  const indByEmp = new Map<string, Map<string, number>>();
  if (!empIds.length) return { byEmp, names: [], indByEmp, indicators: [] };
  const admin = createAdminClient();

  // assessments satu periode (seluruh organisasi) bisa >1000 → dipaginasi (tanpa ini data terpotong diam-diam).
  const [aspRes, asmtRows] = await Promise.all([
    admin.from('culture_aspects').select('id, name, order_idx').eq('period_id', periodId).order('order_idx'),
    fetchAllPaged<{ id: string; assessor_id: string; target_id: string }>((from, to) =>
      admin.from('assessments').select('id, assessor_id, target_id').eq('period_id', periodId).eq('status', 'submitted')
        .order('id').range(from, to)),
  ]);
  const aspectList = aspRes.data ?? [];
  const names = aspectList.map((a) => a.name);
  if (aspectList.length === 0) return { byEmp, names, indByEmp, indicators: [] };

  const scope = new Set(empIds);
  const nonSelfIds = asmtRows
    .filter((a) => a.assessor_id !== a.target_id && scope.has(a.target_id))
    .map((a) => a.id);

  const [indRes, wsRes, mapsData, scoreRows] = await Promise.all([
    admin.from('indicators').select('id, aspect_id, text, order_idx').in('aspect_id', aspectList.map((a) => a.id)),
    admin.from('weight_schemes').select('model, weights').eq('period_id', periodId).eq('is_active', true).maybeSingle(),
    fetchAllPaged<{ assessor_id: string; target_id: string; relation: RelationKind }>((from, to) =>
      admin.from('mappings').select('assessor_id, target_id, relation').eq('period_id', periodId)
        .order('assessor_id').order('target_id').range(from, to)),
    nonSelfIds.length
      ? fetchAllByIds<{ assessment_id: string; indicator_id: string; rating: number | null }>(nonSelfIds, (chunk, from, to) =>
          admin.from('assessment_indicator_scores').select('assessment_id, indicator_id, rating')
            .in('assessment_id', chunk).order('assessment_id').order('indicator_id').range(from, to))
      : Promise.resolve([] as { assessment_id: string; indicator_id: string; rating: number | null }[]),
  ]);

  const indToAspect = new Map((indRes.data ?? []).map((i) => [i.id, i.aspect_id]));
  const idToName = new Map(aspectList.map((a) => [a.id, a.name]));
  const wModel = (wsRes.data?.model ?? '4class') as '4class' | '2class';
  const wVals = (wsRes.data?.weights ?? {}) as WeightValues;
  const hasWS = !!wsRes.data;
  const relByPair = new Map<string, RelationKind>();
  mapsData.forEach((m) => relByPair.set(`${m.assessor_id}:${m.target_id}`, m.relation));
  const asmtInfo = new Map(asmtRows.map((a) => [a.id, { assessor: a.assessor_id, target: a.target_id }]));

  // Rerata rating per (assessment × aspek) → skor 0–100 (×20), dikelompokkan per (target × aspek).
  const aaRatings = new Map<string, number[]>(); // `${assessmentId}|${aspectId}`
  scoreRows.forEach((s) => {
    if (s.rating == null) return;
    const aid = indToAspect.get(s.indicator_id);
    if (!aid) return;
    const k = `${s.assessment_id}|${aid}`;
    const arr = aaRatings.get(k) ?? []; arr.push(s.rating); aaRatings.set(k, arr);
  });
  const emptyG = (): Groups360 => ({ atasan: [], peer: [], cross: [], bawahan: [], self: [] });
  const targetAspectG = new Map<string, Groups360>(); // `${targetId}|${aspectId}`
  for (const [key, ratings] of aaRatings) {
    const sep = key.indexOf('|');
    const asmtId = key.slice(0, sep), aid = key.slice(sep + 1);
    const info = asmtInfo.get(asmtId);
    const m = avg360(ratings);
    if (!info || m == null) continue;
    const score100 = m * 20;
    if (score100 <= 0) continue;
    const rel: RelationKind = info.assessor === info.target ? 'Self' : (relByPair.get(`${info.assessor}:${info.target}`) ?? 'Peer');
    const cls = classOf(rel);
    const tk = `${info.target}|${aid}`;
    let g = targetAspectG.get(tk); if (!g) { g = emptyG(); targetAspectG.set(tk, g); }
    g[cls].push(score100);
  }
  // Per (target × INDIKATOR): tiap (assessment × indikator) = satu rating → ×20, dikelompokkan per
  // kelas penilai → weightedScore360 (metodologi sama, granularitas indikator). Self sudah dikecualikan.
  const targetIndG = new Map<string, Groups360>(); // `${targetId}|${indicatorId}`
  scoreRows.forEach((s) => {
    if (s.rating == null) return;
    const info = asmtInfo.get(s.assessment_id);
    if (!info) return;
    const score100 = s.rating * 20;
    if (score100 <= 0) return;
    const rel: RelationKind = info.assessor === info.target ? 'Self' : (relByPair.get(`${info.assessor}:${info.target}`) ?? 'Peer');
    const cls = classOf(rel);
    const tk = `${info.target}|${s.indicator_id}`;
    let g = targetIndG.get(tk); if (!g) { g = emptyG(); targetIndG.set(tk, g); }
    g[cls].push(score100);
  });

  const scoreOfG = (g: Groups360): number | null => {
    if (hasWS) return weightedScore360(g, wModel, wVals);
    const all = [...g.atasan, ...g.peer, ...g.cross, ...g.bawahan];
    return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
  };
  for (const [tk, g] of targetAspectG) {
    const sep = tk.indexOf('|');
    const target = tk.slice(0, sep), aid = tk.slice(sep + 1);
    const s = scoreOfG(g);
    const nm = idToName.get(aid);
    if (nm && s != null && s > 0) {
      let m = byEmp.get(target); if (!m) { m = new Map(); byEmp.set(target, m); }
      m.set(nm, s);
    }
  }
  for (const [tk, g] of targetIndG) {
    const sep = tk.indexOf('|');
    const target = tk.slice(0, sep), indId = tk.slice(sep + 1);
    const s = scoreOfG(g);
    if (s != null && s > 0) {
      let m = indByEmp.get(target); if (!m) { m = new Map(); indByEmp.set(target, m); }
      m.set(indId, s);
    }
  }

  // Kolom indikator terurut: aspek (order_idx) → indikator (order_idx).
  const aspectOrder = new Map(aspectList.map((a) => [a.id, a.order_idx ?? 0]));
  const indicators: IndicatorCol[] = (indRes.data ?? [])
    .map((i) => ({ id: i.id, text: i.text, aspect: idToName.get(i.aspect_id) ?? '', aOrder: aspectOrder.get(i.aspect_id) ?? 0, order: i.order_idx ?? 0 }))
    .sort((a, b) => a.aOrder - b.aOrder || a.order - b.order)
    .map(({ id, text, aspect }) => ({ id, text, aspect }));

  return { byEmp, names, indByEmp, indicators };
}
