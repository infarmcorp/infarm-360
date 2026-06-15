import { createClient } from '@/lib/supabase/server';
import { finalScoreOf, playerClassOf } from '@/lib/scoring';
import { PeriodSelect } from './period-select';

/**
 * Rekapitulasi Kuartal — tab di dalam Input KPI. Tabel per periode: KPI tiap bulan,
 * Rataan KPI, Hasil 360°, Skor Akhir, Kategori. SPV → tim (RLS is_my_member),
 * HRD/Direksi → semua pegawai non-direksi. Periode dipilih via ?tab=rekap&period=<id>.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelOf = (ym: string) => { const [, m] = ym.split('-'); return MONTHS[Number(m) - 1] ?? m; };
const KAT = (f: number | null) =>
  f == null ? { t: '—', c: 'text-gray-400' }
    : f >= 90 ? { t: 'Sangat Baik', c: 'text-emerald-700' }
    : f >= 80 ? { t: 'Baik', c: 'text-blue-700' }
    : f >= 70 ? { t: 'Cukup', c: 'text-amber-700' }
    : { t: 'Perlu Pembinaan', c: 'text-rose-700' };

export async function RekapView({ role, userId, periodParam, hrdMode = 'admin' }: { role: string; userId: string; periodParam?: string; hrdMode?: 'admin' | 'spv' }) {
  const supabase = await createClient();

  const { data: periods } = await supabase.from('periods').select('id, label, has_360, status').order('label');
  const periodList = periods ?? [];
  if (periodList.length === 0) return <p className="text-sm text-gray-500">Belum ada periode.</p>;
  const sel = periodList.find((p) => p.id === periodParam)
    ?? periodList.find((p) => p.status === 'active')
    ?? periodList[0];

  // Lingkup pegawai. SPV → tim; HRD mode-SPV → hanya DIVISINYA (selaras Input KPI);
  // HRD admin / Direksi → semua pegawai non-direksi.
  let empRows: { id: string; name: string; dept: string }[] = [];
  if (role === 'spv') {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
    const ids = (team ?? []).map((t) => t.employee_id);
    if (ids.length) {
      const { data } = await supabase.from('employees').select('id, name, dept').in('id', ids);
      empRows = data ?? [];
    }
  } else if (role === 'hrd' && hrdMode === 'spv') {
    const { data: me } = await supabase.from('employees').select('dept').eq('id', userId).maybeSingle();
    const { data } = await supabase.from('employees').select('id, name, dept')
      .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi');
    empRows = data ?? [];
  } else {
    const { data } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi');
    empRows = data ?? [];
  }
  empRows.sort((a, b) => a.name.localeCompare(b.name));

  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', sel.id).order('ym');
  const ymList = (months ?? []).map((m) => m.ym);
  const empIds = empRows.map((e) => e.id);

  const { data: kpiRows } = empIds.length && ymList.length
    ? await supabase.from('kpi_scores').select('employee_id, ym, score').in('employee_id', empIds).in('ym', ymList)
    : { data: [] };
  const kpiByCell = new Map<string, { sum: number; n: number }>();
  (kpiRows ?? []).forEach((r) => {
    const k = `${r.employee_id}|${r.ym}`;
    const a = kpiByCell.get(k) ?? { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; kpiByCell.set(k, a);
  });

  const { data: r360 } = empIds.length
    ? await supabase.from('result_360').select('employee_id, score').eq('period_id', sel.id).in('employee_id', empIds)
    : { data: [] };
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const { data: pen } = empIds.length
    ? await supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', sel.id).in('employee_id', empIds)
    : { data: [] };
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));

  const rows = empRows.map((e) => {
    const monthly = ymList.map((ym) => {
      const a = kpiByCell.get(`${e.id}|${ym}`);
      return a ? a.sum / a.n : null;
    });
    const present = monthly.filter((v): v is number => v != null);
    const kpiAvg = present.length ? present.reduce((s, v) => s + v, 0) / present.length : null;
    const s360 = s360By.get(e.id) ?? null;
    const penalty = penBy.get(e.id) ?? 0;
    const final = finalScoreOf(kpiAvg, s360, sel.has_360, penalty);
    const player = final != null && kpiAvg != null ? playerClassOf(final, kpiAvg, s360, sel.has_360) : null;
    return { ...e, monthly, kpiAvg, s360, final, player };
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <p className="text-sm text-gray-500">Ringkasan KPI bulanan, 360°, &amp; Skor Akhir per kuartal.</p>
        <PeriodSelect periods={periodList} current={sel.id} />
      </div>
      {!sel.has_360 && (
        <div className="mb-3 bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
          Kuartal ini bertipe <strong>KPI Saja</strong> — 360° diabaikan; Skor Akhir = 100% KPI.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[9px] uppercase tracking-wider text-gray-400 font-bold">
              <th className="py-2.5 px-3">Pegawai</th>
              {ymList.map((ym) => <th key={ym} className="py-2.5 px-3 text-center">{labelOf(ym)}</th>)}
              <th className="py-2.5 px-3 text-center">Rataan KPI</th>
              {sel.has_360 && <th className="py-2.5 px-3 text-center">Hasil 360°</th>}
              <th className="py-2.5 px-3 text-center">Skor Akhir</th>
              <th className="py-2.5 px-3 text-right">Kategori</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={ymList.length + 4} className="py-6 text-center text-gray-400 italic">Tidak ada pegawai dalam lingkup Anda.</td></tr>
            )}
            {rows.map((r) => {
              const kat = KAT(r.final);
              return (
                <tr key={r.id} className="hover:bg-gray-50/40">
                  <td className="py-3 px-3">
                    <span className="font-bold text-gray-800 block">{r.name}</span>
                    <span className="text-[10px] text-gray-400">{r.dept}</span>
                  </td>
                  {r.monthly.map((v, i) => (
                    <td key={i} className="py-3 px-3 text-center font-mono text-gray-500">{v != null ? v.toFixed(1) : '—'}</td>
                  ))}
                  <td className="py-3 px-3 text-center font-mono font-bold text-emerald-700">{r.kpiAvg != null ? r.kpiAvg.toFixed(1) : '—'}</td>
                  {sel.has_360 && <td className="py-3 px-3 text-center font-mono font-bold text-indigo-700">{r.s360 != null ? r.s360.toFixed(1) : '—'}</td>}
                  <td className="py-3 px-3 text-center font-mono font-black text-slate-900 text-sm">{r.final != null ? r.final.toFixed(1) : '—'}</td>
                  <td className={`py-3 px-3 text-right font-bold ${kat.c}`}>{kat.t}{r.player ? ` · ${r.player}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 italic mt-3">
        Rataan KPI = rerata bulan ber-skor di kuartal ini. Skor Akhir = blend KPI+360 (50/50) − punishment
        {sel.has_360 ? '' : ' (kuartal KPI saja → 100% KPI)'}. Kategori: ≥90 Sangat Baik · ≥80 Baik · ≥70 Cukup · &lt;70 Perlu Pembinaan.
      </p>
    </div>
  );
}
