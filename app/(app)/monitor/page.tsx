import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin, canCoordinate } from '@/lib/auth/roles';
import { finalScoreOf, playerClassOf } from '@/lib/scoring';
import { trendOf } from '@/lib/trend';
import { scoreMaps, penaltyMap, companyAverages, teamAverages } from '@/lib/team-metrics';
import { TeamTable, type TeamRow } from '@/app/(app)/laporan-tim/team-table';
import { TeamScorecards } from '@/app/(app)/laporan-tim/scorecards';
import { MonitorTrends, type EmpMonthly, type PeriodTrendPoint, type MoverRow } from './monitor-trends';
import { PeriodFilter } from './period-filter';
import { DistBars } from './dist-bars';

/**
 * Monitor Kinerja (SPV / HRD mode-SPV) — dashboard kinerja tim, bergaya Laporan Kinerja Tim:
 *  - Filter PERIODE → scorecard (Total · Avg KPI · Avg 360° + selisih vs perusahaan) + tabel
 *    (KPI/360°/Skor Akhir/4-Box/Trend) untuk periode terpilih.
 *  - Grafik tren LINTAS periode/bulan (tak terpengaruh filter): Tim per periode, KPI tim per bulan,
 *    KPI pegawai per bulan (dropdown).
 * BEDA dari Laporan Kinerja Tim: tanpa tinjau/Status/ACC, MEMASUKKAN baris SPV sendiri, Skor Akhir
 * LIVE (allow360Only=true, selaras snapshot laporan). Halaman Supervisor (tak untuk Mode HRD Admin).
 *
 * KOORDINATOR (grant is_coordinator): lihat Monitor Kinerja untuk daftar pegawai eksplisit yang
 * dinaunginya (coordinator_team_members) SAJA — TANPA dirinya sendiri. Koordinator = pegawai biasa
 * di RLS → seluruh data (lingkup + tren) dibaca via service_role, dibatasi ketat ke daftar timnya.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelOf = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m}'${y.slice(2)}`; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, is_coordinator, dept').eq('id', user.id).maybeSingle();
  const role = me?.role;

  // Cookie absen = base/SPV (konsisten dgn layout.tsx & app/page.tsx; login mereset ke base).
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const adminView = canAdmin(me) && hrdMode === 'admin';
  const supervisorView = !adminView && (role === 'spv' || role === 'hrd');
  // Koordinator: bukan SPV/HRD tapi punya grant is_coordinator → Monitor untuk naungannya saja.
  const coordinatorView = !adminView && !supervisorView && canCoordinate(me);
  if (!supervisorView && !coordinatorView) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV, Koordinator, atau HRD dalam Mode SPV.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: periodRows } = await supabase
    .from('periods').select('id, label, has_360, status, start_date').order('start_date', { ascending: true });
  const periodList = periodRows ?? [];
  if (periodList.length === 0) return <Shell><Header coordinator={coordinatorView} /><p className="text-sm text-gray-500 mt-4">Belum ada periode.</p></Shell>;
  const sel = periodList.find((p) => p.id === periodParam)
    ?? periodList.find((p) => p.status === 'active')
    ?? periodList[periodList.length - 1];

  // Lingkup pegawai. SPV → tim + DIRINYA sendiri; HRD mode-SPV → DIVISINYA (termasuk dirinya);
  // Koordinator → HANYA pegawai naungannya (coordinator_team_members), TANPA dirinya.
  // Koordinator = pegawai biasa di RLS → semua data (lingkup + tren) dibaca via service_role.
  let empRows: { id: string; name: string; dept: string; is_active: boolean }[] = [];
  const dataClient = coordinatorView ? createAdminClient() : supabase;
  if (coordinatorView) {
    const admin = dataClient;
    const { data: team } = await admin.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id);
    const memberIds = (team ?? []).map((t) => t.employee_id);
    const { data } = memberIds.length
      ? await admin.from('employees').select('id, name, dept, is_active').in('id', memberIds)
      : { data: [] as { id: string; name: string; dept: string; is_active: boolean }[] };
    empRows = data ?? [];
  } else if (role === 'spv') {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', user.id);
    const ids = [...new Set([user.id, ...(team ?? []).map((t) => t.employee_id)])];
    const { data } = await supabase.from('employees').select('id, name, dept, is_active').in('id', ids);
    empRows = data ?? [];
  } else {
    const { data } = await supabase.from('employees').select('id, name, dept, is_active')
      .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi').eq('is_external', false);
    empRows = data ?? [];
  }
  if (empRows.length === 0) {
    return <Shell><Header coordinator={coordinatorView} /><Toolbar periods={periodList} current={sel.id} /><p className="text-sm text-gray-500 mt-4">Belum ada pegawai dalam lingkup Anda.</p></Shell>;
  }
  const ids = empRows.map((e) => e.id);

  // ── Snapshot periode terpilih → scorecard + tabel ──────────────────────────
  const { kpiBy, s360By, monthlyBy } = await scoreMaps(sel.id, ids);
  const penBy = await penaltyMap(sel.id, ids);
  const activeIds = new Set(empRows.filter((e) => e.is_active).map((e) => e.id));
  const rows: TeamRow[] = empRows.map((e) => {
    const kpiAvg = kpiBy.get(e.id) ?? null;
    const s360 = s360By.get(e.id) ?? null;
    const kpiMonths = (monthlyBy.get(e.id) ?? []).slice(0, 3);
    const penalty = penBy.get(e.id) ?? 0;
    return {
      id: e.id, name: e.name, dept: e.dept,
      kpiAvg, s360,
      finalScore: finalScoreOf(kpiAvg, s360, sel.has_360, penalty, true), // LIVE, selaras snapshot laporan
      player: playerClassOf(kpiAvg, sel.has_360 ? s360 : null),
      trend: trendOf(kpiMonths),
      kpiMonths,
      status: null, hasReport: false, spvAcc: false,
      isSelf: e.id === user.id, detailOpen: false, canAcc: false,
    };
  })
    .filter((r) => activeIds.has(r.id) || r.kpiAvg != null || r.s360 != null)
    .sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
  const tAvg = teamAverages(rows);
  const cAvg = await companyAverages(sel.id);

  // ── Data tren LINTAS periode/bulan (RLS user-scoped; lingkup tim kecil → aman batas 1000) ──
  const [kpiAllRes, r360AllRes, pmRes] = await Promise.all([
    dataClient.from('kpi_scores').select('employee_id, ym, score').in('employee_id', ids),
    dataClient.from('result_360').select('employee_id, period_id, score').in('employee_id', ids),
    dataClient.from('period_months').select('period_id, ym'),
  ]);
  const kpiAgg = new Map<string, { s: number; n: number }>(); // `${emp}|${ym}`
  (kpiAllRes.data ?? []).forEach((r) => { const k = `${r.employee_id}|${r.ym}`; const a = kpiAgg.get(k) ?? { s: 0, n: 0 }; a.s += r.score; a.n += 1; kpiAgg.set(k, a); });
  const kpiOf = (id: string, ym: string) => { const a = kpiAgg.get(`${id}|${ym}`); return a ? a.s / a.n : null; };
  const s360Of = new Map((r360AllRes.data ?? []).map((r) => [`${r.employee_id}|${r.period_id}`, r.score]));
  const monthsByPeriod = new Map<string, string[]>();
  (pmRes.data ?? []).forEach((m) => { const a = monthsByPeriod.get(m.period_id) ?? []; a.push(m.ym); monthsByPeriod.set(m.period_id, a); });

  const allYms = [...new Set((kpiAllRes.data ?? []).map((r) => r.ym))].sort();
  const monthLabels = allYms.map(labelOf);
  const nn = (v: number | null): v is number => v != null;

  // A. Tren tim per periode (Avg KPI & Avg 360° tim).
  const anyHas360 = periodList.some((p) => p.has_360);
  const periodsTrend: PeriodTrendPoint[] = periodList.map((p) => {
    const pYms = monthsByPeriod.get(p.id) ?? [];
    const kpis = ids.map((id) => mean(pYms.map((ym) => kpiOf(id, ym)).filter(nn))).filter(nn);
    const s360s = p.has_360 ? ids.map((id) => s360Of.get(`${id}|${p.id}`) ?? null).filter(nn) : [];
    return { label: p.label, kpi: mean(kpis), s360: mean(s360s) };
  }).filter((pt) => pt.kpi != null || pt.s360 != null);

  // B. Tren KPI tim per bulan.
  const teamMonthly = allYms.map((ym) => mean(ids.map((id) => kpiOf(id, ym)).filter(nn)));

  // C. Tren KPI per pegawai per bulan (dropdown).
  const employeesMonthly: EmpMonthly[] = empRows
    .map((e) => ({ id: e.id, name: e.name, monthly: allYms.map((ym) => kpiOf(e.id, ym)) }))
    .filter((e) => e.monthly.some((v) => v != null))
    .sort((a, b) => a.name.localeCompare(b.name));

  // D. Top Movers — selisih KPI per pegawai antara DUA periode berdata terakhir (rerata KPI
  //    bulan-bulan tiap periode). Hanya pegawai yang bernilai di KEDUA periode (bisa dibandingkan).
  const perPeriodKpi = (id: string, pid: string): number | null => {
    const vals = (monthsByPeriod.get(pid) ?? []).map((ym) => kpiOf(id, ym)).filter(nn);
    return vals.length ? mean(vals) : null;
  };
  const kpiPeriods = periodList.filter((p) => ids.some((id) => perPeriodKpi(id, p.id) != null));
  const currP = kpiPeriods[kpiPeriods.length - 1] ?? null;
  const prevP = kpiPeriods[kpiPeriods.length - 2] ?? null;
  const moverLabels = currP && prevP ? { prev: prevP.label, curr: currP.label } : null;
  const movers: MoverRow[] = (currP && prevP)
    ? empRows
        .map((e) => {
          const c = perPeriodKpi(e.id, currP.id);
          const pv = perPeriodKpi(e.id, prevP.id);
          return c != null && pv != null ? { name: e.name, delta: c - pv, curr: c } : null;
        })
        .filter((m): m is MoverRow => m != null)
        .sort((a, b) => b.delta - a.delta)
    : [];

  return (
    <Shell>
      <Header coordinator={coordinatorView} />
      <Toolbar periods={periodList} current={sel.id} />
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 mt-4">Belum ada data kinerja untuk periode ini.</p>
      ) : (
        <div className="mt-4">
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={sel.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length} />
          <DistBars
            kpiPeople={rows.filter((r) => r.trend !== 'unread' && r.kpiAvg != null).map((r) => ({ name: r.name, value: r.kpiAvg as number }))}
            s360People={sel.has_360 ? rows.filter((r) => r.s360 != null).map((r) => ({ name: r.name, value: r.s360 as number })) : null} />
          <TeamTable rows={rows} linkNames={false} showStatus={false} showAcc={false} scoreBasis="live" />
        </div>
      )}
      <MonitorTrends periodsTrend={periodsTrend} monthLabels={monthLabels}
        teamMonthly={teamMonthly} employees={employeesMonthly} has360={anyHas360}
        movers={movers} moverLabels={moverLabels} />
    </Shell>
  );
}

function Toolbar({ periods, current }: { periods: { id: string; label: string; status: string }[]; current: string }) {
  return (
    <div className="mt-3">
      <PeriodFilter periods={periods} current={current} />
    </div>
  );
}

function Header({ coordinator = false }: { coordinator?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Monitor Kinerja</h1>
        <p className="text-sm text-gray-500">
          {coordinator
            ? 'Dashboard kinerja pegawai yang Anda koordinasikan — snapshot per periode & tren lintas waktu.'
            : 'Dashboard kinerja tim Anda (termasuk diri Anda) — snapshot per periode & tren lintas waktu.'}
        </p>
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
