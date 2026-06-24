import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { finalScoreOf } from '@/lib/scoring';
import { ReportTable, type ReportRow } from './report-table';

/**
 * Review Hasil Akhir (HRD): hitung Skor Akhir tiap pegawai, lihat ACC SPV & status,
 * lalu Simpan Draf / Finalisasi. Finalisasi → pegawai dapat melihat di Laporan Hasil Saya.
 */
export default async function AdminLaporanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: emps } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi').eq('is_external', false);
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

  const rows: ReportRow[] = employees.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penBy.get(e.id) ?? 0);
    const rep = repBy.get(e.id);
    return { id: e.id, name: e.name, dept: e.dept, final, status: rep?.status ?? null, spvAcc: !!rep?.spv_acc };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));
  const depts = [...new Set(employees.map((e) => e.dept))].sort();

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Review Hasil Akhir</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · finalisasi Skor Akhir kalibrasi.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <ReportTable rows={rows} depts={depts} />
      <p className="text-[10px] text-gray-500 italic mt-3">
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
