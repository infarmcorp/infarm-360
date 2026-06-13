import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { KpiForm } from './kpi-form';
import { RekapView } from './rekap-view';

/**
 * Kinerja Tim (SPV/HRD/Direksi). Dua tab: "Input KPI" (SPV/HRD isi skor bulanan tim)
 * & "Rekapitulasi Kuartal" (ringkasan per periode). Direksi hanya tab Rekap (read-only).
 * Tab via ?tab=input|rekap. RLS membatasi data ke lingkup peran.
 */
export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  const { tab: tabParam, period } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  const role = me?.role ?? 'employee';
  const canInput = role === 'spv' || role === 'hrd';
  const canView = canInput || role === 'direksi';
  if (!canView) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV / HRD / Direksi.</p></Shell>;
  }

  // Tab efektif: Direksi tak bisa input → default rekap.
  const tab = tabParam === 'rekap' || (tabParam !== 'input' && !canInput) ? 'rekap' : 'input';

  return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-800">Kinerja Tim</h1>
      <p className="mt-1 text-sm text-gray-500">Input KPI bulanan &amp; rekapitulasi per kuartal anggota tim.</p>

      {/* Tab nav */}
      <div className="flex gap-1 mt-4 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {canInput && <Tab href="/kpi?tab=input" active={tab === 'input'}>Input KPI</Tab>}
        <Tab href="/kpi?tab=rekap" active={tab === 'rekap'}>Rekapitulasi Kuartal</Tab>
      </div>

      {tab === 'input' && canInput ? (
        <InputTab supabase={supabase} userId={user.id} />
      ) : (
        <RekapView role={role} userId={user.id} periodParam={period} />
      )}
    </Shell>
  );
}

/** Tab Input KPI: anggota tim + bulan periode aktif (RLS membatasi ke tim SPV). */
async function InputTab({
  supabase, userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>; userId: string;
}) {
  const { data: teamRows } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
  const memberIds = (teamRows ?? []).map((r) => r.employee_id);
  const { data: emps } = memberIds.length
    ? await supabase.from('employees').select('id, emp_code, name, dept').in('id', memberIds)
    : { data: [] };
  const members = (emps ?? []).map((e) => ({ id: e.id, code: e.emp_code, name: e.name, dept: e.dept }));

  const { data: activePeriods } = await supabase.from('periods').select('id').eq('status', 'active');
  const periodIds = (activePeriods ?? []).map((p) => p.id);
  const { data: monthRows } = periodIds.length
    ? await supabase.from('period_months').select('ym').in('period_id', periodIds).order('ym')
    : { data: [] };
  const monthOptions = (monthRows ?? []).map((m) => m.ym);

  if (members.length === 0) return <p className="text-sm text-gray-500">Belum ada anggota tim yang ditugaskan kepada Anda.</p>;
  if (monthOptions.length === 0) return <p className="text-sm text-gray-500">Tidak ada periode aktif. Hubungi HRD untuk mengaktifkan siklus.</p>;

  return <KpiForm members={members} months={monthOptions} />;
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
        active ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
