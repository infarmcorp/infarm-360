import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { finalScoreOf } from '@/lib/scoring';
import { ReportRowActions } from './report-row';

/**
 * Review Hasil Akhir (HRD): hitung Skor Akhir tiap pegawai, lihat ACC SPV & status,
 * lalu Simpan Draf / Finalisasi. Finalisasi → pegawai dapat melihat di Laporan Hasil Saya.
 */
export default async function AdminLaporanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: emps } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi');
  const employees = emps ?? [];

  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', ap.id);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpiRows } = yms.length
    ? await supabase.from('kpi_scores').select('employee_id, score').in('ym', yms) : { data: [] };
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  (kpiRows ?? []).forEach((r) => { const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n++; kpiAgg.set(r.employee_id, a); });

  const { data: r360 } = await supabase.from('result_360').select('employee_id, score').eq('period_id', ap.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const { data: pen } = await supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));
  const { data: reports } = await supabase
    .from('final_reports').select('employee_id, status, spv_acc, final_score').eq('period_id', ap.id);
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  const rows = employees.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penBy.get(e.id) ?? 0);
    const rep = repBy.get(e.id);
    return { id: e.id, name: e.name, dept: e.dept, final, rep };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Review Hasil Akhir</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · finalisasi Skor Akhir kalibrasi.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
            <th className="py-2 pr-3">Pegawai</th>
            <th className="py-2 px-3 text-center">Skor Akhir</th>
            <th className="py-2 px-3 text-center">ACC SPV</th>
            <th className="py-2 px-3 text-center">Status</th>
            <th className="py-2 pl-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-3 pr-3">
                <Link href={`/laporan/${r.id}`} className="font-bold text-gray-800 block hover:text-emerald-700 hover:underline">{r.name}</Link>
                <span className="text-[11px] text-gray-400">{r.dept}</span>
              </td>
              <td className="py-3 px-3 text-center font-mono font-black text-slate-800">
                {r.final != null ? r.final.toFixed(1) : '—'}
              </td>
              <td className="py-3 px-3 text-center">
                {r.rep?.spv_acc
                  ? <span className="text-[10px] font-bold text-emerald-700">✔ ACC</span>
                  : <span className="text-[10px] text-gray-400">belum</span>}
              </td>
              <td className="py-3 px-3 text-center">
                {r.rep?.status === 'finalized'
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Final</span>
                  : r.rep?.status === 'draft'
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Draf</span>
                  : <span className="text-[10px] text-gray-400">—</span>}
              </td>
              <td className="py-3 pl-3 text-right">
                <ReportRowActions employeeId={r.id} canCompute={r.final != null} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 italic mt-3">
        Alur ideal: Simpan Draf → SPV ACC (Laporan Kinerja Tim) → Finalisasi. Setelah final,
        pegawai melihatnya di Laporan Hasil Saya.
      </p>
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
