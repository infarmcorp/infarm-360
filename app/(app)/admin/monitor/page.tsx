import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { finalScoreOf, playerClassOf } from '@/lib/scoring';
import { trendOf } from '@/lib/trend';
import { scoreMaps, penaltyMap, teamAverages, companyAverages } from '@/lib/team-metrics';
import { fetchAllByIds, fetchAllPaged } from '@/lib/supabase/paginate';
import { aspectScoresByEmployee, heatDataFromAspect, orgAspectAverages } from '@/lib/aspect360';
import { ExtremesHeatmap } from '@/app/(app)/monitor/extremes-heatmap';
import { TeamTable, type TeamRow } from '@/app/(app)/laporan-tim/team-table';
import { MonitorTrends, type EmpMonthly, type PeriodTrendPoint, type MoverRow, type MoverRow360, type DeltaCause } from '@/app/(app)/monitor/monitor-trends';
import { DistBars } from '@/app/(app)/monitor/dist-bars';
import { FilledNote } from '@/app/(app)/monitor/completeness';
import { TeamAspectProfile } from '@/app/(app)/monitor/team-aspect';
import { SectionHeader } from '@/app/(app)/monitor/section-header';
import { MonitorFilters } from './monitor-filters';

/**
 * Monitor Kinerja Pegawai (HRD Admin) — SAMA seperti Monitor Kinerja SPV/Koordinator (scorecard ·
 * distribusi kategori · tabel KPI/360°/Skor Akhir/4-Box/Trend · grafik tren lintas periode ·
 * Pergerakan KPI & 360° per-aspek · Sorotan penyebab Δ), tetapi lingkupnya SELURUH pegawai internal
 * atau SATU DIVISI (filter). Skor Akhir dihitung LIVE (KPI + 360° − punishment).
 *
 * FILTER: Periode + Divisi, keduanya DI SERVER lewat URL (`?period=&dept=`). SELURUH kartu mengikuti
 * filter (bukan hanya tabel). "Seluruh Divisi" = semua pegawai internal. Memilih satu divisi
 * mempersempit data yang dibaca → egress lebih ringan. TABEL dipaginasi 5/halaman (sisi-klien,
 * independen dari kartu lain).
 *
 * EGRESS: dibaca via service_role dengan PAGINASI (fetchAllByIds/fetchAllPaged) agar data
 * lintas-periode tak terpotong batas 1000-baris PostgREST. On-demand (buka halaman) — setara
 * Dashboard Organisasi. Akses: bagian HRD `dashboard` (canSection).
 */
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function AdminMonitorPage({ searchParams }: { searchParams: Promise<{ period?: string; dept?: string }> }) {
  const { period: periodParam, dept: deptParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'dashboard')) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin (akses Dashboard Organisasi).</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: periodRows } = await supabase
    .from('periods').select('id, label, has_360, status, start_date').order('start_date', { ascending: true });
  const periodList = periodRows ?? [];
  if (periodList.length === 0) return <Shell><Header /><p className="text-sm text-gray-500 mt-4">Belum ada periode.</p></Shell>;
  const sel = periodList.find((p) => p.id === periodParam)
    ?? periodList.find((p) => p.status === 'active')
    ?? periodList[periodList.length - 1];

  // Daftar divisi (untuk filter) + lingkup pegawai. Dibaca via service_role.
  const admin = createAdminClient();
  const { data: deptData } = await admin.from('employees').select('dept').eq('is_external', false);
  const depts = [...new Set((deptData ?? []).map((d) => d.dept).filter((d): d is string => !!d))].sort();
  const dept = deptParam && depts.includes(deptParam) ? deptParam : 'all';
  const scopeLabel = dept === 'all' ? 'Semua divisi' : dept;

  // Lingkup: SELURUH pegawai internal, atau SATU divisi bila difilter.
  let empQuery = admin.from('employees').select('id, name, dept, is_active').eq('is_external', false);
  if (dept !== 'all') empQuery = empQuery.eq('dept', dept);
  const { data: empData } = await empQuery;
  const empRows = empData ?? [];
  if (empRows.length === 0) return <Shell><Header /><Toolbar periods={periodList} current={sel.id} depts={depts} dept={dept} /><p className="text-sm text-gray-500 mt-4">Belum ada pegawai dalam lingkup ini.</p></Shell>;
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
      finalScore: finalScoreOf(kpiAvg, s360, sel.has_360, penalty, true),
      player: playerClassOf(kpiAvg, sel.has_360 ? s360 : null),
      trend: trendOf(kpiMonths),
      kpiMonths,
      status: null, hasReport: false, spvAcc: false,
      isSelf: e.id === user.id, detailOpen: false, canAcc: false,
    };
  })
    .filter((r) => activeIds.has(r.id) || r.kpiAvg != null || r.s360 != null)
    .sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
  // Rata-rata lingkup terpilih (org/divisi) untuk scorecard — dari baris yang ditampilkan.
  const sAvg = teamAverages(rows);

  // ── Data tren LINTAS periode/bulan (org-wide → PAGINASI wajib, cegah potong 1000 baris) ──
  const [kpiAll, r360All, pmAll] = await Promise.all([
    fetchAllByIds<{ employee_id: string; ym: string; score: number }>(ids, (chunk, from, to) =>
      admin.from('kpi_scores').select('employee_id, ym, score').in('employee_id', chunk).order('employee_id').order('ym').range(from, to)),
    fetchAllByIds<{ employee_id: string; period_id: string; score: number | null }>(ids, (chunk, from, to) =>
      admin.from('result_360').select('employee_id, period_id, score').in('employee_id', chunk).order('employee_id').order('period_id').range(from, to)),
    fetchAllPaged<{ period_id: string; ym: string }>((from, to) =>
      admin.from('period_months').select('period_id, ym').order('period_id').order('ym').range(from, to)),
  ]);
  const kpiAgg = new Map<string, { s: number; n: number }>(); // `${emp}|${ym}`
  kpiAll.forEach((r) => { const k = `${r.employee_id}|${r.ym}`; const a = kpiAgg.get(k) ?? { s: 0, n: 0 }; a.s += r.score; a.n += 1; kpiAgg.set(k, a); });
  const kpiOf = (id: string, ym: string) => { const a = kpiAgg.get(`${id}|${ym}`); return a ? a.s / a.n : null; };
  const s360Of = new Map(r360All.filter((r) => r.score != null).map((r) => [`${r.employee_id}|${r.period_id}`, r.score as number]));
  const monthsByPeriod = new Map<string, string[]>();
  pmAll.forEach((m) => { const a = monthsByPeriod.get(m.period_id) ?? []; a.push(m.ym); monthsByPeriod.set(m.period_id, a); });

  const allYms = [...new Set(kpiAll.map((r) => r.ym))].sort();
  const monthLabels = allYms.map(labelOf);
  const nn = (v: number | null): v is number => v != null;

  const anyHas360 = periodList.some((p) => p.has_360);
  const periodsTrendFull = periodList.map((p) => {
    const pYms = monthsByPeriod.get(p.id) ?? [];
    const kpis = ids.map((id) => mean(pYms.map((ym) => kpiOf(id, ym)).filter(nn))).filter(nn);
    const s360s = p.has_360 ? ids.map((id) => s360Of.get(`${id}|${p.id}`) ?? null).filter(nn) : [];
    return { id: p.id, label: p.label, kpi: mean(kpis), s360: mean(s360s) };
  }).filter((pt) => pt.kpi != null || pt.s360 != null);
  const periodsTrend: PeriodTrendPoint[] = periodsTrendFull.map(({ label, kpi, s360 }) => ({ label, kpi, s360 }));

  const teamMonthly = allYms.map((ym) => mean(ids.map((id) => kpiOf(id, ym)).filter(nn)));

  const employeesMonthly: EmpMonthly[] = empRows
    .map((e) => ({ id: e.id, name: e.name, monthly: allYms.map((ym) => kpiOf(e.id, ym)) }))
    .filter((e) => e.monthly.some((v) => v != null))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Pergerakan KPI — selisih KPI per pegawai antara DUA periode berdata terakhir.
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

  // Pergerakan 360° + rincian per-aspek (dua periode ber-360° terakhir). Aspek per pegawai
  // di-memo per periode (dipakai lagi untuk profil aspek lingkup).
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
        return { name: e.name, delta: c - pv, curr: c, aspects };
      })
      .filter((m): m is MoverRow360 => m != null)
      .sort((a, b) => b.delta - a.delta);
  }

  // Sorotan penyebab Δ (dua periode berdata terakhir): pisah skor konsisten vs komposisi.
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
  const cN = periodsTrendFull.length;
  const causeCurr = cN >= 1 ? periodsTrendFull[cN - 1] : null;
  const causePrev = cN >= 2 ? periodsTrendFull[cN - 2] : null;
  const get360 = (id: string, pid: string) => s360Of.get(`${id}|${pid}`) ?? null;
  const kpiCause: DeltaCause | null = causeCurr && causePrev ? causeBetween(perPeriodKpi, causePrev.id, causeCurr.id) : null;
  const s360Cause: DeltaCause | null = causeCurr && causePrev && anyHas360 ? causeBetween(get360, causePrev.id, causeCurr.id) : null;

  // Profil aspek budaya lingkup (statik) + heatmap aspek/indikator per pegawai (periode terpilih).
  const selAsp = sel.has_360 ? await aspOf(sel.id) : null;
  // Pembanding "vs organisasi" per aspek — hanya bermakna saat difilter divisi (dept≠all); saat
  // 'all' lingkup SUDAH = organisasi (delta akan selalu ±0), jadi tak ditampilkan.
  const orgAspect = selAsp && dept !== 'all' ? await orgAspectAverages(sel.id) : null;
  const teamAspect = selAsp
    ? selAsp.names.map((nm) => {
        const vals = ids.map((id) => selAsp.byEmp.get(id)?.get(nm)).filter((v): v is number => v != null);
        return { aspek: nm, score: vals.length ? (mean(vals) ?? 0) : 0, orgScore: orgAspect?.get(nm) };
      }).filter((a) => a.score > 0)
    : [];
  const heat = selAsp ? heatDataFromAspect(selAsp, empRows) : null;

  // #5 Pembanding divisi-vs-organisasi: saat filter divisi aktif, hitung rata-rata ORGANISASI
  // (seluruh internal non-direksi) untuk periode ini → delta "vs rata-rata organisasi" di scorecard.
  const orgAvg = dept !== 'all' ? await companyAverages(sel.id) : null;

  return (
    <Shell>
      <Header />
      <Toolbar periods={periodList} current={sel.id} depts={depts} dept={dept} />

      {rows.length === 0 && (
        <p className="text-sm text-gray-500 mt-4">Belum ada data kinerja untuk lingkup ini — grafik tren lintas periode tetap tampil di bawah.</p>
      )}

      {rows.length > 0 && (
        <>
          {/* A. RINGKASAN */}
          <SectionHeader label="Ringkasan" hint="keadaan lingkup terpilih" tone="emerald" />
          <ScopeScorecards total={rows.length} kpi={sAvg.kpi} s360={sAvg.s360} has360={sel.has_360}
            scopeLabel={scopeLabel} periodLabel={sel.label}
            kpiUnread={rows.filter((r) => r.trend === 'unread').length}
            orgKpi={orgAvg?.kpi ?? null} orgS360={orgAvg?.s360 ?? null}
            fillTotal={ids.length} kpiFilled={kpiBy.size} s360Filled={s360By.size} />

          {/* B. KOMPOSISI */}
          <SectionHeader label="Komposisi" hint="sebaran kategori & profil aspek" tone="indigo" />
          <DistBars
            kpiPeople={rows.filter((r) => r.trend !== 'unread' && r.kpiAvg != null).map((r) => ({ name: r.name, value: r.kpiAvg as number }))}
            s360People={sel.has_360 ? rows.filter((r) => r.s360 != null).map((r) => ({ name: r.name, value: r.s360 as number })) : null} />
          {teamAspect.length > 0 && <TeamAspectProfile aspects={teamAspect} scopeLabel={scopeLabel} />}
        </>
      )}

      {/* C. ARAH — tren & pergerakan */}
      <SectionHeader label="Arah — Tren & Pergerakan" hint="lintas periode/bulan" tone="amber" />
      <MonitorTrends periodsTrend={periodsTrend} monthLabels={monthLabels}
        teamMonthly={teamMonthly} employees={employeesMonthly} has360={anyHas360}
        movers={movers} moverLabels={moverLabels} kpiCause={kpiCause} s360Cause={s360Cause}
        movers360={movers360} moverLabels360={moverLabels360} />

      {rows.length > 0 && (
        <>
          {/* D. RINCIAN PER PEGAWAI — tabel & heatmap */}
          <SectionHeader label="Rincian per Pegawai" hint="tabel & heatmap" tone="slate" />
          <TeamTable rows={rows} linkNames={false} showStatus={false} showAcc={false} scoreBasis="live" pageSize={5} />
          {heat && heat.aspectRows.length > 0 && (
            <ExtremesHeatmap
              pieTitle="Aspek Terlemah & Terkuat (Frekuensi)"
              pieSubtitle="Aspek budaya yang paling sering jadi titik terlemah/terkuat tiap pegawai dalam lingkup ini — klik irisan untuk menyaring heatmap."
              heatTitle="Heatmap Aspek per Pegawai"
              heatSubtitle="Skor 360° per aspek budaya tiap pegawai (0–100). Cari nama / geser halaman; kolom Terlemah/Terkuat menyebut aspek terendah & tertinggi tiap orang."
              columns={heat.aspectCols} rows={heat.aspectRows} pageSize={5} />
          )}
          {heat && heat.indRows.length > 0 && (
            <ExtremesHeatmap
              pieTitle="Indikator Terlemah & Terkuat (Frekuensi)"
              pieSubtitle="Indikator yang paling sering jadi titik terlemah/terkuat tiap pegawai — klik irisan untuk menyaring heatmap."
              heatTitle="Heatmap Indikator per Pegawai"
              heatSubtitle="Skor 360° per indikator penilaian tiap pegawai (0–100), dikelompokkan per aspek. Cari nama / geser halaman untuk lingkup besar."
              columns={heat.indCols} rows={heat.indRows} pageSize={5} />
          )}
        </>
      )}
    </Shell>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelOf = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m}'${y.slice(2)}`; };

