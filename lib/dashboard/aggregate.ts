import { createAdminClient } from '@/lib/supabase/server';
import { finalScoreOf, kpiAvgOf, displayedFinalOf, roundScore, playerClassOf, type PlayerClass } from '@/lib/scoring';
import { classOf, avg as avg360, weightedScore360, effectiveModel, type Groups360, type Model360 } from '@/lib/score360';
import type { RelationKind, WeightValues } from '@/lib/database.types';
import { fetchAllByIds, fetchAllPaged } from '@/lib/supabase/paginate';
import { trendOf } from '@/lib/trend';

/**
 * Agregasi Dashboard LINTAS-PERIODE (mode "Semua Kuartal" = 1 tahun · "Semua Tahun" = all-time).
 * Menjalankan pipeline dashboard atas SEKUMPULAN periode, bukan satu kuartal:
 *  - KPI & 360° per pegawai = RATA-RATA ANTAR-KUARTAL (rata bulan tiap kuartal → rata antar-kuartal).
 *  - Skor Akhir tahunan = rata-rata Skor Akhir per kuartal (rumus resmi finalScoreOf).
 *  - 4-Box pakai playerClassOf (RUMUS TAK BERUBAH, ambang 80/80).
 *  - Aspek budaya 360° dihitung per-periode (bobot/mapping per-periode) lalu DIRATA-RATA PER NAMA aspek.
 * Dipanggil ON-DEMAND (hanya saat scope agregat dipilih di filter) → tak membebani muat harian.
 * Baca via service_role (halaman sudah menjaga akses HRD/Direksi; data org-wide yang berwenang dilihat).
 */
export type AggRow = {
  id: string; name: string; nickname: string | null; dept: string;
  kpiAvg: number | null; s360: number | null; final: number | null;
  player: PlayerClass | null; axisIncomplete: boolean;
  isActive: boolean; kpiUnread: boolean; trend: 'empty'; kpiMonths: (number | null)[];
};
export type AggDeptMonthRow = { dept: string; cells: { ym: string; avg: number | null }[] };
export type AggDeptAspectRow = { dept: string; cells: { aspect: string; avg: number | null }[] };

export type AggregateBundle = {
  rows: AggRow[];
  deptScores: [string, number][];
  aspectScores: { aspek: string; score: number }[];
  deptAspect360: AggDeptAspectRow[];
  aspect360Names: string[];
  monthly: { ym: string; avg: number }[];
  deptMonthly: AggDeptMonthRow[];
  months: string[];
  has360: boolean;
  yearMonthly: { ym: string; avg: number }[];
  year360: { label: string; avg: number }[];
  yearKpiAvg: number | null;
  year360Avg: number | null;
};

