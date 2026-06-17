import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AccButton } from './acc-button';

/**
 * Laporan Kinerja Tim (SPV): tinjau & ACC laporan anggota tim.
 * RLS membatasi baca/ACC ke anggota tim (is_my_member). ACC perlu laporan draf dari HRD.
 */
export default async function LaporanTimPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
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

  const { data: reports } = memberIds.length
    ? await supabase.from('final_reports').select('employee_id, status, spv_acc, final_score')
        .eq('period_id', ap.id).in('employee_id', memberIds)
    : { data: [] };
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  const rows = members
    .map((e) => ({ id: e.id, name: e.name, dept: e.dept, rep: repBy.get(e.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

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
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[480px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-3">Anggota</th>
              <th className="py-2 px-3 text-center">Skor Akhir</th>
              <th className="py-2 px-3 text-center">Status</th>
              <th className="py-2 pl-3 text-right">ACC</th>
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
                  {r.rep?.final_score != null ? r.rep.final_score.toFixed(1) : '—'}
                </td>
                <td className="py-3 px-3 text-center">
                  {r.rep?.status === 'finalized'
                    ? <span className="text-[10px] font-bold text-emerald-700">Final</span>
                    : r.rep?.status === 'draft'
                    ? <span className="text-[10px] font-bold text-amber-700">Draf</span>
                    : <span className="text-[10px] text-gray-400">—</span>}
                </td>
                <td className="py-3 pl-3 text-right">
                  <AccButton employeeId={r.id} acc={!!r.rep?.spv_acc} hasReport={!!r.rep} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
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
