import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin, canSection, grantedAccess, employeeInScopes, type PageScope } from '@/lib/auth/roles';
import {
  finalScoreOf, playerClassOf,
} from '@/lib/scoring';
import { computeDashboardAggregate } from '@/lib/dashboard/aggregate';
import { classOf, avg as avg360, weightedScore360, type Groups360 } from '@/lib/score360';
import { trendOf } from '@/lib/trend';
import type { RelationKind, WeightValues } from '@/lib/database.types';
import { fetchAllByIds, fetchAllPaged } from '@/lib/supabase/paginate';
import { DashboardVisual, type MoveBreakdown } from './dashboard-visual';
import { DashboardFilters } from './dashboard-filters';
import { EmptyState } from '@/components/empty-state';

/**
 * Dashboard Organisasi (HRD/Direksi) — versi termigrasi Supabase.
 * Gabung Rerata KPI + result_360 + punishment → Skor Akhir, lalu klasifikasi 4-Box.
 * Lingkup dipilih lewat ?period=&dept= (default periode aktif, semua divisi); KPI, 360°,
 * & Skor Akhir selalu dari periode + divisi yang sama agar konsisten.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; dept?: string }>;
}) {
  const { period: periodParam, dept: deptParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections, dept').eq('id', user.id).maybeSingle();
  // Akses SADAR-MODE: PENUH (semua pegawai) hanya untuk HRD di Mode Admin & Direksi (read-only).
  // Selain itu → jalur GRANT 'dashboard' berlingkup (baca via service_role, disaring per lingkup).
  // ⚠️ Untuk pemegang is_hrd() ini pembatasan TAMPILAN; batas nyata hanya berlaku untuk non-HRD.
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const isHrdFull = canSection(me, 'dashboard') && hrdMode === 'admin';
  const isDireksi = me?.role === 'direksi';
  let grantScopes: PageScope[] | null = null;
  if (!isHrdFull && !isDireksi) {
    const { data: g } = await supabase.from('page_grants').select('section, scope, scopes').eq('employee_id', user.id);
    grantScopes = grantedAccess(g, 'dashboard')?.scopes ?? null;
  }
  if (!isHrdFull && !isDireksi && !grantScopes) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk HRD / Direksi atau pemegang akses Dashboard.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }
  // canMonitor = tautan silang ke Monitor Kinerja Pegawai (hanya HRD penuh).
  const canMonitor = isHrdFull;
  const viaGrant = !isHrdFull && !isDireksi;
  const ownDept = (me?.dept ?? '').trim();
  // Pemegang grant bukan is_hrd() → RLS memblokir baca lintas-pegawai → SELURUH data via service_role.
  const db = viaGrant ? createAdminClient() : supabase;
  // Tim naungan (hanya bila lingkup 'coordinator_team'): id anggota tim pemegang.
  const teamIds = viaGrant && grantScopes!.includes('coordinator_team')
    ? new Set(((await db.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id)).data ?? []).map((r) => r.employee_id))
    : undefined;

  // Daftar periode + periode terpilih (param → aktif → terbaru).
  const { data: periodRows } = await db
    .from('periods').select('id, label, has_360, status, kpi_standard, start_date, end_date').order('label', { ascending: false });
  const periodList = periodRows ?? [];
  if (periodList.length === 0) return (
    <Shell>
      <EmptyState
        icon="📊"
        title="Dashboard belum punya data"
        description="Dashboard merangkum KPI, 360°, & Skor Akhir per periode. Belum ada periode, jadi belum ada yang bisa ditampilkan."
        steps={[
          { text: <>Buat & aktifkan periode di <strong>Kelola Siklus Periode</strong></> },
          { text: <>Isi KPI bulanan & jalankan penilaian 360°</> },
          { text: <>Jalankan <strong>Hitung Ulang Skor 360°</strong> → grafik terisi</> },
        ]}
        actions={canAdmin(me) ? [{ label: 'Ke Kelola Periode', href: '/admin/periode', primary: true }] : undefined}
      />
    </Shell>
  );
  const ap = periodList.find((p) => p.id === periodParam)
    ?? periodList.find((p) => p.status === 'active')
    ?? periodList[0];

  // Pegawai non-direksi + daftar divisi; lingkup divisi terpilih (default semua).
  // Pelaporan: ambil TANPA filter is_active; keanggotaan kuartal ditentukan belakangan lewat
  // irisan masa kerja (joined_on/left_on) × rentang periode, ATAU jejak data (hibrida).
  const { data: allEmpRows } = await db.from('employees').select('id, name, dept, is_active, joined_on, left_on').neq('role', 'direksi').eq('is_external', false);
  // Pemegang grant: batasi ke lingkupnya (employeeInScopes; 'coordinator_team' via teamIds). HRD/Direksi → semua.
  const allEmps = (allEmpRows ?? []).filter((e) => !viaGrant || employeeInScopes(grantScopes!, ownDept, user.id, e, teamIds));
  const deptList = [...new Set(allEmps.map((e) => e.dept))].sort();
  const dept = deptParam && deptParam !== 'all' && deptList.includes(deptParam) ? deptParam : 'all';
  const emps = dept === 'all' ? allEmps : allEmps.filter((e) => e.dept === dept);
  const empIds = emps.map((e) => e.id);
  const inScope = (id: string) => empIds.includes(id);

  // ── Mode AGREGAT (on-demand via filter): "Semua Kuartal" (1 tahun) / "Semua Tahun" (all-time) ──
  // Scope = sentinel di param `period`: `year:<YYYY>` (agregat 1 tahun) · `all` (agregat lintas tahun).
  // Query berat aspek dijalankan HANYA di sini (saat mode agregat dipilih) → muat per-kuartal nol beban.
  const aggScope: 'year' | 'all' | null =
    periodParam === 'all' ? 'all' : periodParam?.startsWith('year:') ? 'year' : null;
  if (aggScope) {
    const selY = aggScope === 'year' ? Number(periodParam!.slice(5)) || 0 : 0;
    const aggPeriods = (aggScope === 'all'
      ? periodList
      : periodList.filter((p) => Number(String(p.start_date).slice(0, 4)) === selY)
    ).map((p) => ({ id: p.id, label: p.label, has_360: p.has_360, start_date: String(p.start_date), kpi_standard: p.kpi_standard }));
    const bundle = await computeDashboardAggregate(
      aggPeriods.map((p) => ({ id: p.id, label: p.label, has_360: p.has_360, start_date: p.start_date })),
      emps.map((e) => ({ id: e.id, name: e.name, dept: e.dept })),
      empIds,
    );
    const scopeLabel = aggScope === 'all' ? 'Semua Tahun (all-time)' : `Tahun ${selY} · Semua Kuartal`;
    const kpiStd = aggPeriods[aggPeriods.length - 1]?.kpi_standard ?? ap.kpi_standard ?? 80;
    return (
      <Shell>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Dashboard Organisasi</h1>
            <p className="text-sm text-gray-500">
              {scopeLabel} · {dept === 'all' ? 'semua divisi' : `divisi ${dept}`} · agregat rata-rata antar-kuartal
            </p>
            <PagePurpose canMonitor={canMonitor} />
          </div>
          <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
        </div>
        <DashboardFilters
          periods={periodList.map((p) => ({ id: p.id, label: p.label, status: p.status, year: Number(String(p.start_date).slice(0, 4)) || 0 }))}
          depts={deptList}
          currentPeriod={periodParam ?? ''}
          currentDept={dept}
        />
        <div className="my-5">
          <DashboardVisual
            rows={bundle.rows}
            deptScores={bundle.deptScores}
            aspectScores={bundle.aspectScores}
            monthly={bundle.monthly}
            deptMonthly={bundle.deptMonthly}
            months={bundle.months}
            deptAspect360={bundle.deptAspect360}
            aspect360Names={bundle.aspect360Names}
            yearLabel={selY}
            yearMonthly={bundle.yearMonthly}
            year360={bundle.year360}
            yearKpiAvg={bundle.yearKpiAvg}
            year360Avg={bundle.year360Avg}
            has360={bundle.has360}
            periodLabel={scopeLabel}
            kpiStandard={kpiStd}
            prevLabel={null}
            prevFinalAvg={null}
            prevKpiAvg={null}
            prev360Avg={null}
            finalMove={null}
            kpiMove={null}
            s360Move={null}
            aggregate={true}
            quarterlyDist={[]}
          />
        </div>
      </Shell>
    );
  }

  // Gelombang 1 — query periode terpilih, di-scope ke pegawai dalam lingkup divisi.
  const [monthsRes, r360Res, penRes, aspectRes, asmtRes] = await Promise.all([
    db.from('period_months').select('ym').eq('period_id', ap.id),
    db.from('result_360').select('employee_id, score').eq('period_id', ap.id),
    db.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id),
    db.from('culture_aspects').select('id, name, order_idx').eq('period_id', ap.id).order('order_idx'),
    db.from('assessments').select('id, assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted'),
  ]);
  const ymList = (monthsRes.data ?? []).map((m) => m.ym);
  const aspectList = aspectRes.data ?? [];
  // Aspek 360° hanya dari penilaian terhadap target dalam lingkup (non-Self).
  const nonSelfIds = (asmtRes.data ?? [])
    .filter((a) => a.assessor_id !== a.target_id && inScope(a.target_id)).map((a) => a.id);

  // Gelombang 2 — query turunan (butuh hasil gelombang 1), saling independen → paralel.
  // scoreRows DIPAGINASI + di-chunk: assessment_indicator_scores bisa >4000 baris (semua divisi)
  // → tanpa ini rating aspek 360° terpotong di 1000 → radar "Evaluasi Budaya 360°" SALAH diam-diam.
  const [kpiRes, indRes, scoreRows] = await Promise.all([
    ymList.length && empIds.length ? db.from('kpi_scores').select('employee_id, ym, score').in('ym', ymList).in('employee_id', empIds) : Promise.resolve({ data: [] as { employee_id: string; ym: string; score: number }[] }),
    aspectList.length ? db.from('indicators').select('id, aspect_id').in('aspect_id', aspectList.map((a) => a.id)) : Promise.resolve({ data: [] as { id: string; aspect_id: string }[] }),
    nonSelfIds.length
      ? fetchAllByIds<{ assessment_id: string; indicator_id: string; rating: number | null }>(nonSelfIds, (chunk, from, to) =>
          db.from('assessment_indicator_scores').select('assessment_id, indicator_id, rating')
            .in('assessment_id', chunk).order('assessment_id').order('indicator_id').range(from, to))
      : Promise.resolve([] as { assessment_id: string; indicator_id: string; rating: number | null }[]),
  ]);

  // "KPI belum terbaca" per pegawai = Trend 'unread' (bln-1=0 & bln-2=0) atas KPI bulanan kuartal.
  // Dikecualikan dari KATEGORISASI & rerata KPI/Skor Akhir (Kompilasi & KPI) — bukan pekerja rendah,
  // melainkan data belum masuk. Tetap tampil sebagai bucket "Belum Terbaca" sendiri (dan di 360°/Tabel).
  const empYm = new Map<string, Map<string, { s: number; n: number }>>();
  (kpiRes.data ?? []).forEach((r) => {
    let m = empYm.get(r.employee_id); if (!m) { m = new Map(); empYm.set(r.employee_id, m); }
    const a = m.get(r.ym) ?? { s: 0, n: 0 }; a.s += r.score; a.n += 1; m.set(r.ym, a);
  });
  const ymFirst3 = [...ymList].sort().slice(0, 3);
  const unreadIds = new Set<string>();
  for (const [id, m] of empYm) {
    const months = ymFirst3.map((ym) => (m.has(ym) ? m.get(ym)!.s / m.get(ym)!.n : null));
    if (trendOf(months) === 'unread') unreadIds.add(id);
  }

  // Rerata KPI per pegawai + rerata KPI organisasi per bulan (untuk Analisis KPI).
  // kpiAgg dihitung untuk SEMUA (agar baris tetap punya nilai utk Tabel/bucket); rerata bulanan
  // organisasi (monthAgg) MENGECUALIKAN yang belum terbaca agar tak bias oleh 0-placeholder.
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  const monthAgg = new Map<string, { sum: number; n: number }>();
  (kpiRes.data ?? []).forEach((r) => {
    const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; kpiAgg.set(r.employee_id, a);
    if (unreadIds.has(r.employee_id)) return;
    const m = monthAgg.get(r.ym) ?? { sum: 0, n: 0 };
    m.sum += r.score; m.n += 1; monthAgg.set(r.ym, m);
  });
  const monthly = ymList
    .map((ym) => ({ ym, avg: monthAgg.has(ym) ? monthAgg.get(ym)!.sum / monthAgg.get(ym)!.n : 0 }))
    .filter((m) => m.avg > 0);

  // Heatmap Capaian KPI per Divisi × Bulan (tab Analisis Hasil KPI).
  // Agregasi rerata KPI per (divisi, bulan) dari baris kpi_scores dalam lingkup.
  const ymSorted = [...ymList].sort();
  const empDept = new Map(emps.map((e) => [e.id, e.dept]));
  const dmAgg = new Map<string, { sum: number; n: number }>(); // key `${dept}|${ym}`
  (kpiRes.data ?? []).forEach((r) => {
    if (unreadIds.has(r.employee_id)) return; // "belum terbaca" tak mewarnai heatmap divisi
    const d = empDept.get(r.employee_id);
    if (!d) return;
    const k = `${d}|${r.ym}`;
    const a = dmAgg.get(k) ?? { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; dmAgg.set(k, a);
  });
  const deptMonthly = [...new Set(emps.map((e) => e.dept))].sort()
    .map((d) => ({
      dept: d,
      cells: ymSorted.map((ym) => {
        const a = dmAgg.get(`${d}|${ym}`);
        return { ym, avg: a ? a.sum / a.n : null };
      }),
    }))
    .filter((r) => r.cells.some((c) => c.avg != null));

  // ── Tren Tahunan (lintas periode dalam tahun terpilih) ──────────────────
  // KPI per bulan (Jan–Des) + 360° per kuartal, org-level (ikut filter divisi via empIds).
  // Murni pelaporan: query lintas-periode tahun yang sama, TIDAK menyentuh lib/scoring.ts.
  const selYear = Number(String(ap.start_date).slice(0, 4)) || 0;
  const periodsInYear = periodList
    .filter((p) => Number(String(p.start_date).slice(0, 4)) === selYear)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const periodsInYearIds = periodsInYear.map((p) => p.id);
  // Paginasi (fetchAllByIds): org × 12 bulan bisa >1000 baris → tanpa ini yearMonthly & distribusi
  // per-kuartal terpotong diam-diam. employee_id disertakan agar bisa klasifikasi per-pegawai per-kuartal.
  const [yearKpiRows, year360Rows, yearPmRes] = await Promise.all([
    empIds.length
      ? fetchAllByIds<{ employee_id: string; ym: string; score: number }>(empIds, (chunk, from, to) =>
          db.from('kpi_scores').select('employee_id, ym, score').in('employee_id', chunk)
            .gte('ym', `${selYear}-01`).lte('ym', `${selYear}-12`).order('employee_id').order('ym').range(from, to))
      : Promise.resolve([] as { employee_id: string; ym: string; score: number }[]),
    empIds.length && periodsInYearIds.length
      ? fetchAllByIds<{ employee_id: string; period_id: string; score: number | null }>(empIds, (chunk, from, to) =>
          db.from('result_360').select('employee_id, period_id, score').in('employee_id', chunk)
            .in('period_id', periodsInYearIds).order('employee_id').order('period_id').range(from, to))
      : Promise.resolve([] as { employee_id: string; period_id: string; score: number | null }[]),
    periodsInYearIds.length
      ? db.from('period_months').select('period_id, ym').in('period_id', periodsInYearIds)
      : Promise.resolve({ data: [] as { period_id: string; ym: string }[] }),
  ]);
  const ymAgg = new Map<string, { sum: number; n: number }>();
  yearKpiRows.forEach((r) => {
    const a = ymAgg.get(r.ym) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n += 1; ymAgg.set(r.ym, a);
  });
  const yearMonthly = [...ymAgg.entries()]
    .map(([ym, a]) => ({ ym, avg: a.sum / a.n }))
    .sort((x, y) => x.ym.localeCompare(y.ym));
  const p360Agg = new Map<string, { sum: number; n: number }>();
  year360Rows.forEach((r) => {
    if (r.score == null) return;
    const a = p360Agg.get(r.period_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n += 1; p360Agg.set(r.period_id, a);
  });
  const year360 = periodsInYear
    .filter((p) => p360Agg.has(p.id))
    .map((p) => ({ label: p.label, avg: p360Agg.get(p.id)!.sum / p360Agg.get(p.id)!.n }));
  const yearKpiAvg = yearMonthly.length ? yearMonthly.reduce((s, m) => s + m.avg, 0) / yearMonthly.length : null;
  const year360Avg = year360.length ? year360.reduce((s, m) => s + m.avg, 0) / year360.length : null;

  // Distribusi kategori kinerja PER KUARTAL (band Skor Akhir) — untuk grafik tren komposisi.
  // Skor Akhir per pegawai per kuartal = finalScoreOf(KPI kuartal, 360° kuartal, has_360, TANPA punishment).
  const ymToPeriodY = new Map<string, string>();
  (yearPmRes.data ?? []).forEach((m) => ymToPeriodY.set(m.ym, m.period_id));
  const empPerKpiY = new Map<string, Map<string, { s: number; n: number }>>();
  yearKpiRows.forEach((r) => {
    const pid = ymToPeriodY.get(r.ym); if (!pid) return;
    let m = empPerKpiY.get(r.employee_id); if (!m) { m = new Map(); empPerKpiY.set(r.employee_id, m); }
    const a = m.get(pid) ?? { s: 0, n: 0 }; a.s += r.score; a.n += 1; m.set(pid, a);
  });
  const empPer360Y = new Map<string, Map<string, number>>();
  year360Rows.forEach((r) => {
    if (r.score == null) return;
    let m = empPer360Y.get(r.employee_id); if (!m) { m = new Map(); empPer360Y.set(r.employee_id, m); }
    m.set(r.period_id, r.score);
  });
  const quarterlyDist = periodsInYear.map((p) => {
    let exceed = 0, meet = 0, improve = 0, below = 0;
    for (const e of emps) {
      const km = empPerKpiY.get(e.id)?.get(p.id);
      const kpiAvg = km ? km.s / km.n : null;
      const s360 = empPer360Y.get(e.id)?.get(p.id) ?? null;
      const final = finalScoreOf(kpiAvg, s360, p.has_360, 0);
      if (final == null) continue;
      if (final >= 90) exceed += 1; else if (final >= 80) meet += 1; else if (final >= 70) improve += 1; else below += 1;
    }
    return { label: p.label, exceed, meet, improve, below, total: exceed + meet + improve + below };
  }).filter((q) => q.total > 0);

  // Skor 360 (hasil komputasi) + punishment.
  const s360By = new Map((r360Res.data ?? []).map((r) => [r.employee_id, r.score]));
  const penBy = new Map((penRes.data ?? []).map((p) => [p.employee_id, p.points]));

  const rows = emps.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const penalty = penBy.get(e.id) ?? 0;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penalty);
    // Single-axis: saat 360° AKTIF, pegawai yang cuma punya SATU sumbu (KPI saja ATAU 360° saja)
    // belum bisa diklasifikasi 4-Box andal — nilainya bisa "melompat" begitu sumbu kedua masuk
    // (mis. terplot B-KPI/C lalu jadi A saat 360° dihitung). Tandai agar dashboard mengeluarkannya
    // dari A/B/C & menaruhnya di bucket "Data Belum Lengkap". Saat 360° NONAKTIF tak berlaku
    // (periode itu memang tanpa sumbu budaya → tetap KPI-only, perilaku lama).
    const axisIncomplete = ap.has_360 && ((kpiAvg != null) !== (s360 != null)); // tepat satu sumbu (XOR)
    // 4-Box: butuh KEDUA sumbu saat 360° aktif; single-axis → tak diklasifikasi (null).
    const player = axisIncomplete ? null : playerClassOf(kpiAvg, ap.has_360 ? s360 : null);
    // Keanggotaan kuartal SADAR-PERIODE via irisan masa kerja × rentang periode:
    //   masuk sebelum periode berakhir  DAN  belum keluar sebelum periode mulai.
    // `left_on` diketahui → dipakai presisi; belum diisi → fallback ke is_active (aman sebelum
    // HRD melengkapi tgl keluar: nonaktif-tanpa-tgl tak keliru dianggap masih bekerja).
    const overlaps =
      (e.joined_on == null || e.joined_on <= ap.end_date) &&
      (e.left_on != null ? e.left_on >= ap.start_date : e.is_active);
    // Trend KPI 3 bulan pertama kuartal (null = bulan belum diisi, beda dari 0) → trendOf.
    const em = empYm.get(e.id);
    const kpiMonths = ymFirst3.map((ym) => (em?.has(ym) ? em.get(ym)!.s / em.get(ym)!.n : null));
    const trend = trendOf(kpiMonths);
    return { id: e.id, name: e.name, dept: e.dept, is_active: e.is_active, kpiAvg, s360, final, player, axisIncomplete, overlaps, kpiUnread: unreadIds.has(e.id), trend, kpiMonths };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1))
    // HIBRIDA: tampil bila masa kerjanya menyentuh kuartal INI (overlaps) ATAU punya data nyata
    // (KPI/360°) di kuartal ini — jaring pengaman agar angka nyata tak pernah hilang meski tgl keliru.
    .filter((r) => r.overlaps || r.kpiAvg != null || r.s360 != null);

  // Rerata KPI per departemen (untuk bar chart visual).
  const deptAgg = new Map<string, { sum: number; n: number }>();
  rows.forEach((r) => {
    if (r.kpiAvg == null || r.kpiUnread) return; // kecualikan "belum terbaca" dari rerata divisi
    const a = deptAgg.get(r.dept) ?? { sum: 0, n: 0 };
    a.sum += r.kpiAvg; a.n += 1; deptAgg.set(r.dept, a);
  });
  const deptScores: [string, number][] = [...deptAgg.entries()]
    .map(([d, a]) => [d, a.sum / a.n] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  // ── Skor 360° per ASPEK — TERBOBOT (meniru computeResult360 / weightedScore360) ──────────
  // Per penilaian: rerata rating aspek ×20 (skor 0–100) → dikelompokkan per kelas penilai
  // (Atasan/Peer/Cross/Bawahan; Self sudah dikecualikan di scoreRows) → weightedScore360 dgn
  // skema bobot aktif. Bila tak ada skema aktif → fallback rata-rata skor per-penilai (non-self).
  // Skema bobot + relasi mapping dibaca via service_role (data konfigurasi/relasi, bukan L3).
  const indToAspect = new Map((indRes.data ?? []).map((i) => [i.id, i.aspect_id]));
  const admin = createAdminClient();
  const [wsRes, mapsData] = await Promise.all([
    admin.from('weight_schemes').select('model, weights').eq('period_id', ap.id).eq('is_active', true).maybeSingle(),
    fetchAllPaged<{ assessor_id: string; target_id: string; relation: RelationKind }>((from, to) =>
      admin.from('mappings').select('assessor_id, target_id, relation').eq('period_id', ap.id)
        .order('assessor_id').order('target_id').range(from, to)),
  ]);
  const wModel = (wsRes.data?.model ?? '4class') as '4class' | '2class';
  const wVals = (wsRes.data?.weights ?? {}) as WeightValues;
  const hasWS = !!wsRes.data;
  const relByPair = new Map<string, RelationKind>();
  mapsData.forEach((m) => relByPair.set(`${m.assessor_id}:${m.target_id}`, m.relation));
  const asmtInfo = new Map((asmtRes.data ?? []).map((a) => [a.id, { assessor: a.assessor_id, target: a.target_id }]));

  // Kumpulkan rating per (penilaian, aspek) → skor per-penilai per-aspek (×20).
  const aaRatings = new Map<string, number[]>(); // `${assessmentId}|${aspectId}`
  scoreRows.forEach((s) => {
    if (s.rating == null) return;
    const aid = indToAspect.get(s.indicator_id);
    if (!aid) return;
    const k = `${s.assessment_id}|${aid}`;
    const arr = aaRatings.get(k) ?? []; arr.push(s.rating); aaRatings.set(k, arr);
  });
  const emptyG = (): Groups360 => ({ atasan: [], peer: [], cross: [], bawahan: [], self: [] });
  const aspectG = new Map<string, Groups360>();          // aspectId → grup kelas (org)
  const deptAspectG = new Map<string, Groups360>();       // `${dept}|${aspectId}` → grup kelas
  for (const [key, ratings] of aaRatings) {
    const sep = key.indexOf('|');
    const asmtId = key.slice(0, sep), aid = key.slice(sep + 1);
    const info = asmtInfo.get(asmtId);
    const m = avg360(ratings);
    if (!info || m == null) continue;
    const score100 = m * 20;
    if (score100 <= 0) continue;
    const rel: RelationKind = info.assessor === info.target ? 'Self' : (relByPair.get(`${info.assessor}:${info.target}`) ?? 'Peer');
    const cls = classOf(rel);
    let g = aspectG.get(aid); if (!g) { g = emptyG(); aspectG.set(aid, g); }
    g[cls].push(score100);
    const d = empDept.get(info.target);
    if (d) { const dk = `${d}|${aid}`; let dg = deptAspectG.get(dk); if (!dg) { dg = emptyG(); deptAspectG.set(dk, dg); } dg[cls].push(score100); }
  }
  // Skor grup: terbobot bila ada skema aktif; jika tidak → rata-rata semua skor non-self.
  const scoreOfG = (g: Groups360): number | null => {
    if (hasWS) return weightedScore360(g, wModel, wVals);
    const all = [...g.atasan, ...g.peer, ...g.cross, ...g.bawahan];
    return all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
  };

  const aspectScores = aspectList
    .map((a) => { const g = aspectG.get(a.id); const s = g ? scoreOfG(g) : null; return { aspek: a.name, score: s ?? 0 }; })
    .filter((a) => a.score > 0);

  const aspect360Names = aspectList.map((a) => a.name);
  const deptAspect360 = [...new Set(emps.map((e) => e.dept))].sort()
    .map((d) => ({
      dept: d,
      cells: aspectList.map((a) => { const g = deptAspectG.get(`${d}|${a.id}`); return { aspect: a.name, avg: g ? scoreOfG(g) : null }; }),
    }))
    .filter((r) => r.cells.some((c) => c.avg != null));

  // ── Pembanding periode SEBELUMNYA (delta naik/turun scorecard) ─────────────────
  // Periode sebelumnya = start_date terbesar yang < periode terpilih (lintas tahun boleh).
  // Rata-rata dihitung dengan logika SAMA (kecuali "belum terbaca", finalScoreOf, populasi
  // ber-Skor-Akhir) dalam lingkup divisi yang sama → delta apel-ke-apel. Bila tak ada periode
  // sebelumnya / tak ada data → null (kartu tak menampilkan delta).
  const meanN = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const prevPeriod = [...periodList]
    .filter((p) => String(p.start_date) < String(ap.start_date))
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0] ?? null;
  const prevFinalById = new Map<string, number>();
  const prevKpiById = new Map<string, number>();
  const prev360ById = new Map<string, number>();
  if (prevPeriod && empIds.length) {
    const { data: pMonths } = await db.from('period_months').select('ym').eq('period_id', prevPeriod.id);
    const pYms = (pMonths ?? []).map((m) => m.ym);
    const [pKpiRes, pr360Res, pPenRes] = await Promise.all([
      pYms.length ? db.from('kpi_scores').select('employee_id, ym, score').in('ym', pYms).in('employee_id', empIds) : Promise.resolve({ data: [] as { employee_id: string; ym: string; score: number }[] }),
      db.from('result_360').select('employee_id, score').eq('period_id', prevPeriod.id).in('employee_id', empIds),
      db.from('compliance_penalties').select('employee_id, points').eq('period_id', prevPeriod.id).in('employee_id', empIds),
    ]);
    // Rerata KPI per pegawai + deteksi "belum terbaca" (trend unread 3 bulan pertama).
    const pEmpYm = new Map<string, Map<string, { s: number; n: number }>>();
    const pKpiAgg = new Map<string, { sum: number; n: number }>();
    (pKpiRes.data ?? []).forEach((r) => {
      let m = pEmpYm.get(r.employee_id); if (!m) { m = new Map(); pEmpYm.set(r.employee_id, m); }
      const a = m.get(r.ym) ?? { s: 0, n: 0 }; a.s += r.score; a.n += 1; m.set(r.ym, a);
      const g = pKpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 }; g.sum += r.score; g.n += 1; pKpiAgg.set(r.employee_id, g);
    });
    const pYmFirst3 = [...pYms].sort().slice(0, 3);
    const pUnread = new Set<string>();
    for (const [id, m] of pEmpYm) {
      const months = pYmFirst3.map((ym) => (m.has(ym) ? m.get(ym)!.s / m.get(ym)!.n : null));
      if (trendOf(months) === 'unread') pUnread.add(id);
    }
    const p360By = new Map((pr360Res.data ?? []).map((r) => [r.employee_id, r.score]));
    const pPenBy = new Map((pPenRes.data ?? []).map((p) => [p.employee_id, p.points]));
    // Tiap rata-rata memakai POPULASI yang sama dgn kartunya masing-masing agar delta apel-ke-apel:
    //  - Skor Akhir (Kompilasi): readable (bukan unread) & final != null.
    //  - KPI (tab Analisis KPI): readable (bukan unread) & kpiAvg != null.
    //  - 360° (tab 360 Feedback): SEMUA yang punya skor 360° (tak kecualikan unread — selaras FeedbackTab).
    for (const id of empIds) {
      const agg = pKpiAgg.get(id);
      const kpiAvg = agg ? agg.sum / agg.n : null;
      const s360 = p360By.get(id) ?? null;
      const unread = pUnread.has(id);
      if (s360 != null) prev360ById.set(id, s360);
      if (!unread && kpiAvg != null) prevKpiById.set(id, kpiAvg);
      if (!unread) {
        const final = finalScoreOf(kpiAvg, s360, prevPeriod.has_360, pPenBy.get(id) ?? 0);
        if (final != null) prevFinalById.set(id, final);
      }
    }
  }
  const prevFinalAvg = prevFinalById.size ? meanN([...prevFinalById.values()]) : null;
  const prevKpiAvg = prevKpiById.size ? meanN([...prevKpiById.values()]) : null;
  const prev360Avg = prev360ById.size ? meanN([...prev360ById.values()]) : null;

  // Rincian pergerakan (efek NILAI vs KOMPOSISI): kohort = pegawai berdata di KEDUA periode
  // (perubahan nilai murni); "masuk" = baru berdata periode ini; "keluar" = tak lagi berdata.
  // Populasi tiap metrik = populasi kartunya (Skor Akhir/KPI kecualikan unread; 360° semua berdata).
  const currFinalById = new Map<string, number>();
  const currKpiById = new Map<string, number>();
  const curr360ById = new Map<string, number>();
  for (const r of rows) {
    if (!r.kpiUnread && r.final != null) currFinalById.set(r.id, r.final);
    if (!r.kpiUnread && r.kpiAvg != null) currKpiById.set(r.id, r.kpiAvg);
    if (r.s360 != null) curr360ById.set(r.id, r.s360);
  }
  const moveOf = (curr: Map<string, number>, prev: Map<string, number>): MoveBreakdown => {
    let cSum = 0, pSum = 0, n = 0;
    const join: number[] = [], leave: number[] = [];
    for (const [id, v] of curr) { const pv = prev.get(id); if (pv != null) { cSum += v; pSum += pv; n += 1; } else join.push(v); }
    for (const [id, v] of prev) { if (!curr.has(id)) leave.push(v); }
    return { cohortN: n, cohortDelta: n ? (cSum - pSum) / n : null, joinerN: join.length, joinerAvg: meanN(join), leaverN: leave.length, leaverAvg: meanN(leave) };
  };
  const finalMove = prevPeriod ? moveOf(currFinalById, prevFinalById) : null;
  const kpiMove = prevPeriod ? moveOf(currKpiById, prevKpiById) : null;
  const s360Move = prevPeriod ? moveOf(curr360ById, prev360ById) : null;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard Organisasi</h1>
          <p className="text-sm text-gray-500">
            {ap.label}{ap.status === 'active' ? ' (aktif)' : ''} · {dept === 'all' ? 'semua divisi' : `divisi ${dept}`} · {ap.has_360 ? '360° aktif (blend 50/50)' : '360° nonaktif (KPI murni)'}
          </p>
          <PagePurpose canMonitor={canMonitor} />
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <DashboardFilters
        periods={periodList.map((p) => ({
          id: p.id, label: p.label, status: p.status,
          year: Number(String(p.start_date).slice(0, 4)) || 0,
        }))}
        depts={deptList}
        currentPeriod={ap.id}
        currentDept={dept}
      />

      <div className="my-5">
        <DashboardVisual
          rows={rows.map((r) => ({
            id: r.id, name: r.name, dept: r.dept,
            kpiAvg: r.kpiAvg, s360: r.s360, final: r.final,
            player: r.player, axisIncomplete: r.axisIncomplete, isActive: r.is_active, kpiUnread: r.kpiUnread,
            trend: r.trend, kpiMonths: r.kpiMonths,
          }))}
          deptScores={deptScores}
          aspectScores={aspectScores}
          monthly={monthly}
          deptMonthly={deptMonthly}
          months={ymSorted}
          deptAspect360={deptAspect360}
          aspect360Names={aspect360Names}
          yearLabel={selYear}
          yearMonthly={yearMonthly}
          year360={year360}
          yearKpiAvg={yearKpiAvg}
          year360Avg={year360Avg}
          has360={ap.has_360}
          periodLabel={ap.label}
          kpiStandard={ap.kpi_standard}
          prevLabel={prevPeriod?.label ?? null}
          prevFinalAvg={prevFinalAvg}
          prevKpiAvg={prevKpiAvg}
          prev360Avg={prev360Avg}
          finalMove={finalMove}
          kpiMove={kpiMove}
          s360Move={s360Move}
          aggregate={false}
          quarterlyDist={quarterlyDist}
        />
      </div>
    </Shell>
  );
}

/**
 * Pembeda tujuan + tautan silang Dashboard ↔ Monitor (mengatasi tumpang-tindih peran HRD):
 * Dashboard = klasifikasi talenta & snapshot; Monitor = pergerakan & pelacakan per-pegawai.
 */
function PagePurpose({ canMonitor }: { canMonitor: boolean }) {
  return (
    <p className="text-[11px] text-gray-400 mt-1">
      <span className="font-semibold text-gray-500">Fokus halaman ini:</span> klasifikasi talenta &amp; snapshot analitik organisasi.
      {canMonitor && (
        <> · Butuh <span className="text-gray-500">pergerakan &amp; pelacakan per-pegawai lintas waktu</span>?{' '}
          <Link href="/admin/monitor" className="text-emerald-700 hover:underline font-semibold">Monitor Kinerja Pegawai →</Link></>
      )}
    </p>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