type PeriodMeta = { id: string; label: string; has_360: boolean; start_date: string };
type Emp = { id: string; name: string; nickname: string | null; dept: string };

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Skor aspek budaya SATU periode → per NAMA aspek (org + per divisi). Meniru pipeline page.tsx. */
async function aspectForPeriod(
  admin: ReturnType<typeof createAdminClient>,
  periodId: string,
  empIds: string[],
  empDept: Map<string, string>,
  periodStart: string,
): Promise<{ org: Map<string, number>; dept: Map<string, number>; names: { name: string; order: number }[] }> {
  const org = new Map<string, number>();
  const dept = new Map<string, number>();
  // assessments satu periode (seluruh organisasi) bisa >1000 → dipaginasi.
  const [aspRes, asmtRows] = await Promise.all([
    admin.from('culture_aspects').select('id, name, order_idx').eq('period_id', periodId).order('order_idx'),
    fetchAllPaged<{ id: string; assessor_id: string; target_id: string }>((from, to) =>
      admin.from('assessments').select('id, assessor_id, target_id').eq('period_id', periodId).eq('status', 'submitted')
        .order('id').range(from, to)),
  ]);
  const aspectList = aspRes.data ?? [];
  const names = aspectList.map((a) => ({ name: a.name, order: a.order_idx ?? 0 }));
  if (aspectList.length === 0) return { org, dept, names };
  const inScope = (id: string) => empIds.includes(id);
  const nonSelfIds = asmtRows.filter((a) => a.assessor_id !== a.target_id && inScope(a.target_id)).map((a) => a.id);

  const [indRes, wsRes, mapsData, scoreRows] = await Promise.all([
    admin.from('indicators').select('id, aspect_id').in('aspect_id', aspectList.map((a) => a.id)),
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
  // 2 kelas Q3 2026 dst. → bobot otomatis BR-10 (effectiveModel).
  const wModel = effectiveModel((wsRes.data?.model ?? '4class') as Model360, periodStart);
  const wVals = (wsRes.data?.weights ?? {}) as WeightValues;
  const hasWS = !!wsRes.data;
  const relByPair = new Map<string, RelationKind>();
  mapsData.forEach((m) => relByPair.set(`${m.assessor_id}:${m.target_id}`, m.relation));
  const asmtInfo = new Map(asmtRows.map((a) => [a.id, { assessor: a.assessor_id, target: a.target_id }]));

  const aaRatings = new Map<string, number[]>(); // `${assessmentId}|${aspectId}`
  scoreRows.forEach((s) => {
    if (s.rating == null) return;
    const aid = indToAspect.get(s.indicator_id);
    if (!aid) return;
    const k = `${s.assessment_id}|${aid}`;
    const arr = aaRatings.get(k) ?? []; arr.push(s.rating); aaRatings.set(k, arr);
  });
  const emptyG = (): Groups360 => ({ atasan: [], peer: [], cross: [], bawahan: [], self: [] });
  const aspectG = new Map<string, Groups360>();
  const deptAspectG = new Map<string, Groups360>();
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
    let g = aspectG.get(aid); if (!g) { g = emptyG(); aspectG.set(aid, g); }
    g[cls].push(score100);
    const d = empDept.get(info.target);
    if (d) { const dk = `${d}|${aid}`; let dg = deptAspectG.get(dk); if (!dg) { dg = emptyG(); deptAspectG.set(dk, dg); } dg[cls].push(score100); }
  }
  const scoreOfG = (g: Groups360): number | null => {
    if (hasWS) return weightedScore360(g, wModel, wVals);
    const all = [...g.atasan, ...g.peer, ...g.cross, ...g.bawahan];
    return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
  };
  for (const [aid, g] of aspectG) { const s = scoreOfG(g); const nm = idToName.get(aid); if (nm && s != null && s > 0) org.set(nm, s); }
  for (const [dk, g] of deptAspectG) {
    const sep = dk.indexOf('|'); const d = dk.slice(0, sep), aid = dk.slice(sep + 1);
    const s = scoreOfG(g); const nm = idToName.get(aid);
    if (nm && s != null) dept.set(`${d}|${nm}`, s);
  }
  return { org, dept, names };
}

export async function computeDashboardAggregate(
  periods: PeriodMeta[],
  emps: Emp[],
  empIds: string[],
): Promise<AggregateBundle> {
  const admin = createAdminClient();
  const empDept = new Map(emps.map((e) => [e.id, e.dept]));
  const periodIds = periods.map((p) => p.id);
  const has360 = periods.some((p) => p.has_360);
  const empty: AggregateBundle = {
    rows: [], deptScores: [], aspectScores: [], deptAspect360: [], aspect360Names: [],
    monthly: [], deptMonthly: [], months: [], has360, yearMonthly: [], year360: [], yearKpiAvg: null, year360Avg: null,
  };
  if (periodIds.length === 0 || empIds.length === 0) return empty;

  // Bulan tiap periode + KPI + 360° lintas periode (semua via service_role, di-scope ke empIds).
  const { data: pmRows } = await admin.from('period_months').select('period_id, ym').in('period_id', periodIds);
  const ymToPeriod = new Map((pmRows ?? []).map((m) => [m.ym, m.period_id]));
  const yms = [...new Set((pmRows ?? []).map((m) => m.ym))].sort();
  // Lintas kuartal × seluruh pegawai → mudah >1000 baris & daftar id panjang → chunk + paginasi.
  const [kpiRows, r360Rows, repRows] = await Promise.all([
    yms.length
      ? fetchAllByIds<{ employee_id: string; ym: string; score: number }>(empIds, (chunk, from, to) =>
          admin.from('kpi_scores').select('employee_id, ym, score').in('ym', yms).in('employee_id', chunk)
            .order('employee_id').order('ym').range(from, to))
      : Promise.resolve([] as { employee_id: string; ym: string; score: number }[]),
    fetchAllByIds<{ employee_id: string; period_id: string; score: number | null }>(empIds, (chunk, from, to) =>
      admin.from('result_360').select('employee_id, period_id, score').in('period_id', periodIds).in('employee_id', chunk)
        .order('employee_id').order('period_id').range(from, to)),
    // Laporan per (pegawai, kuartal) → Skor Akhir resmi per kuartal (displayedFinalOf).
    fetchAllByIds<{ employee_id: string; period_id: string; status: string; final_score: number | null }>(empIds, (chunk, from, to) =>
      admin.from('final_reports').select('employee_id, period_id, status, final_score').in('period_id', periodIds).in('employee_id', chunk)
        .order('employee_id').order('period_id').range(from, to)),
  ]);
  const repOf = new Map(repRows.map((r) => [`${r.employee_id}|${r.period_id}`, r]));
  const periodMeta = new Map(periods.map((p) => [p.id, p]));

  // "Belum terbaca" PER (pegawai × kuartal) — kuartal itu dikecualikan dari rerata KPI & grafik
  // bulanan (selaras Dashboard satu-kuartal). Lihat lib/trend.ts.
  const ymsByPeriod = new Map<string, string[]>();
  (pmRows ?? []).forEach((m) => ymsByPeriod.set(m.period_id, [...(ymsByPeriod.get(m.period_id) ?? []), m.ym]));
  const empYmScore = new Map<string, Map<string, number>>();
  kpiRows.forEach((r) => {
    let m = empYmScore.get(r.employee_id); if (!m) { m = new Map(); empYmScore.set(r.employee_id, m); }
    m.set(r.ym, r.score);
  });
  const unreadEmpPeriod = new Set<string>();
  for (const [id, m] of empYmScore) {
    for (const [pid, pYms] of ymsByPeriod) {
      const first3 = [...pYms].sort().slice(0, 3);
      if (trendOf(first3.map((ym) => m.get(ym) ?? null)) === 'unread') unreadEmpPeriod.add(`${id}|${pid}`);
    }
  }

  // Per pegawai: KPI per periode (rata bulan) → rata antar-kuartal; 360° per periode → rata antar-kuartal.
  // empPerKpiAll = SEMUA kuartal berdata (fallback bila seluruh kuartalnya "belum terbaca").
  const empPerKpi = new Map<string, Map<string, { sum: number; n: number }>>();
  const empPerKpiAll = new Map<string, Map<string, { sum: number; n: number }>>();
  const monthAgg = new Map<string, { sum: number; n: number }>();          // ym → org KPI
  const dmAgg = new Map<string, { sum: number; n: number }>();             // `${dept}|${ym}`
  kpiRows.forEach((r) => {
    const pid = ymToPeriod.get(r.ym); if (!pid) return;
    let all = empPerKpiAll.get(r.employee_id); if (!all) { all = new Map(); empPerKpiAll.set(r.employee_id, all); }
    const aa = all.get(pid) ?? { sum: 0, n: 0 }; aa.sum += r.score; aa.n += 1; all.set(pid, aa);
    if (unreadEmpPeriod.has(`${r.employee_id}|${pid}`)) return;
    let m = empPerKpi.get(r.employee_id); if (!m) { m = new Map(); empPerKpi.set(r.employee_id, m); }
    const a = m.get(pid) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n += 1; m.set(pid, a);
    const ma = monthAgg.get(r.ym) ?? { sum: 0, n: 0 }; ma.sum += r.score; ma.n += 1; monthAgg.set(r.ym, ma);
    const d = empDept.get(r.employee_id);
    if (d) { const dk = `${d}|${r.ym}`; const da = dmAgg.get(dk) ?? { sum: 0, n: 0 }; da.sum += r.score; da.n += 1; dmAgg.set(dk, da); }
  });
  const empPer360 = new Map<string, Map<string, number>>();
  const p360Agg = new Map<string, { sum: number; n: number }>();           // period → org 360
  r360Rows.forEach((r) => {
    if (r.score == null) return;
    let m = empPer360.get(r.employee_id); if (!m) { m = new Map(); empPer360.set(r.employee_id, m); }
    m.set(r.period_id, r.score);
    const a = p360Agg.get(r.period_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n += 1; p360Agg.set(r.period_id, a);
  });

  const rows: AggRow[] = emps.map((e) => {
    // Seluruh kuartal berdatanya "belum terbaca" → tandai kpiUnread (dikeluarkan dari kategori & rerata
    // oleh DashboardVisual), nilai KPI tetap ditampilkan dari data yang ada.
    const km = empPerKpi.get(e.id);
    const kmAll = empPerKpiAll.get(e.id);
    const kpiUnread = !km && !!kmAll;
    const kpiSrc = km ?? kmAll;
    const kpiAvg = kpiSrc ? roundScore(mean([...kpiSrc.values()].map((a) => kpiAvgOf([a.sum / a.n])!))) : null;
    const sm = empPer360.get(e.id);
    const s360 = sm ? roundScore(mean([...sm.values()])) : null;
    // BR-11: satu sumbu kosong (termasuk periode tanpa 360°) → 'HRD_REVIEW'.
    const player = playerClassOf(kpiAvg, has360 ? s360 : null);
    const axisIncomplete = player === 'HRD_REVIEW';
    // Skor Akhir "semua kuartal" (keputusan HRD 2026-09-29) = rata-rata Skor Akhir PER KUARTAL,
    // tiap kuartal = rumus resmi, atau angka TERSIMPAN bila laporannya final.
    // Kuartal "belum terbaca" dilewati (kecuali SEMUA kuartalnya belum terbaca → pakai semuanya).
    const quarterFinals: number[] = [];
    const pids = new Set([...(kmAll?.keys() ?? []), ...(sm?.keys() ?? [])]);
    for (const pid of pids) {
      if (!kpiUnread && unreadEmpPeriod.has(`${e.id}|${pid}`)) continue;
      const p = periodMeta.get(pid); if (!p) continue;
      const qa = kmAll?.get(pid);
      const kpiQ = qa ? kpiAvgOf([qa.sum / qa.n]) : null;
      const key = `${e.id}|${pid}`;
      const fq = displayedFinalOf(finalScoreOf(kpiQ, sm?.get(pid) ?? null, p.has_360), repOf.get(key));
      if (fq != null) quarterFinals.push(fq);
    }
    const final = quarterFinals.length ? roundScore(mean(quarterFinals)) : null;
    return { id: e.id, name: e.name, nickname: e.nickname, dept: e.dept, kpiAvg, s360, final, player, axisIncomplete, isActive: true, kpiUnread, trend: 'empty' as const, kpiMonths: [] };
  })
    .filter((r) => r.kpiAvg != null || r.s360 != null)
    .sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

  const deptAgg = new Map<string, { sum: number; n: number }>();
  rows.forEach((r) => { if (r.kpiAvg == null || r.kpiUnread) return; const a = deptAgg.get(r.dept) ?? { sum: 0, n: 0 }; a.sum += r.kpiAvg; a.n += 1; deptAgg.set(r.dept, a); });
  const deptScores: [string, number][] = [...deptAgg.entries()].map(([d, a]) => [d, a.sum / a.n] as [string, number]).sort((a, b) => b[1] - a[1]);

  const monthly = yms.map((ym) => ({ ym, avg: monthAgg.has(ym) ? monthAgg.get(ym)!.sum / monthAgg.get(ym)!.n : 0 })).filter((m) => m.avg > 0);
  const deptListSorted = [...new Set(emps.map((e) => e.dept))].sort();
  const deptMonthly: AggDeptMonthRow[] = deptListSorted
    .map((d) => ({ dept: d, cells: yms.map((ym) => { const a = dmAgg.get(`${d}|${ym}`); return { ym, avg: a ? a.sum / a.n : null }; }) }))
    .filter((r) => r.cells.some((c) => c.avg != null));

  // Tren per periode (untuk grafik): KPI per periode (rata bulan) & 360° per periode.
  const periodsSorted = [...periods].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const year360 = periodsSorted.filter((p) => p360Agg.has(p.id)).map((p) => ({ label: p.label, avg: p360Agg.get(p.id)!.sum / p360Agg.get(p.id)!.n }));
  const yearKpiAvg = monthly.length ? monthly.reduce((s, m) => s + m.avg, 0) / monthly.length : null;
  const year360Avg = year360.length ? year360.reduce((s, m) => s + m.avg, 0) / year360.length : null;

  // Aspek budaya: hitung per periode (bobot/mapping per-periode) → rata-rata PER NAMA aspek antar periode.
  const orgByName = new Map<string, number[]>();
  const deptByName = new Map<string, number[]>();       // `${dept}|${name}`
  const nameOrder = new Map<string, number>();
  const perPeriodAspects = await Promise.all(periods.map((p) => aspectForPeriod(admin, p.id, empIds, empDept, p.start_date)));
  perPeriodAspects.forEach((res) => {
    res.names.forEach((n) => { if (!nameOrder.has(n.name)) nameOrder.set(n.name, n.order); });
    for (const [nm, v] of res.org) { const arr = orgByName.get(nm) ?? []; arr.push(v); orgByName.set(nm, arr); }
    for (const [dk, v] of res.dept) { const arr = deptByName.get(dk) ?? []; arr.push(v); deptByName.set(dk, arr); }
  });
  const aspect360Names = [...nameOrder.entries()].sort((a, b) => a[1] - b[1]).map(([nm]) => nm);
  const aspectScores = aspect360Names
    .map((nm) => ({ aspek: nm, score: mean(orgByName.get(nm) ?? []) ?? 0 }))
    .filter((a) => a.score > 0);
  const deptAspect360: AggDeptAspectRow[] = deptListSorted
    .map((d) => ({ dept: d, cells: aspect360Names.map((nm) => ({ aspect: nm, avg: mean(deptByName.get(`${d}|${nm}`) ?? []) })) }))
    .filter((r) => r.cells.some((c) => c.avg != null));

  return {
    rows, deptScores, aspectScores, deptAspect360, aspect360Names,
    monthly, deptMonthly, months: yms, has360,
    yearMonthly: monthly, year360, yearKpiAvg, year360Avg,
  };
}
