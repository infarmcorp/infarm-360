import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MonitorChart, type EmpTrend } from './monitor-chart';

/**
 * Monitor Kinerja (SPV/HRD/Direksi) — tren bulanan KPI / 360° / Skor Akhir per pegawai.
 * SPV dibatasi anggota timnya; HRD/Direksi seluruh pegawai non-direksi. Lintas periode
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
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  const role = me?.role;
  if (role !== 'spv' && role !== 'hrd' && role !== 'direksi') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV / HRD / Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // Lingkup pegawai.
  let empRows: { id: string; name: string; dept: string }[] = [];
  if (role === 'spv') {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', user.id);
    const ids = (team ?? []).map((t) => t.employee_id);
    if (ids.length) {
      const { data } = await supabase.from('employees').select('id, name, dept').in('id', ids);
      empRows = data ?? [];
    }
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
    supabase.from('periods').select('id, has_360'),
    supabase.from('period_months').select('period_id, ym'),
    supabase.from('kpi_scores').select('employee_id, ym, score').in('employee_id', empIds),
    supabase.from('result_360').select('employee_id, period_id, score').in('employee_id', empIds),
    supabase.from('compliance_penalties').select('employee_id, period_id, points').in('employee_id', empIds),
  ]);
  const periodHas360 = new Map((periodsRes.data ?? []).map((p) => [p.id, p.has_360]));
  const ymToPeriod = new Map((pmonthsRes.data ?? []).map((m) => [m.ym, m.period_id]));
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
    return { id: e.id, name: e.name, dept: e.dept, trend };
  }).filter((e) => e.trend.length > 0);

  return (
    <Shell>
      <Header />
      <div className="mt-5">
        {employees.length > 0
          ? <MonitorChart employees={employees} />
          : <p className="text-sm text-gray-500">Belum ada data KPI bulanan untuk pegawai dalam lingkup Anda.</p>}
      </div>
    </Shell>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Monitor Kinerja</h1>
        <p className="text-sm text-gray-500">Tren bulanan KPI, Evaluasi 360°, &amp; Skor Akhir per pegawai.</p>
      </div>
      <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
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
