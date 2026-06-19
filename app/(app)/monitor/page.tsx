import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { MonitorChart, type EmpTrend } from './monitor-chart';

/**
 * Monitor Kinerja (SPV/HRD) — tren bulanan KPI / 360° / Skor Akhir per pegawai.
 * SPV dibatasi anggota timnya; HRD admin seluruh pegawai non-direksi. Lintas periode
 * (semua bulan yang punya KPI). Skor Akhir per bulan = blend KPI+360 kuartal terkait − punishment.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelOf = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1] ?? m}'${y.slice(2)}`;
};

export default async function MonitorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  const role = me?.role;
  if (role !== 'spv' && !canAdmin(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV / HRD.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // Mode HRD (dual-mode): mode-SPV dibatasi seperti SPV (hanya divisinya sendiri).
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'spv' ? 'spv' : 'admin';

  // Lingkup pegawai. SPV → tim; HRD mode-SPV → hanya DIVISINYA (selaras Input KPI/Rekap);
  // HRD admin → semua pegawai non-direksi.
  let empRows: { id: string; name: string; dept: string }[] = [];
  if (role === 'spv') {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', user.id);
    // SPV juga memantau dirinya sendiri (selaras Input KPI/Riwayat/Rekap/Laporan-Tim).
    const ids = [...new Set([user.id, ...(team ?? []).map((t) => t.employee_id)])];
    const { data } = await supabase.from('employees').select('id, name, dept').in('id', ids);
    empRows = data ?? [];
  } else if (role === 'hrd' && hrdMode === 'spv') {
    const { data: meDept } = await supabase.from('employees').select('dept').eq('id', user.id).maybeSingle();
    const { data } = await supabase.from('employees').select('id, name, dept')
      .eq('dept', meDept?.dept ?? '__none__').neq('role', 'direksi');
    empRows = data ?? [];
  } else {
    const { data } = await supabase.from('employees').select('id, name, dept').neq('role', 'direksi');
    empRows = data ?? [];
  }

  if (empRows.length === 0) {
    return <Shell><Header /><p className="text-sm text-gray-500 mt-4">Belum ada pegawai dalam lingkup Anda.</p></Shell>;
  }
  const empIds = empRows.map((e) => e.id);

  // Periode + bulan + skor — semua independen (hanya butuh empIds) → paralel.
  const [periodsRes, pmonthsRes, kpiRes, r360Res, penRes] = await Promise.all([
    supabase.from('periods').select('id, label, has_360, start_date').order('start_date', { ascending: true }),
    supabase.from('period_months').select('period_id, ym'),
    supabase.from('kpi_scores').select('employee_id, ym, score').in('employee_id', empIds),
    supabase.from('result_360').select('employee_id, period_id, score').in('employee_id', empIds),
    supabase.from('compliance_penalties').select('employee_id, period_id, points').in('employee_id', empIds),
  ]);
  const periodInfo = periodsRes.data ?? [];
  const periodHas360 = new Map(periodInfo.map((p) => [p.id, p.has_360]));
  const ymToPeriod = new Map((pmonthsRes.data ?? []).map((m) => [m.ym, m.period_id]));
  const monthsByPeriod = new Map<string, string[]>();
  (pmonthsRes.data ?? []).forEach((m) => { const a = monthsByPeriod.get(m.period_id) ?? []; a.push(m.ym); monthsByPeriod.set(m.period_id, a); });
  const kpiRows = kpiRes.data;
  const s360By = new Map((r360Res.data ?? []).map((r) => [`${r.employee_id}|${r.period_id}`, r.score]));
  const penBy = new Map((penRes.data ?? []).map((p) => [`${p.employee_id}|${p.period_id}`, p.points]));

  // KPI per (employee, ym) → rerata bila ada beberapa baris.
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  (kpiRows ?? []).forEach((r) => {
    const k = `${r.employee_id}|${r.ym}`;
    const a = kpiAgg.get(k) ?? { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; kpiAgg.set(k, a);
  });

  const employees: EmpTrend[] = empRows.map((e) => {
    // Tren per bulan.
    const yms = [...new Set((kpiRows ?? []).filter((r) => r.employee_id === e.id).map((r) => r.ym))].sort();
    const trend = yms.map((ym) => {
      const agg = kpiAgg.get(`${e.id}|${ym}`)!;
      const kpi = agg.sum / agg.n;
      const pid = ymToPeriod.get(ym);
      const has360 = pid ? !!periodHas360.get(pid) : false;
      const s360 = pid && has360 ? (s360By.get(`${e.id}|${pid}`) ?? 0) : 0;
      const penalty = pid ? (penBy.get(`${e.id}|${pid}`) ?? 0) : 0;
      const base = has360 && s360 > 0 ? kpi * 0.5 + s360 * 0.5 : kpi;
      return { ym, label: labelOf(ym), kpi, s360, final: Math.max(0, base - penalty) };
    });
    // Ringkasan per periode (untuk mode Perbandingan).
    const byPeriod = periodInfo.map((p) => {
      const pYms = monthsByPeriod.get(p.id) ?? [];
      const kpis = pYms.map((ym) => { const ag = kpiAgg.get(`${e.id}|${ym}`); return ag ? ag.sum / ag.n : null; }).filter((v): v is number => v != null);
      const kpiAvg = kpis.length ? kpis.reduce((a, b) => a + b, 0) / kpis.length : null;
      const s360 = p.has_360 ? (s360By.get(`${e.id}|${p.id}`) ?? null) : null;
      const penalty = penBy.get(`${e.id}|${p.id}`) ?? 0;
      if (kpiAvg == null && s360 == null) return null;
      const base = p.has_360 && s360 != null && s360 > 0 ? (kpiAvg ?? 0) * 0.5 + s360 * 0.5 : (kpiAvg ?? 0);
      const final = kpiAvg == null && s360 == null ? null : Math.max(0, base - penalty);
      return { periodId: p.id, label: p.label, kpi: kpiAvg, s360, final };
    }).filter((x): x is NonNullable<typeof x> => x != null);
    return { id: e.id, name: e.name, dept: e.dept, trend, byPeriod };
  }).filter((e) => e.trend.length > 0 || e.byPeriod.length > 0);

  const periods = periodInfo.map((p) => ({ id: p.id, label: p.label }));

  return (
    <Shell>
      <Header />
      <div className="mt-5">
        {employees.length > 0
          ? <MonitorChart employees={employees} periods={periods} />
          : <p className="text-sm text-gray-500">Belum ada data kinerja untuk pegawai dalam lingkup Anda.</p>}
      </div>
    </Shell>
  );
}

function Header() {
  return (
    <div className="bg-gradient-to-r from-emerald-800 to-indigo-900 rounded-2xl p-5 sm:p-6 text-white shadow-md relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <span className="inline-flex py-1 px-2.5 bg-white/10 rounded-full text-[10px] font-bold tracking-wider uppercase border border-white/15">
            Sistem Intelijen Kinerja Tim
          </span>
          <h1 className="text-xl font-bold tracking-tight">Monitor Kinerja &amp; Tren Karyawan</h1>
          <p className="text-xs text-emerald-100/90 leading-relaxed max-w-2xl">
            Pemetaan performa berbasis KPI Rerata, Evaluasi 360°, &amp; Skor Akhir — bandingkan antar-pegawai
            atau telusuri tren bulanan per individu, terfilter divisi &amp; periode.
          </p>
        </div>
        <Link href="/" className="text-[11px] text-emerald-200 hover:text-white shrink-0">← Beranda</Link>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
