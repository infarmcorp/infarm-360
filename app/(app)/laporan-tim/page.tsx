import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { TeamTable, type TeamRow } from './team-table';

/**
 * Rerata KPI + Skor 360° (result_360) untuk sekumpulan pegawai pada satu periode.
 * Nilai L1 (sejajar Skor Akhir yang sudah tampil) — dibaca via service_role, lingkup
 * sudah dibatasi oleh daftar `ids` yang ditentukan per peran di pemanggil.
 */
async function scoreMaps(periodId: string, ids: string[]): Promise<{ kpiBy: Map<string, number>; s360By: Map<string, number> }> {
  const kpiBy = new Map<string, number>();
  const s360By = new Map<string, number>();
  if (!ids.length) return { kpiBy, s360By };
  const admin = createAdminClient();
  const { data: months } = await admin.from('period_months').select('ym').eq('period_id', periodId);
  const yms = (months ?? []).map((m) => m.ym);
  if (yms.length) {
    const { data: ks } = await admin.from('kpi_scores').select('employee_id, score').in('ym', yms).in('employee_id', ids);
    const agg = new Map<string, { s: number; n: number }>();
    (ks ?? []).forEach((r) => { const a = agg.get(r.employee_id) ?? { s: 0, n: 0 }; a.s += r.score; a.n += 1; agg.set(r.employee_id, a); });
    for (const [id, a] of agg) kpiBy.set(id, a.s / a.n);
  }
  const { data: rs } = await admin.from('result_360').select('employee_id, score').eq('period_id', periodId).in('employee_id', ids);
  (rs ?? []).forEach((r) => { if (r.score != null) s360By.set(r.employee_id, r.score); });
  return { kpiBy, s360By };
}

/**
 * Laporan Kinerja Tim (SPV / HRD mode-SPV / Direksi): tinjau & ACC laporan.
 * Lingkup anggota mengikuti kebijakan Input KPI (lihat kpi/page.tsx):
 *  - SPV          → anggota tim formal (spv_team_members), TANPA dirinya sendiri.
 *  - HRD mode-SPV → pegawai di DIVISINYA SENDIRI (kecuali Direksi & dirinya sendiri).
 *  - Direksi      → SUBJEK SPV (eskalasi Pegawai→SPV, SPV→Direksi) — lihat DireksiTeamReport.
 * Laporan DIRI SENDIRI tak muncul di sini (ditinjau atasannya/Direksi + dilihat lewat
 * "Laporan Hasil Saya"). SPV bisa baca laporan draf-nya lewat migrasi 0009; HRD lewat is_hrd.
 */
