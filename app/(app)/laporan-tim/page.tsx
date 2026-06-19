import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TeamTable, type TeamRow } from './team-table';

/**
 * Laporan Kinerja Tim (SPV): tinjau & ACC laporan anggota tim.
 * RLS membatasi baca/ACC ke anggota tim (is_my_member). ACC perlu laporan draf dari HRD.
 * Baris SPV sendiri ikut ditampilkan agar SPV bisa memantau laporannya (migrasi 0009);
 * baca termasuk draf, tetapi ACC sendiri tidak diizinkan.
 */
export default async function LaporanTimPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('role, name, dept').eq('id', user.id).maybeSingle();
  if (me?.role !== 'spv' && me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk Supervisor.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', user.id);
  const memberIds = (team ?? []).map((t) => t.employee_id);
  const { data: emps } = memberIds.length
    ? await supabase.from('employees').select('id, name, dept').in('id', memberIds) : { data: [] };
  const members = emps ?? [];

  // Sertakan baris SPV sendiri (di luar anggota tim formal) untuk pemantauan laporan pribadi.
  const selfRow = me.role === 'spv' ? { id: user.id, name: me.name, dept: me.dept } : null;
  const reportIds = [...memberIds, ...(selfRow ? [user.id] : [])];

  const { data: reports } = reportIds.length
    ? await supabase.from('final_reports').select('employee_id, status, spv_acc, final_score')
        .eq('period_id', ap.id).in('employee_id', reportIds)
    : { data: [] };
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  const toRow = (e: { id: string; name: string; dept: string | null }, isSelf: boolean): TeamRow => {
    const rep = repBy.get(e.id);
    return {
      id: e.id,
      name: e.name,
      dept: e.dept,
      finalScore: rep?.final_score ?? null,
      status: rep?.status ?? null,
      hasReport: !!rep,
      spvAcc: !!rep?.spv_acc,
      isSelf,
    };
  };

  const rows: TeamRow[] = [
    ...members.map((e) => toRow(e, false)),
    ...(selfRow ? [toRow(selfRow, true)] : []),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Laporan Kinerja Tim</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · beri ACC laporan anggota tim Anda.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Belum ada anggota tim yang ditugaskan.</p>
      ) : (
        <TeamTable rows={rows} />
      )}
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
