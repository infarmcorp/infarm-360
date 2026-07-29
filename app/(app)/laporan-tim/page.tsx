import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { playerClassOf } from '@/lib/scoring';
import { trendOf } from '@/lib/trend';
import { scoreMaps, companyAverages, teamAverages } from '@/lib/team-metrics';
import { TeamTable, type TeamRow } from './team-table';
import { TeamScorecards } from './scorecards';

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
    .select('role, name, dept, is_coordinator').eq('id', user.id).maybeSingle();

  // Direksi: eskalasi laporan SPV (Pegawai→SPV, SPV→Direksi). Halaman "Laporan Kinerja Tim"
  // Direksi = daftar SUBJEK SPV yang bisa ditinjau (agregat L2) & di-ACC setelah HRD rilis.
  if (me?.role === 'direksi') return <DireksiTeamReport />;

  if (me?.role !== 'spv' && me?.role !== 'hrd') {
    // Koordinator (grant is_coordinator): lihat-saja Laporan Kinerja Tim untuk daftar
    // pegawai eksplisit yang dinaunginya (coordinator_team_members). Tanpa ACC/Status/KPI.
    if (me?.is_coordinator) return <CoordinatorTeamReport userId={user.id} />;
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk Supervisor.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
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
  const { kpiBy, s360By, monthlyBy } = await scoreMaps(ap.id, reportIds);

  // Pegawai yang punya KOORDINATOR di-ACC oleh koordinatornya (bukan SPV). SPV/HRD-mode-SPV
  // hanya melihat status ACC koordinator (read-only) & fokus meng-ACC pegawai TANPA koordinator.
  // coordinator_team_members tak terbaca SPV (RLS), jadi dibaca via service_role (lookup mapping).
  const admin = createAdminClient();
  const { data: coordRows } = reportIds.length
    ? await admin.from('coordinator_team_members').select('employee_id').in('employee_id', reportIds)
    : { data: [] as { employee_id: string }[] };
  const coordinatedIds = new Set((coordRows ?? []).map((r) => r.employee_id));

  // Boleh buka detail (lapis 2)? Halaman ini dipakai SPV & HRD mode-SPV — keduanya
  // dibatasi setara: detail terbuka setelah HRD rilis (in_review) atau final — termasuk
  // laporan DIRI SENDIRI (boleh tinjau detail agregat dirinya sejak Ditinjau SPV).
  // Detail tetap TANPA komentar mentah; ACC diri sendiri tetap nonaktif (lihat kolom ACC).
  const canOpenDetail = (status: string | null): boolean =>
    status === 'in_review' || status === 'finalized';

  const toRow = (e: { id: string; name: string; dept: string | null }, isSelf: boolean): TeamRow => {
    const rep = repBy.get(e.id);
    const status = rep?.status ?? null;
    const kpiAvg = kpiBy.get(e.id) ?? null;
    const s360 = s360By.get(e.id) ?? null;
    const kpiMonths = (monthlyBy.get(e.id) ?? []).slice(0, 3);
    const coordinated = coordinatedIds.has(e.id);
    return {
      id: e.id,
      name: e.name,
      dept: e.dept,
      kpiAvg,
      s360,
      finalScore: rep?.final_score ?? null,
      // 4-Box KPI×360 (360 nonaktif → sumbu budaya null); trend dari KPI 3 bulan.
      player: playerClassOf(kpiAvg, ap.has_360 ? s360 : null),
      trend: trendOf(kpiMonths),
      kpiMonths,
      status,
      hasReport: !!rep,
      spvAcc: !!rep?.spv_acc,
      isSelf,
      detailOpen: canOpenDetail(status),
      // ACC hanya setelah HRD merilis (in_review) atau final; bukan diri sendiri; dan BUKAN pegawai
      // berkoordinator (itu di-ACC koordinatornya). Untuk berkoordinator → tampil status read-only.
      canAcc: !isSelf && !coordinated && (status === 'in_review' || status === 'finalized'),
      accReadonly: !isSelf && coordinated,
    };
  };

  const activeIds = new Set(members.filter((m) => m.is_active).map((m) => m.id));
  const rows: TeamRow[] = members
    .map((e) => toRow(e, e.id === user.id))
    // Tampilkan yang AKTIF atau yang PUNYA laporan di periode; nonaktif tanpa laporan disembunyikan.
    .filter((r) => activeIds.has(r.id) || r.hasReport)
    .sort((a, b) => a.name.localeCompare(b.name));

  const tAvg = teamAverages(rows);
  const cAvg = await companyAverages(ap.id);

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
        <>
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={ap.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length} />
          <TeamTable rows={rows} pageSize={5} />
        </>
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
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const admin = createAdminClient();
  // Subjek yang ditinjau Direksi = role='spv' ATAU pemimpin tim (spv_id di spv_team_members),
  // KECUALI Direksi & eksternal. Mencakup "HRD-posisi yang bertindak sebagai SPV" (mis. Ulfa).
  const [{ data: cands }, { data: tm }] = await Promise.all([
    admin.from('employees').select('id, name, dept, is_active, role').eq('is_external', false).neq('role', 'direksi'),
    admin.from('spv_team_members').select('spv_id'),
  ]);
  const leaderIds = new Set((tm ?? []).map((t) => t.spv_id));
  const list = (cands ?? []).filter((e) => e.role === 'spv' || leaderIds.has(e.id));
  const ids = list.map((e) => e.id);
  const { data: reports } = ids.length
    ? await admin.from('final_reports').select('employee_id, status, spv_acc, final_score')
        .eq('period_id', ap.id).in('employee_id', ids)
    : { data: [] as { employee_id: string; status: string | null; spv_acc: boolean; final_score: number | null }[] };
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));
  const { kpiBy, s360By, monthlyBy } = await scoreMaps(ap.id, ids);

  const canOpenDetail = (status: string | null): boolean =>
    status === 'in_review' || status === 'finalized';
  const activeIds = new Set(list.filter((e) => e.is_active).map((e) => e.id));
  const rows: TeamRow[] = list.map((e) => {
    const rep = repBy.get(e.id);
    const status = rep?.status ?? null;
    const kpiAvg = kpiBy.get(e.id) ?? null;
    const s360 = s360By.get(e.id) ?? null;
    const kpiMonths = (monthlyBy.get(e.id) ?? []).slice(0, 3);
    return {
      id: e.id, name: e.name, dept: e.dept,
      kpiAvg, s360,
      finalScore: rep?.final_score ?? null,
      player: playerClassOf(kpiAvg, ap.has_360 ? s360 : null),
      trend: trendOf(kpiMonths),
      kpiMonths,
      status, hasReport: !!rep, spvAcc: !!rep?.spv_acc, isSelf: false,
      detailOpen: canOpenDetail(status),
      canAcc: status === 'in_review' || status === 'finalized',
    };
  })
    .filter((r) => activeIds.has(r.id) || r.hasReport)
    .sort((a, b) => a.name.localeCompare(b.name));

  const tAvg = teamAverages(rows);
  const cAvg = await companyAverages(ap.id);

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
        <>
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={ap.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length} />
          <TeamTable rows={rows} pageSize={5} />
        </>
      )}
    </Shell>
  );
}

