import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TeamTable, type TeamRow } from './team-table';

/**
 * Laporan Kinerja Tim (SPV / HRD mode-SPV): tinjau & ACC laporan.
 * Lingkup anggota mengikuti kebijakan Input KPI (lihat kpi/page.tsx):
 *  - SPV          → anggota tim formal (spv_team_members) + DIRINYA SENDIRI.
 *  - HRD mode-SPV → pegawai di DIVISINYA SENDIRI (incl. dirinya), bukan spv_team_members
 *    (HRD umumnya tak punya entri di tabel itu). RLS is_hrd mengizinkan baca/ACC penuh.
 * Baris diri sendiri ditandai "Anda"; ACC sendiri dinonaktifkan (integritas). SPV bisa baca
 * laporan draf-nya lewat migrasi 0009; HRD bisa baca semua draf lewat is_hrd.
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

  // Resolusi lingkup anggota per peran (selalu memuat diri sendiri).
  let members: { id: string; name: string; dept: string | null }[] = [];
  if (me.role === 'hrd') {
    // HRD mode-SPV: pegawai sedivisinya sendiri (kecuali Direksi); query dept sudah memuat dirinya.
    const { data } = await supabase.from('employees')
      .select('id, name, dept').eq('dept', me.dept ?? '__none__').neq('role', 'direksi');
    members = data ?? [];
  } else {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', user.id);
    const memberIds = (team ?? []).map((t) => t.employee_id);
    const { data: emps } = memberIds.length
      ? await supabase.from('employees').select('id, name, dept').in('id', memberIds) : { data: [] };
    // SPV bukan anggota timnya sendiri → tambahkan manual untuk pemantauan laporan pribadi.
    members = [...(emps ?? []), { id: user.id, name: me.name, dept: me.dept }];
  }

  const reportIds = members.map((e) => e.id);
  const { data: reports } = reportIds.length
    ? await supabase.from('final_reports').select('employee_id, status, spv_acc, final_score')
        .eq('period_id', ap.id).in('employee_id', reportIds)
    : { data: [] };
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  // Boleh buka detail (lapis 2)? HRD penuh; SPV hanya setelah HRD rilis (in_review)
  // atau final — kecuali laporan dirinya sendiri yang mengikuti aturan pegawai (final).
  const canOpenDetail = (status: string | null, isSelf: boolean): boolean => {
    if (me.role === 'hrd') return true;
    if (isSelf) return status === 'finalized';
    return status === 'in_review' || status === 'finalized';
  };

  const toRow = (e: { id: string; name: string; dept: string | null }, isSelf: boolean): TeamRow => {
    const rep = repBy.get(e.id);
    const status = rep?.status ?? null;
    return {
      id: e.id,
      name: e.name,
      dept: e.dept,
      finalScore: rep?.final_score ?? null,
      status,
      hasReport: !!rep,
      spvAcc: !!rep?.spv_acc,
      isSelf,
      detailOpen: canOpenDetail(status, isSelf),
    };
  };

  const rows: TeamRow[] = members
    .map((e) => toRow(e, e.id === user.id))
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
