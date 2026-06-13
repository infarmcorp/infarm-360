import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  finalScoreOf, talentBoxOf, playerClassOf,
} from '@/lib/scoring';
import { DashboardVisual } from './dashboard-visual';

/**
 * Dashboard Organisasi (HRD) — versi termigrasi Supabase.
 * Gabung Rerata KPI (periode aktif) + result_360 + punishment → Skor Akhir,
 * lalu klasifikasi 9-Box & 4-Box. Dikunci ke periode aktif (KPI, 360, Skor sefase).
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd' && me?.role !== 'direksi') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk HRD / Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  // Pegawai non-direksi.
  const { data: empRows } = await supabase
    .from('employees').select('id, name, dept').neq('role', 'direksi');
  const emps = empRows ?? [];

  // Bulan periode aktif → rerata KPI per pegawai.
  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', ap.id);
  const ymList = (months ?? []).map((m) => m.ym);
  const { data: kpiRows } = ymList.length
    ? await supabase.from('kpi_scores').select('employee_id, score').in('ym', ymList)
    : { data: [] };
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  (kpiRows ?? []).forEach((r) => {
    const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; kpiAgg.set(r.employee_id, a);
  });

  // Skor 360 (hasil komputasi) + punishment.
  const { data: r360 } = await supabase
    .from('result_360').select('employee_id, score').eq('period_id', ap.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));

  const { data: pen } = await supabase
    .from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));

  const rows = emps.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const penalty = penBy.get(e.id) ?? 0;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penalty);
    const box = kpiAvg != null && s360 != null ? talentBoxOf(kpiAvg, s360) : null;
    const player = final != null && kpiAvg != null
      ? playerClassOf(final, kpiAvg, s360, ap.has_360) : null;
    return { id: e.id, name: e.name, dept: e.dept, kpiAvg, s360, final, box, player };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

  // Rerata KPI per departemen (untuk bar chart visual).
  const deptAgg = new Map<string, { sum: number; n: number }>();
  rows.forEach((r) => {
    if (r.kpiAvg == null) return;
    const a = deptAgg.get(r.dept) ?? { sum: 0, n: 0 };
    a.sum += r.kpiAvg; a.n += 1; deptAgg.set(r.dept, a);
  });
  const deptScores: [string, number][] = [...deptAgg.entries()]
    .map(([d, a]) => [d, a.sum / a.n] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  // Rataan sub-aspek 360° (rating ×20), dari penilaian terkirim periode aktif, Self dikecualikan.
  const { data: aspectRows } = await supabase
    .from('culture_aspects').select('id, name, order_idx').eq('period_id', ap.id).order('order_idx');
  const aspectList = aspectRows ?? [];
  const { data: indRows } = aspectList.length
    ? await supabase.from('indicators').select('id, aspect_id').in('aspect_id', aspectList.map((a) => a.id))
    : { data: [] };
  const indToAspect = new Map((indRows ?? []).map((i) => [i.id, i.aspect_id]));
  const { data: asmtRows } = await supabase
    .from('assessments').select('id, assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted');
  const nonSelfIds = (asmtRows ?? []).filter((a) => a.assessor_id !== a.target_id).map((a) => a.id);
  const { data: scoreRows } = nonSelfIds.length
    ? await supabase.from('assessment_indicator_scores').select('indicator_id, rating').in('assessment_id', nonSelfIds)
    : { data: [] };
  const aspAgg = new Map<string, { sum: number; n: number }>();
  (scoreRows ?? []).forEach((s) => {
    const aid = indToAspect.get(s.indicator_id);
    if (!aid || s.rating == null) return;
    const a = aspAgg.get(aid) ?? { sum: 0, n: 0 };
    a.sum += s.rating; a.n += 1; aspAgg.set(aid, a);
  });
  const aspectScores = aspectList
    .map((a) => ({ aspek: a.name, score: aspAgg.has(a.id) ? (aspAgg.get(a.id)!.sum / aspAgg.get(a.id)!.n) * 20 : 0 }))
    .filter((a) => a.score > 0);

  return (
    <Shell>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard Organisasi</h1>
          <p className="text-sm text-gray-500">
            Periode aktif: {ap.label} · {ap.has_360 ? '360° aktif (blend 50/50)' : '360° nonaktif (KPI murni)'}
          </p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="my-5">
        <DashboardVisual
          rows={rows.map((r) => ({
            id: r.id, name: r.name, dept: r.dept,
            kpiAvg: r.kpiAvg, s360: r.s360, final: r.final,
            boxKey: r.box?.key ?? null, player: r.player,
          }))}
          deptScores={deptScores}
          aspectScores={aspectScores}
          has360={ap.has_360}
          periodLabel={ap.label}
        />
      </div>

      <details className="mt-6 group">
        <summary className="cursor-pointer text-xs font-bold text-gray-500 uppercase tracking-wider hover:text-gray-700 select-none">
          ▸ Tabel Rinci Skor Seluruh Pegawai
        </summary>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3 text-center">Rerata KPI</th>
              <th className="py-2 px-3 text-center">Skor 360°</th>
              <th className="py-2 px-3 text-center">Skor Akhir</th>
              <th className="py-2 px-3">9-Box</th>
              <th className="py-2 pl-3 text-center">Player</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3">
                  <span className="font-bold text-gray-800 block">{r.name}</span>
                  <span className="text-[11px] text-gray-400">{r.dept}</span>
                </td>
                <td className="py-3 px-3 text-center font-mono text-emerald-700">{r.kpiAvg != null ? r.kpiAvg.toFixed(1) : '—'}</td>
                <td className="py-3 px-3 text-center font-mono text-indigo-700">{r.s360 != null ? r.s360.toFixed(1) : '—'}</td>
                <td className="py-3 px-3 text-center font-mono font-black text-slate-800">{r.final != null ? r.final.toFixed(1) : '—'}</td>
                <td className="py-3 px-3">
                  {r.box ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border"
                      style={{ color: r.box.color, borderColor: r.box.color, backgroundColor: `${r.box.color}14` }}>
                      {r.box.label}
                    </span>
                  ) : <span className="text-gray-400 text-xs italic">N/A</span>}
                </td>
                <td className="py-3 pl-3 text-center">
                  {r.player ? (
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${
                      r.player === 'A' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      r.player === 'B' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      r.player === 'C' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-rose-50 text-rose-700 border-rose-200'}`}>
                      {r.player}
                    </span>
                  ) : <span className="text-gray-400 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 italic mt-3">
        Skor Akhir = blend KPI+360 (50/50) − punishment, dikunci periode aktif. 9-Box butuh KPI &amp; 360;
        N/A bila salah satu belum ada. A Player butuh 360° aktif.
      </p>
      </details>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
