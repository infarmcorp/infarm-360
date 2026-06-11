import { createClient } from '@/lib/supabase/server';
import { KpiForm } from './kpi-form';

/**
 * Input KPI Anggota (SPV). Server Component: ambil anggota tim & bulan periode aktif
 * — semua sudah terfilter RLS, jadi SPV hanya melihat timnya sendiri.
 *
 * Query sengaja datar (tanpa embedded join) agar ter-tipe penuh dgn lib/database.types.ts
 * yang masih subset; ganti ke join saat tipe hasil `supabase gen types` dipakai.
 */
export default async function KpiPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <p className="p-6">Sesi berakhir. Silakan login ulang.</p>;
  }

  // Anggota tim (RLS membatasi ke tim SPV yang login).
  const { data: teamRows } = await supabase
    .from('spv_team_members')
    .select('employee_id')
    .eq('spv_id', auth.user.id);
  const memberIds = (teamRows ?? []).map((r) => r.employee_id);

  const { data: emps } = memberIds.length
    ? await supabase
        .from('employees')
        .select('id, emp_code, name, dept')
        .in('id', memberIds)
    : { data: [] };
  const members = (emps ?? []).map((e) => ({
    id: e.id,
    code: e.emp_code,
    name: e.name,
    dept: e.dept,
  }));

  // Bulan-bulan dalam periode aktif.
  const { data: activePeriods } = await supabase
    .from('periods')
    .select('id')
    .eq('status', 'active');
  const periodIds = (activePeriods ?? []).map((p) => p.id);

  const { data: monthRows } = periodIds.length
    ? await supabase
        .from('period_months')
        .select('ym')
        .in('period_id', periodIds)
        .order('ym')
    : { data: [] };
  const monthOptions = (monthRows ?? []).map((m) => m.ym);

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