/** Delta lingkup vs rata-rata organisasi (hanya saat filter divisi aktif). */
function OrgDelta({ scope, org }: { scope: number | null; org: number | null }) {
  if (scope == null || org == null) return null;
  const d = scope - org;
  const up = d >= 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? 'text-emerald-700' : 'text-rose-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(d).toFixed(2)} vs rata-rata organisasi
    </span>
  );
}

/** Kartu ringkas lingkup terpilih: Total Pegawai · Avg KPI · Avg 360° (org atau divisi). */
function ScopeScorecards({
  total, kpi, s360, has360, scopeLabel, periodLabel, kpiUnread = 0, orgKpi = null, orgS360 = null,
  fillTotal, kpiFilled, s360Filled,
}: { total: number; kpi: number | null; s360: number | null; has360: boolean; scopeLabel: string; periodLabel: string; kpiUnread?: number; orgKpi?: number | null; orgS360?: number | null; fillTotal?: number; kpiFilled?: number; s360Filled?: number }) {
  const sub = `${scopeLabel} · ${periodLabel}`;
  const Card = ({ label, value, subtext, delta, note }: { label: string; value: React.ReactNode; subtext?: string; delta?: React.ReactNode; note?: React.ReactNode }) => (
    <div className="flex-1 min-w-[150px] rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-black font-mono text-slate-800 mt-0.5">{value}</div>
      {delta && <div className="mt-1">{delta}</div>}
      {subtext && <div className="text-[11px] text-gray-500 mt-1">{subtext}</div>}
      {note}
    </div>
  );
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <Card label="Total Pegawai" value={total} subtext={scopeLabel} />
      <Card label="Avg KPI" value={kpi != null ? kpi.toFixed(2) : '—'}
        delta={orgKpi != null ? <OrgDelta scope={kpi} org={orgKpi} /> : undefined}
        subtext={kpiUnread > 0 ? `${sub} · ${kpiUnread} belum terbaca (dikecualikan)` : sub}
        note={fillTotal != null && kpiFilled != null ? <FilledNote n={kpiFilled} total={fillTotal} /> : undefined} />
      {has360 && <Card label="Avg 360°" value={s360 != null ? s360.toFixed(2) : '—'}
        delta={orgS360 != null ? <OrgDelta scope={s360} org={orgS360} /> : undefined}
        subtext={sub}
        note={fillTotal != null && s360Filled != null ? <FilledNote n={s360Filled} total={fillTotal} /> : undefined} />}
    </div>
  );
}

function Toolbar({ periods, current, depts, dept }: { periods: { id: string; label: string; status: string }[]; current: string; depts: string[]; dept: string }) {
  return <MonitorFilters periods={periods} currentPeriod={current} depts={depts} currentDept={dept} />;
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Monitor Kinerja Pegawai</h1>
        <p className="text-sm text-gray-500">
          Pemantauan kinerja seluruh pegawai — snapshot per periode &amp; tren lintas waktu.
          Skor Akhir dihitung langsung (live).
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          <span className="font-semibold text-gray-500">Fokus halaman ini:</span> pergerakan &amp; pelacakan per-pegawai lintas waktu.
          {' '}· Butuh <span className="text-gray-500">klasifikasi talenta &amp; snapshot (4-Box, scatter, kategori)</span>?{' '}
          <Link href="/admin/dashboard" className="text-emerald-700 hover:underline font-semibold">Dashboard Organisasi →</Link>
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
