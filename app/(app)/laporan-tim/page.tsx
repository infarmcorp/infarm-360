import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { playerClassOf, finalScoreOf, displayedFinalOf } from '@/lib/scoring';
import { trendOf } from '@/lib/trend';
import { scoreMaps, penaltyMap, companyAverages, teamAverages } from '@/lib/team-metrics';
import { TeamTable, type TeamRow } from './team-table';
import { TeamScorecards } from './scorecards';
import { PeriodFilter } from '@/app/(app)/monitor/period-filter';

/** Periode yang dipilih lewat `?period=` (default: periode AKTIF, lalu yang terbaru). */
type PeriodRow = { id: string; label: string; has_360: boolean; status: string };

/**
 * Daftar periode + periode terpilih. Dipakai ketiga varian halaman agar perilaku filternya sama.
 * `?period=` yang tak dikenal diabaikan (jatuh ke periode aktif) — parameter URL tak boleh
 * memaksa halaman membaca periode yang tak ada.
 */
async function resolvePeriod(
  supabase: Awaited<ReturnType<typeof createClient>>, requested?: string,
): Promise<{ list: PeriodRow[]; sel: PeriodRow | null }> {
  const { data } = await supabase
    .from('periods').select('id, label, has_360, status').order('start_date', { ascending: false });
  const list = (data ?? []) as PeriodRow[];
  const active = list.find((p) => p.status === 'active') ?? null;
  const sel = (requested ? list.find((p) => p.id === requested) : undefined) ?? active ?? list[0] ?? null;
  return { list, sel };
}

/**
 * Laporan Kinerja Tim (SPV / HRD mode-SPV / Direksi): tinjau & ACC laporan.
 * Lingkup anggota mengikuti kebijakan Input KPI (lihat kpi/page.tsx):
 *  - SPV          → anggota tim formal (spv_team_members), TANPA dirinya sendiri.
 *  - HRD mode-SPV → pegawai di DIVISINYA SENDIRI (kecuali Direksi & dirinya sendiri).
 *  - Direksi      → SUBJEK SPV (eskalasi Pegawai→SPV, SPV→Direksi) — lihat DireksiTeamReport.
 * Laporan DIRI SENDIRI tak muncul di sini (ditinjau atasannya/Direksi + dilihat lewat
 * "Laporan Hasil Saya"). SPV bisa baca laporan draf-nya lewat migrasi 0009; HRD lewat is_hrd.
 *
 * FILTER PERIODE (2026-08): halaman dapat menampilkan periode LAMPAU untuk meninjau hasil kuartal
 * sebelumnya. Periode selain yang aktif bersifat **lihat-saja**: tombol ACC dimatikan karena
 * `setSpvAcc` selalu menulis ke periode AKTIF — membiarkan tombolnya hidup akan mengubah laporan
 * kuartal yang salah tanpa disadari.
 */
