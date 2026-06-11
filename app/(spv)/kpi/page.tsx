import { createClient } from '@/lib/supabase/server';
import { KpiForm } from './kpi-form';

/**
 * Input KPI Anggota (SPV). Server Component: ambil anggota tim & bulan periode aktif
 * — semua sudah terfilter RLS, jadi SPV hanya melihat timnya sendiri.
 */
export default async function KpiPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <p className="p-6">Sesi berakhir. Silakan login ulang.</p>;
  }

  // Anggota tim (RLS spv_team_members + employees membatasi ke tim sendiri).
  const { data: team } = await supabase
    .from('spv_team_members')
    .select('employee_id, employees!inner(id, emp_code, name, dept)')
    .eq('spv_id', auth.user.id);

  // Bulan-bulan dalam periode aktif.
  const { data: months } = await supabase
    .from('period_months')
    .select('ym, periods!inner(label, status)')
    .eq('periods.status', 'active')
    .order('ym');

  const members = (team ?? []).map((t) => {
    const e = t.employees as unknown as { id: string; emp_code: string; name: string; dept: string };
    return { id: e.id, code: e.emp_code, name: e.name, dept: e.dept };
  });
  const monthOptions = (months ?? []).map((m) => m.ym);

  if (members.length === 0) {
    return <p className="p-6">Belum ada anggota tim yang ditugaskan kepada Anda.</p>;
  }
  if (monthOptions.length === 0) {
    return <p className="p-6">Tidak ada periode aktif. Hubungi HRD untuk mengaktifkan siklus.</p>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Input KPI Bulanan</h1>
      <p className="mt-1 text-sm text-gray-500">
        Pengisian Manual Apps — skor 0–100 untuk tiap anggota tim.
      </p>
      <KpiForm members={members} months={monthOptions} />
    </main>
  );
}