/**
 * Laporan Kinerja Tim untuk KOORDINATOR (grant is_coordinator, migrasi 0021): daftar pegawai
 * yang dinaunginya (coordinator_team_members) + scorecard, DAN meng-ACC laporan mereka setelah
 * HRD rilis (kolom ACC aktif; SPV pegawai tsb hanya melihat status ACC ini, tak ikut ACC).
 * Koordinator = pegawai biasa di RLS → SEMUA data dibaca via service_role, berlingkup ketat
 * ke daftar timnya; ACC ditulis via service_role di setSpvAcc. Detail L2 (klik nama) tetap
 * gerbang rilis HRD + buang L3. Angka Skor Akhir = tersimpan (final_reports), sama spt SPV.
 */
async function CoordinatorTeamReport({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const admin = createAdminClient();
  const { data: team } = await admin.from('coordinator_team_members')
    .select('employee_id').eq('coordinator_id', userId);
  const memberIds = (team ?? []).map((t) => t.employee_id);
  const { data: members } = memberIds.length
    ? await admin.from('employees').select('id, name, dept, is_active').in('id', memberIds)
    : { data: [] as { id: string; name: string; dept: string | null; is_active: boolean }[] };
  const list = members ?? [];
  const ids = list.map((e) => e.id);

  const { data: reports } = ids.length
    ? await admin.from('final_reports').select('employee_id, status, spv_acc, final_score')
        .eq('period_id', ap.id).in('employee_id', ids)
    : { data: [] as { employee_id: string; status: string | null; spv_acc: boolean; final_score: number | null }[] };
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));
  const { kpiBy, s360By, monthlyBy } = await scoreMaps(ap.id, ids);

  const canOpenDetail = (status: string | null): boolean => status === 'in_review' || status === 'finalized';
  const activeIds = new Set(list.filter((e) => e.is_active).map((e) => e.id));
  const rows: TeamRow[] = list.map((e) => {
    const rep = repBy.get(e.id);
    const status = rep?.status ?? null;
    const kpiAvg = kpiBy.get(e.id) ?? null;
    const s360 = s360By.get(e.id) ?? null;
    const kpiMonths = (monthlyBy.get(e.id) ?? []).slice(0, 3);
    return {
      id: e.id, name: e.name, dept: e.dept,
      kpiAvg, s360,
      finalScore: rep?.final_score ?? null,
      player: playerClassOf(kpiAvg, ap.has_360 ? s360 : null),
      trend: trendOf(kpiMonths),
      kpiMonths,
      status, hasReport: !!rep, spvAcc: !!rep?.spv_acc, isSelf: false,
      detailOpen: canOpenDetail(status),
      // Koordinator MENG-ACC laporan pegawai yang dinaunginya (setelah HRD rilis). ACC ditulis
      // via service_role di setSpvAcc (koordinator = pegawai biasa di RLS), berlingkup ke timnya.
      canAcc: status === 'in_review' || status === 'finalized',
    };
  })
    .filter((r) => activeIds.has(r.id) || r.hasReport)
    .sort((a, b) => a.name.localeCompare(b.name));

  const tAvg = teamAverages(rows);
  const cAvg = await companyAverages(ap.id);

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Laporan Kinerja Tim</h1>
          <p className="text-sm text-gray-500">
            Periode aktif: {ap.label} · tinjau &amp; beri ACC laporan pegawai yang Anda koordinasikan.
          </p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Belum ada pegawai yang ditugaskan di bawah koordinasi Anda.</p>
      ) : (
        <>
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={ap.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length} />
          <TeamTable rows={rows} pageSize={5} />
        </>
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