export default async function LaporanTimPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees')
    .select('role, name, dept, is_coordinator').eq('id', user.id).maybeSingle();

  // Direksi: eskalasi laporan SPV (Pegawai→SPV, SPV→Direksi). Halaman "Laporan Kinerja Tim"
  // Direksi = daftar SUBJEK SPV yang bisa ditinjau (agregat L2) & di-ACC setelah HRD rilis.
  if (me?.role === 'direksi') return <DireksiTeamReport periodParam={periodParam} />;

  if (me?.role !== 'spv' && me?.role !== 'hrd') {
    // Koordinator (grant is_coordinator): lihat-saja Laporan Kinerja Tim untuk daftar
    // pegawai eksplisit yang dinaunginya (coordinator_team_members). Tanpa ACC/Status/KPI.
    if (me?.is_coordinator) return <CoordinatorTeamReport userId={user.id} periodParam={periodParam} />;
    return <Shell><p className="text-sm text-ink-soft">Halaman ini untuk Supervisor.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { list: periods, sel: ap } = await resolvePeriod(supabase, periodParam);
  if (!ap) return <Shell><p className="text-sm text-ink-soft">Belum ada periode penilaian.</p></Shell>;
  const periodActive = ap.status === 'active';

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
  const penBy = await penaltyMap(ap.id, reportIds);

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
      finalScore: displayedFinalOf(finalScoreOf(kpiAvg, s360, ap.has_360, penBy.get(e.id) ?? 0), rep),
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
      canAcc: periodActive && !isSelf && !coordinated && (status === 'in_review' || status === 'finalized'),
      accReadonly: !isSelf && coordinated,
      // Periode lampau → ACC dikunci (tampil status saja). Lihat catatan di JSDoc halaman.
      accLocked: !periodActive,
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
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Laporan Kinerja Tim</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">
            {periodActive
              ? <>Periode aktif: <span className="font-semibold text-ink">{ap.label}</span> · beri ACC laporan anggota tim Anda.</>
              : <>Meninjau periode lampau: <span className="font-semibold text-ink">{ap.label}</span> · lihat-saja.</>}
          </p>
        </div>
        <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>

      <div className="mb-4"><PeriodFilter periods={periods} current={ap.id} basePath="/laporan-tim" /></div>
      <PastPeriodNote active={periodActive} />

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Belum ada anggota tim yang ditugaskan.</p>
      ) : (
        <>
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={ap.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length} />
          {/* Tabel diberi bingkai section (kartu) di halaman ini saja — komponennya sendiri
              tidak disentuh agar Monitor Kinerja tetap seperti semula. */}
          <div className="bg-surface border border-line rounded-panel p-5">
            <TeamTable rows={rows} pageSize={5} periodId={ap.id} has360={ap.has_360} />
          </div>
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
async function DireksiTeamReport({ periodParam }: { periodParam?: string }) {
  const supabase = await createClient();
  const { list: periods, sel: ap } = await resolvePeriod(supabase, periodParam);
  if (!ap) return <Shell><p className="text-sm text-ink-soft">Belum ada periode penilaian.</p></Shell>;
  const periodActive = ap.status === 'active';

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
  const penBy = await penaltyMap(ap.id, ids);

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
      finalScore: displayedFinalOf(finalScoreOf(kpiAvg, s360, ap.has_360, penBy.get(e.id) ?? 0), rep),
      player: playerClassOf(kpiAvg, ap.has_360 ? s360 : null),
      trend: trendOf(kpiMonths),
      kpiMonths,
      status, hasReport: !!rep, spvAcc: !!rep?.spv_acc, isSelf: false,
      detailOpen: canOpenDetail(status),
      canAcc: periodActive && (status === 'in_review' || status === 'finalized'),
      accLocked: !periodActive,
    };
  })
    .filter((r) => activeIds.has(r.id) || r.hasReport)
    .sort((a, b) => a.name.localeCompare(b.name));

  const tAvg = teamAverages(rows);
  const cAvg = await companyAverages(ap.id);

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Laporan Kinerja Tim</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">
            {periodActive
              ? <>Periode aktif: <span className="font-semibold text-ink">{ap.label}</span> · tinjau &amp; beri ACC laporan hasil akhir para Supervisor (SPV).</>
              : <>Meninjau periode lampau: <span className="font-semibold text-ink">{ap.label}</span> · lihat-saja.</>}
          </p>
        </div>
        <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>
      <div className="mb-4"><PeriodFilter periods={periods} current={ap.id} basePath="/laporan-tim" /></div>
      <PastPeriodNote active={periodActive} />
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Belum ada laporan SPV untuk ditinjau.</p>
      ) : (
        <>
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={ap.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length} />
          {/* Tabel diberi bingkai section (kartu) di halaman ini saja — komponennya sendiri
              tidak disentuh agar Monitor Kinerja tetap seperti semula. */}
          <div className="bg-surface border border-line rounded-panel p-5">
            <TeamTable rows={rows} pageSize={5} periodId={ap.id} has360={ap.has_360} />
          </div>
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
async function CoordinatorTeamReport({ userId, periodParam }: { userId: string; periodParam?: string }) {
  const supabase = await createClient();
  const { list: periods, sel: ap } = await resolvePeriod(supabase, periodParam);
  if (!ap) return <Shell><p className="text-sm text-ink-soft">Belum ada periode penilaian.</p></Shell>;
  const periodActive = ap.status === 'active';

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
  const penBy = await penaltyMap(ap.id, ids);

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
      finalScore: displayedFinalOf(finalScoreOf(kpiAvg, s360, ap.has_360, penBy.get(e.id) ?? 0), rep),
      player: playerClassOf(kpiAvg, ap.has_360 ? s360 : null),
      trend: trendOf(kpiMonths),
      kpiMonths,
      status, hasReport: !!rep, spvAcc: !!rep?.spv_acc, isSelf: false,
      detailOpen: canOpenDetail(status),
      // Koordinator MENG-ACC laporan pegawai yang dinaunginya (setelah HRD rilis). ACC ditulis
      // via service_role di setSpvAcc (koordinator = pegawai biasa di RLS), berlingkup ke timnya.
      canAcc: periodActive && (status === 'in_review' || status === 'finalized'),
      accLocked: !periodActive,
    };
  })
    .filter((r) => activeIds.has(r.id) || r.hasReport)
    .sort((a, b) => a.name.localeCompare(b.name));

  const tAvg = teamAverages(rows);
  const cAvg = await companyAverages(ap.id);

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Laporan Kinerja Tim</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">
            {periodActive
              ? <>Periode aktif: <span className="font-semibold text-ink">{ap.label}</span> · tinjau &amp; beri ACC laporan pegawai yang Anda koordinasikan.</>
              : <>Meninjau periode lampau: <span className="font-semibold text-ink">{ap.label}</span> · lihat-saja.</>}
          </p>
        </div>
        <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>
      <div className="mb-4"><PeriodFilter periods={periods} current={ap.id} basePath="/laporan-tim" /></div>
      <PastPeriodNote active={periodActive} />
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Belum ada pegawai yang ditugaskan di bawah koordinasi Anda.</p>
      ) : (
        <>
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={ap.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length} />
          {/* Tabel diberi bingkai section (kartu) di halaman ini saja — komponennya sendiri
              tidak disentuh agar Monitor Kinerja tetap seperti semula. */}
          <div className="bg-surface border border-line rounded-panel p-5">
            <TeamTable rows={rows} pageSize={5} periodId={ap.id} has360={ap.has_360} />
          </div>
        </>
      )}
    </Shell>
  );
}

/**
 * Penanda periode lampau. Bukan sekadar hiasan: menjelaskan MENGAPA tombol ACC hilang, supaya
 * peninjau tak mengira fiturnya rusak saat membuka kuartal yang sudah dikunci.
 */
function PastPeriodNote({ active }: { active: boolean }) {
  if (active) return null;
  return (
    <p className="mb-4 rounded-control border border-warn-ink/25 bg-warn-tint px-3 py-2 text-[12px] text-warn-ink">
      Periode ini sudah <strong>tidak aktif</strong> — halaman menampilkan hasil apa adanya untuk ditinjau.
      Pemberian <strong>ACC</strong> hanya tersedia pada periode yang sedang berjalan.
    </p>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Kanvas ber-token (tanpa wrapper putih besar + shadow), sesuai pola redesign halaman lain.
  // ⚠️ Warna DI DALAM scorecard & tabel sengaja TIDAK diubah — `scorecards.tsx`/`team-table.tsx`
  // dipakai bersama Monitor Kinerja yang bagian "Ringkasan ke bawah"-nya dikunci apa adanya.
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