export default async function LaporanTimPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('role, name, dept').eq('id', user.id).maybeSingle();

  // Direksi: eskalasi laporan SPV (Pegawai→SPV, SPV→Direksi). Halaman "Laporan Kinerja Tim"
  // Direksi = daftar SUBJEK SPV yang bisa ditinjau (agregat L2) & di-ACC setelah HRD rilis.
  if (me?.role === 'direksi') return <DireksiTeamReport />;

  if (me?.role !== 'spv' && me?.role !== 'hrd') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk Supervisor.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  // Resolusi lingkup anggota per peran. Laporan DIRI SENDIRI TIDAK ditampilkan di sini —
  // laporan SPV/HRD-mode-SPV ditinjau Direksi (eskalasi) & dilihat pemiliknya sendiri lewat
  // "Laporan Hasil Saya" saat final. Pelaporan: enumerasi TANPA filter is_active; nonaktif
  // disaring belakangan kecuali punya laporan di periode (pegawai resign tetap bisa ditinjau).
  let members: { id: string; name: string; dept: string | null; is_active: boolean }[] = [];
  if (me.role === 'hrd') {
    // HRD mode-SPV: pegawai sedivisinya sendiri (kecuali Direksi & diri sendiri).
    const { data } = await supabase.from('employees')
      .select('id, name, dept, is_active').eq('dept', me.dept ?? '__none__').neq('role', 'direksi').neq('id', user.id).eq('is_external', false);
    members = data ?? [];
  } else {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', user.id);
    const memberIds = (team ?? []).map((t) => t.employee_id);
    const { data: emps } = memberIds.length
      ? await supabase.from('employees').select('id, name, dept, is_active').in('id', memberIds) : { data: [] };
    members = emps ?? [];
  }

  const reportIds = members.map((e) => e.id);
  const { data: reports } = reportIds.length
    ? await supabase.from('final_reports').select('employee_id, status, spv_acc, final_score')
        .eq('period_id', ap.id).in('employee_id', reportIds)
    : { data: [] };
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));
  const { kpiBy, s360By } = await scoreMaps(ap.id, reportIds);

  // Boleh buka detail (lapis 2)? Halaman ini dipakai SPV & HRD mode-SPV — keduanya
  // dibatasi setara: detail terbuka setelah HRD rilis (in_review) atau final — termasuk
  // laporan DIRI SENDIRI (boleh tinjau detail agregat dirinya sejak Ditinjau SPV).
  // Detail tetap TANPA komentar mentah; ACC diri sendiri tetap nonaktif (lihat kolom ACC).
  const canOpenDetail = (status: string | null): boolean =>
    status === 'in_review' || status === 'finalized';

  const toRow = (e: { id: string; name: string; dept: string | null }, isSelf: boolean): TeamRow => {
    const rep = repBy.get(e.id);
    const status = rep?.status ?? null;
    return {
      id: e.id,
      name: e.name,
      dept: e.dept,
      kpiAvg: kpiBy.get(e.id) ?? null,
      s360: s360By.get(e.id) ?? null,
      finalScore: rep?.final_score ?? null,
      status,
      hasReport: !!rep,
      spvAcc: !!rep?.spv_acc,
      isSelf,
      detailOpen: canOpenDetail(status),
      // ACC hanya setelah HRD merilis (in_review) atau final; bukan diri sendiri.
      canAcc: !isSelf && (status === 'in_review' || status === 'finalized'),
    };
  };

  const activeIds = new Set(members.filter((m) => m.is_active).map((m) => m.id));
  const rows: TeamRow[] = members
    .map((e) => toRow(e, e.id === user.id))
    // Tampilkan yang AKTIF atau yang PUNYA laporan di periode; nonaktif tanpa laporan disembunyikan.
    .filter((r) => activeIds.has(r.id) || r.hasReport)
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

/**
 * Laporan Kinerja Tim untuk DIREKSI: daftar subjek SPV + status + ACC.
 * Lingkup sengaja HANYA SPV (cermin hierarki: Direksi menaungi SPV). Data dibaca via
 * service_role (Direksi read-only di RLS); detail tetap agregat L2 (lihat detail page +
 * loadSpvReportForDireksi). Detail & ACC terbuka hanya setelah HRD "Rilis" (in_review/finalized).
 */
async function DireksiTeamReport() {
  const supabase = await createClient();
  const { data: ap } = await supabase
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const admin = createAdminClient();
  const { data: spvs } = await admin.from('employees')
    .select('id, name, dept, is_active').eq('role', 'spv').eq('is_external', false);
  const list = spvs ?? [];
  const ids = list.map((e) => e.id);
  const { data: reports } = ids.length
    ? await admin.from('final_reports').select('employee_id, status, spv_acc, final_score')
        .eq('period_id', ap.id).in('employee_id', ids)
    : { data: [] as { employee_id: string; status: string | null; spv_acc: boolean; final_score: number | null }[] };
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));
  const { kpiBy, s360By } = await scoreMaps(ap.id, ids);

  const canOpenDetail = (status: string | null): boolean =>
    status === 'in_review' || status === 'finalized';
  const activeIds = new Set(list.filter((e) => e.is_active).map((e) => e.id));
  const rows: TeamRow[] = list.map((e) => {
    const rep = repBy.get(e.id);
    const status = rep?.status ?? null;
    return {
      id: e.id, name: e.name, dept: e.dept,
      kpiAvg: kpiBy.get(e.id) ?? null,
      s360: s360By.get(e.id) ?? null,
      finalScore: rep?.final_score ?? null,
      status, hasReport: !!rep, spvAcc: !!rep?.spv_acc, isSelf: false,
      detailOpen: canOpenDetail(status),
      canAcc: status === 'in_review' || status === 'finalized',
    };
  })
    .filter((r) => activeIds.has(r.id) || r.hasReport)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Laporan Kinerja Tim</h1>
          <p className="text-sm text-gray-500">
            Periode aktif: {ap.label} · tinjau &amp; beri ACC laporan hasil akhir para Supervisor (SPV).
          </p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Belum ada laporan SPV untuk ditinjau.</p>
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
