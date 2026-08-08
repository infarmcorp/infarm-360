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
import { MonitorTrends, type EmpMonthly, type PeriodTrendPoint, type MoverRow, type MoverRow360, type DeltaCause } from './monitor-trends';
import { aspectScoresByEmployee, heatDataFromAspect, orgAspectAverages } from '@/lib/aspect360';
import { ExtremesHeatmap } from './extremes-heatmap';
import { PeriodFilter } from './period-filter';
import { DistBars } from './dist-bars';
import { TeamAspectProfile } from './team-aspect';
import { SectionHeader } from './section-header';

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
    return <Shell><div className="bg-surface border border-line rounded-panel p-5">
      <p className="text-sm text-ink-soft">Halaman ini untuk SPV, Koordinator, atau HRD dalam Mode SPV.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></div></Shell>;
  }

  const { data: periodRows } = await supabase
    .from('periods').select('id, label, has_360, status, start_date').order('start_date', { ascending: true });
  const periodList = periodRows ?? [];
  if (periodList.length === 0) return <Shell><Header coordinator={coordinatorView} /><p className="text-sm text-ink-soft mt-4">Belum ada periode.</p></Shell>;
  const sel = periodList.find((p) => p.id === periodParam)
    ?? periodList.find((p) => p.status === 'active')
    ?? periodList[periodList.length - 1];

  // Lingkup pegawai. SPV → tim + DIRINYA sendiri; HRD mode-SPV → DIVISINYA (termasuk dirinya);
  // Koordinator → HANYA pegawai naungannya (coordinator_team_members), TANPA dirinya.
  // Koordinator = pegawai biasa di RLS → semua data (lingkup + tren) dibaca via service_role.
  let empRows: { id: string; name: string; nickname: string | null; dept: string; is_active: boolean }[] = [];
  const dataClient = coordinatorView ? createAdminClient() : supabase;
  if (coordinatorView) {
    const admin = dataClient;
    const { data: team } = await admin.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id);
    const memberIds = (team ?? []).map((t) => t.employee_id);
    const { data } = memberIds.length
      ? await admin.from('employees').select('id, name, nickname, dept, is_active').in('id', memberIds)
      : { data: [] as { id: string; name: string; nickname: string | null; dept: string; is_active: boolean }[] };
    empRows = data ?? [];
  } else if (role === 'spv') {
    const { data: team } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', user.id);
    const ids = [...new Set([user.id, ...(team ?? []).map((t) => t.employee_id)])];
    const { data } = await supabase.from('employees').select('id, name, nickname, dept, is_active').in('id', ids);
    empRows = data ?? [];
  } else {
    const { data } = await supabase.from('employees').select('id, name, nickname, dept, is_active')
      .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi').eq('is_external', false);
    empRows = data ?? [];
  }
  if (empRows.length === 0) {
    return <Shell><Header coordinator={coordinatorView} /><Toolbar periods={periodList} current={sel.id} /><p className="text-sm text-ink-soft mt-4">Belum ada pegawai dalam lingkup Anda.</p></Shell>;
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
      id: e.id, name: e.name, nickname: e.nickname, dept: e.dept,
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
  const [kpiAllRes, r360AllRes, pmRes, penAllRes] = await Promise.all([
    dataClient.from('kpi_scores').select('employee_id, ym, score').in('employee_id', ids),
    dataClient.from('result_360').select('employee_id, period_id, score').in('employee_id', ids),
    dataClient.from('period_months').select('period_id, ym'),
    dataClient.from('compliance_penalties').select('employee_id, period_id, points').in('employee_id', ids),
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

  // Skor Akhir per (pegawai,periode) untuk grafik "Tren Tim per Periode" (Avg Skor Akhir).
  // finalScoreOf = blend KPI×360 − punishment (LIVE), selaras snapshot laporan.
  const periodById = new Map(periodList.map((p) => [p.id, p]));
  const penOf = new Map((penAllRes.data ?? []).map((p) => [`${p.employee_id}|${p.period_id}`, p.points]));
  const perPeriodKpi = (id: string, pid: string): number | null => {
    const vals = (monthsByPeriod.get(pid) ?? []).map((ym) => kpiOf(id, ym)).filter(nn);
    return vals.length ? mean(vals) : null;
  };
  const finalOf = (id: string, pid: string): number | null => {
    const p = periodById.get(pid); if (!p) return null;
    return finalScoreOf(perPeriodKpi(id, pid), s360Of.get(`${id}|${pid}`) ?? null, p.has_360, penOf.get(`${id}|${pid}`) ?? 0, true);
  };

  // A. Tren tim per periode (Avg KPI & Avg 360° tim). Simpan `id` internal agar bisa mengurai
  //    penyebab perubahan (Sorotan) pada dua periode berdata terakhir.
  const anyHas360 = periodList.some((p) => p.has_360);
  const periodsTrendFull = periodList.map((p) => {
    const pYms = monthsByPeriod.get(p.id) ?? [];
    const kpis = ids.map((id) => mean(pYms.map((ym) => kpiOf(id, ym)).filter(nn))).filter(nn);
    const s360s = p.has_360 ? ids.map((id) => s360Of.get(`${id}|${p.id}`) ?? null).filter(nn) : [];
    const finals = ids.map((id) => finalOf(id, p.id)).filter(nn);
    return { id: p.id, label: p.label, kpi: mean(kpis), s360: mean(s360s), final: mean(finals) };
  }).filter((pt) => pt.kpi != null || pt.s360 != null);
  const periodsTrend: PeriodTrendPoint[] = periodsTrendFull.map(({ label, kpi, s360, final }) => ({ label, kpi, s360, final }));

  // B. Tren KPI tim per bulan.
  const teamMonthly = allYms.map((ym) => mean(ids.map((id) => kpiOf(id, ym)).filter(nn)));

  // C. Tren KPI per pegawai per bulan (dropdown; pembanding rerata KPI tim saat pilih 1 pegawai).
  const employeesMonthly: EmpMonthly[] = empRows
    .map((e) => ({ id: e.id, name: e.name, nickname: e.nickname, monthly: allYms.map((ym) => kpiOf(e.id, ym)) }))
    .filter((e) => e.monthly.some((v) => v != null))
    .sort((a, b) => a.name.localeCompare(b.name));

  // D. Top Movers — selisih KPI per pegawai antara DUA periode berdata terakhir (rerata KPI
  //    bulan-bulan tiap periode). Hanya pegawai yang bernilai di KEDUA periode (bisa dibandingkan).
  //    (perPeriodKpi didefinisikan di atas — dipakai bersama overlay Skor Akhir per-kuartal.)
  const kpiPeriods = periodList.filter((p) => ids.some((id) => perPeriodKpi(id, p.id) != null));
  const currP = kpiPeriods[kpiPeriods.length - 1] ?? null;
  const prevP = kpiPeriods[kpiPeriods.length - 2] ?? null;
  const moverLabels = currP && prevP ? { prev: prevP.label, curr: currP.label } : null;
  const movers: MoverRow[] = (currP && prevP)
    ? empRows
        .map((e) => {
          const c = perPeriodKpi(e.id, currP.id);
          const pv = perPeriodKpi(e.id, prevP.id);
          return c != null && pv != null ? { name: e.name, nickname: e.nickname, delta: c - pv, curr: c } : null;
        })
        .filter((m): m is NonNullable<typeof m> => m != null)
        .sort((a, b) => b.delta - a.delta)
    : [];

  // D2. Pergerakan 360° — selisih Skor 360° per pegawai antara DUA periode ber-360° terakhir,
  //     + rincian PER-ASPEK (di aspek mana naik/turun). Aspek per pegawai dihitung via pipeline
  //     resmi (aspectScoresByEmployee); di-memo per periode → hemat (dipakai lagi utk profil aspek).
  const aspCache = new Map<string, ReturnType<typeof aspectScoresByEmployee>>();
  const aspOf = (pid: string) => { let p = aspCache.get(pid); if (!p) { p = aspectScoresByEmployee(pid, ids); aspCache.set(pid, p); } return p; };
  const p360WithData = periodList.filter((p) => p.has_360 && ids.some((id) => s360Of.has(`${id}|${p.id}`)));
  const curr360P = p360WithData[p360WithData.length - 1] ?? null;
  const prev360P = p360WithData[p360WithData.length - 2] ?? null;
  const moverLabels360 = curr360P && prev360P ? { prev: prev360P.label, curr: curr360P.label } : null;
  let movers360: MoverRow360[] = [];
  if (curr360P && prev360P) {
    const [prevAsp, currAsp] = await Promise.all([aspOf(prev360P.id), aspOf(curr360P.id)]);
    movers360 = empRows
      .map((e) => {
        const c = s360Of.get(`${e.id}|${curr360P.id}`) ?? null;
        const pv = s360Of.get(`${e.id}|${prev360P.id}`) ?? null;
        if (c == null || pv == null) return null;
        const cm = currAsp.byEmp.get(e.id);
        const pm = prevAsp.byEmp.get(e.id);
        const aspNames = [...new Set([...(cm?.keys() ?? []), ...(pm?.keys() ?? [])])];
        const aspects = aspNames
          .map((nm) => {
            const cv = cm?.get(nm), pval = pm?.get(nm);
            return cv != null && pval != null ? { aspect: nm, delta: cv - pval } : null;
          })
          .filter((a): a is { aspect: string; delta: number } => a != null && Math.abs(a.delta) >= 1);
        return { name: e.name, nickname: e.nickname, delta: c - pv, curr: c, aspects };
      })
      .filter((m): m is NonNullable<typeof m> => m != null)
      .sort((a, b) => b.delta - a.delta);
  }

  // E. Uraian PENYEBAB perubahan Δ (Sorotan) untuk dua periode berdata terakhir: pisah selisih
  //    total jadi (a) perubahan skor pegawai konsisten & (b) perubahan komposisi (masuk/keluar).
  //    Identitas eksak: total(currAvg−prevAvg) = real(konsisten) + cohort(sisanya).
  const causeBetween = (get: (id: string, pid: string) => number | null, prevId: string, currId: string): DeltaCause => {
    const prevById = new Map<string, number>(), currById = new Map<string, number>();
    ids.forEach((id) => {
      const pv = get(id, prevId); if (pv != null) prevById.set(id, pv);
      const cv = get(id, currId); if (cv != null) currById.set(id, cv);
    });
    const prevAvg = mean([...prevById.values()]);
    const currAvg = mean([...currById.values()]);
    const total = prevAvg != null && currAvg != null ? currAvg - prevAvg : null;
    const common = [...currById.keys()].filter((id) => prevById.has(id));
    const real = common.length
      ? (mean(common.map((id) => currById.get(id)!)) ?? 0) - (mean(common.map((id) => prevById.get(id)!)) ?? 0)
      : null;
    const cohort = total != null && real != null ? total - real : null;
    const enteredN = [...currById.keys()].filter((id) => !prevById.has(id)).length;
    const leftN = [...prevById.keys()].filter((id) => !currById.has(id)).length;
    return { total, real, cohort, commonN: common.length, enteredN, leftN };
  };
  // Dua periode berdata terakhir (selaras dua titik terakhir di grafik tren / kartu Δ).
  const cN = periodsTrendFull.length;
  const causeCurr = cN >= 1 ? periodsTrendFull[cN - 1] : null;
  const causePrev = cN >= 2 ? periodsTrendFull[cN - 2] : null;
  const get360 = (id: string, pid: string) => s360Of.get(`${id}|${pid}`) ?? null;
  const kpiCause: DeltaCause | null = causeCurr && causePrev ? causeBetween(perPeriodKpi, causePrev.id, causeCurr.id) : null;
  const s360Cause: DeltaCause | null = causeCurr && causePrev && anyHas360 ? causeBetween(get360, causePrev.id, causeCurr.id) : null;

  // D3. Profil aspek budaya tim (statik) + heatmap aspek/indikator per pegawai (periode terpilih).
  const selAsp = sel.has_360 ? await aspOf(sel.id) : null;
  // Pembanding "vs organisasi" per aspek (rata-rata seluruh pegawai internal, periode terpilih).
  const orgAspect = selAsp ? await orgAspectAverages(sel.id) : null;
  const teamAspect = selAsp
    ? selAsp.names.map((nm) => {
        const vals = ids.map((id) => selAsp.byEmp.get(id)?.get(nm)).filter((v): v is number => v != null);
        return { aspek: nm, score: vals.length ? (mean(vals) ?? 0) : 0, orgScore: orgAspect?.get(nm) };
      }).filter((a) => a.score > 0)
    : [];
  const heat = selAsp ? heatDataFromAspect(selAsp, empRows) : null;

  return (
    <Shell>
      <Header coordinator={coordinatorView} />
      <Toolbar periods={periodList} current={sel.id} />

      {rows.length === 0 && (
        <p className="text-sm text-ink-soft mt-4">Belum ada data kinerja untuk periode ini — grafik tren lintas periode tetap tampil di bawah.</p>
      )}

      {rows.length > 0 && (
        <>
          {/* A. RINGKASAN — keadaan periode terpilih */}
          <SectionHeader label="Ringkasan" hint="keadaan periode terpilih" tone="emerald" />
          <TeamScorecards total={rows.length} teamKpi={tAvg.kpi} companyKpi={cAvg.kpi}
            team360={tAvg.s360} company360={cAvg.s360} has360={sel.has_360}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length}
            fillTotal={ids.length} kpiFilled={kpiBy.size} s360Filled={s360By.size} />

          {/* B. KOMPOSISI — sebaran & profil aspek */}
          <SectionHeader label="Komposisi" hint="sebaran kategori & profil aspek" tone="indigo" />
          <DistBars
            kpiPeople={rows.filter((r) => r.trend !== 'unread' && r.kpiAvg != null).map((r) => ({ name: r.name, nickname: r.nickname, value: r.kpiAvg as number }))}
            s360People={sel.has_360 ? rows.filter((r) => r.s360 != null).map((r) => ({ name: r.name, nickname: r.nickname, value: r.s360 as number })) : null} />
          {teamAspect.length > 0 && <TeamAspectProfile aspects={teamAspect} scopeLabel={sel.label} />}
        </>
      )}

      {/* C. ARAH — tren & pergerakan lintas periode/bulan */}
      <SectionHeader label="Arah — Tren & Pergerakan" hint="lintas periode/bulan" tone="amber" />
      <MonitorTrends periodsTrend={periodsTrend} monthLabels={monthLabels}
        teamMonthly={teamMonthly} employees={employeesMonthly} has360={anyHas360}
        movers={movers} moverLabels={moverLabels} kpiCause={kpiCause} s360Cause={s360Cause}
        movers360={movers360} moverLabels360={moverLabels360} />

      {rows.length > 0 && (
        <>
          {/* D. RINCIAN PER PEGAWAI — tabel & heatmap (paling rinci) */}
          <SectionHeader label="Rincian per Pegawai" hint="tabel & heatmap" tone="slate" />
          <TeamTable rows={rows} linkNames={false} showStatus={false} showAcc={false} scoreBasis="live" pageSize={5} />
          {heat && heat.aspectRows.length > 0 && (
            <ExtremesHeatmap
              pieTitle="Aspek Terlemah & Terkuat Tim (Frekuensi)"
              pieSubtitle="Aspek budaya yang paling sering jadi titik terlemah/terkuat tiap pegawai — klik irisan untuk menyaring heatmap."
              heatTitle="Heatmap Aspek per Pegawai"
              heatSubtitle="Skor 360° per aspek budaya tiap pegawai (0–100). Kolom Terlemah/Terkuat menyebut aspek terendah & tertinggi tiap orang."
              columns={heat.aspectCols} rows={heat.aspectRows} />
          )}
          {heat && heat.indRows.length > 0 && (
            <ExtremesHeatmap
              pieTitle="Indikator Terlemah & Terkuat Tim (Frekuensi)"
              pieSubtitle="Indikator yang paling sering jadi titik terlemah/terkuat tiap pegawai — klik irisan untuk menyaring heatmap."
              heatTitle="Heatmap Indikator per Pegawai"
              heatSubtitle="Skor 360° per indikator penilaian tiap pegawai (0–100), dikelompokkan per aspek."
              columns={heat.indCols} rows={heat.indRows} />
          )}
        </>
      )}
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
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Monitor Kinerja</h1>
        <p className="text-[13.5px] text-ink-soft mt-1">
          {coordinator
            ? 'Dashboard kinerja pegawai yang Anda koordinasikan — snapshot per periode & tren lintas waktu.'
            : 'Dashboard kinerja tim Anda (termasuk diri Anda) — snapshot per periode & tren lintas waktu.'}
        </p>
      </div>
      <Link href="/" className="text-xs text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>
  );
}
