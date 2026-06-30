import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import {
  finalScoreOf, playerClassOf,
} from '@/lib/scoring';
import { DashboardVisual } from './dashboard-visual';
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
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me) && me?.role !== 'direksi') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk HRD / Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // Daftar periode + periode terpilih (param → aktif → terbaru).
  const { data: periodRows } = await supabase
    .from('periods').select('id, label, has_360, status, kpi_standard, start_date').order('label', { ascending: false });
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
  // Pelaporan: ambil TANPA filter is_active; nonaktif disaring belakangan kecuali punya data
  // di periode (KPI/360°) → hasil kuartal pegawai yang resign di akhir periode tetap tampil.
  const { data: allEmpRows } = await supabase.from('employees').select('id, name, dept, is_active').neq('role', 'direksi').eq('is_external', false);
  const allEmps = allEmpRows ?? [];
  const deptList = [...new Set(allEmps.map((e) => e.dept))].sort();
  const dept = deptParam && deptParam !== 'all' && deptList.includes(deptParam) ? deptParam : 'all';
  const emps = dept === 'all' ? allEmps : allEmps.filter((e) => e.dept === dept);
  const empIds = emps.map((e) => e.id);
  const inScope = (id: string) => empIds.includes(id);

  // Gelombang 1 — query periode terpilih, di-scope ke pegawai dalam lingkup divisi.
  const [monthsRes, r360Res, penRes, aspectRes, asmtRes] = await Promise.all([
    supabase.from('period_months').select('ym').eq('period_id', ap.id),
    supabase.from('result_360').select('employee_id, score').eq('period_id', ap.id),
    supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id),
    supabase.from('culture_aspects').select('id, name, order_idx').eq('period_id', ap.id).order('order_idx'),
    supabase.from('assessments').select('id, assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted'),
  ]);
  const ymList = (monthsRes.data ?? []).map((m) => m.ym);
  const aspectList = aspectRes.data ?? [];
  // Aspek 360° hanya dari penilaian terhadap target dalam lingkup (non-Self).
  const nonSelfIds = (asmtRes.data ?? [])
    .filter((a) => a.assessor_id !== a.target_id && inScope(a.target_id)).map((a) => a.id);

  // Gelombang 2 — query turunan (butuh hasil gelombang 1), saling independen → paralel.
  const [kpiRes, indRes, scoreRes] = await Promise.all([
    ymList.length && empIds.length ? supabase.from('kpi_scores').select('employee_id, ym, score').in('ym', ymList).in('employee_id', empIds) : Promise.resolve({ data: [] as { employee_id: string; ym: string; score: number }[] }),
    aspectList.length ? supabase.from('indicators').select('id, aspect_id').in('aspect_id', aspectList.map((a) => a.id)) : Promise.resolve({ data: [] as { id: string; aspect_id: string }[] }),
    nonSelfIds.length ? supabase.from('assessment_indicator_scores').select('indicator_id, rating').in('assessment_id', nonSelfIds) : Promise.resolve({ data: [] as { indicator_id: string; rating: number | null }[] }),
  ]);

  // Rerata KPI per pegawai + rerata KPI organisasi per bulan (untuk Analisis KPI).
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  const monthAgg = new Map<string, { sum: number; n: number }>();
  (kpiRes.data ?? []).forEach((r) => {
    const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; kpiAgg.set(r.employee_id, a);
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
  const [yearKpiRes, year360Res] = await Promise.all([
    empIds.length
      ? supabase.from('kpi_scores').select('ym, score').in('employee_id', empIds).gte('ym', `${selYear}-01`).lte('ym', `${selYear}-12`)
      : Promise.resolve({ data: [] as { ym: string; score: number }[] }),
    empIds.length && periodsInYearIds.length
      ? supabase.from('result_360').select('period_id, score').in('employee_id', empIds).in('period_id', periodsInYearIds)
      : Promise.resolve({ data: [] as { period_id: string; score: number }[] }),
  ]);
  const ymAgg = new Map<string, { sum: number; n: number }>();
  (yearKpiRes.data ?? []).forEach((r) => {
    const a = ymAgg.get(r.ym) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n += 1; ymAgg.set(r.ym, a);
  });
  const yearMonthly = [...ymAgg.entries()]
    .map(([ym, a]) => ({ ym, avg: a.sum / a.n }))
    .sort((x, y) => x.ym.localeCompare(y.ym));
  const p360Agg = new Map<string, { sum: number; n: number }>();
  (year360Res.data ?? []).forEach((r) => {
    if (r.score == null) return;
    const a = p360Agg.get(r.period_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n += 1; p360Agg.set(r.period_id, a);
  });
  const year360 = periodsInYear
    .filter((p) => p360Agg.has(p.id))
    .map((p) => ({ label: p.label, avg: p360Agg.get(p.id)!.sum / p360Agg.get(p.id)!.n }));
  const yearKpiAvg = yearMonthly.length ? yearMonthly.reduce((s, m) => s + m.avg, 0) / yearMonthly.length : null;
  const year360Avg = year360.length ? year360.reduce((s, m) => s + m.avg, 0) / year360.length : null;

  // Skor 360 (hasil komputasi) + punishment.
  const s360By = new Map((r360Res.data ?? []).map((r) => [r.employee_id, r.score]));
  const penBy = new Map((penRes.data ?? []).map((p) => [p.employee_id, p.points]));

  const rows = emps.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const penalty = penBy.get(e.id) ?? 0;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penalty);
    // 4-Box: berbasis KPI × 360° langsung (360 nonaktif → tanpa sumbu budaya).
    const player = playerClassOf(kpiAvg, ap.has_360 ? s360 : null);
    return { id: e.id, name: e.name, dept: e.dept, is_active: e.is_active, kpiAvg, s360, final, player };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1))
    // Tampilkan yang AKTIF atau PUNYA DATA di periode (KPI/360°); nonaktif tanpa data disembunyikan.
    .filter((r) => r.is_active || r.kpiAvg != null || r.s360 != null);

  // Rerata KPI per departemen (untuk bar chart visual).
  const deptAgg = new Map<string, { sum: number; n: number }>();
  rows.forEach((r) => {
    if (r.kpiAvg == null) return;
    const a = deptAgg.get(r.dept) ?? { sum: 0, n: 0 };
    a.sum += r.kpiAvg; a.n += 1; deptAgg.set(r.dept, a);
  });
  const deptScores: [string, number][] = [...deptAgg.entries()]
    .map(([d, a]) => [d, a.sum / a.n] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  // Rataan sub-aspek 360° (rating ×20), dari penilaian terkirim periode aktif, Self dikecualikan.
  const indToAspect = new Map((indRes.data ?? []).map((i) => [i.id, i.aspect_id]));
  const aspAgg = new Map<string, { sum: number; n: number }>();
  (scoreRes.data ?? []).forEach((s) => {
    const aid = indToAspect.get(s.indicator_id);
    if (!aid || s.rating == null) return;
    const a = aspAgg.get(aid) ?? { sum: 0, n: 0 };
    a.sum += s.rating; a.n += 1; aspAgg.set(aid, a);
  });
  const aspectScores = aspectList
    .map((a) => ({ aspek: a.name, score: aspAgg.has(a.id) ? (aspAgg.get(a.id)!.sum / aspAgg.get(a.id)!.n) * 20 : 0 }))
    .filter((a) => a.score > 0);

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard Organisasi</h1>
          <p className="text-sm text-gray-500">
            {ap.label}{ap.status === 'active' ? ' (aktif)' : ''} · {dept === 'all' ? 'semua divisi' : `divisi ${dept}`} · {ap.has_360 ? '360° aktif (blend 50/50)' : '360° nonaktif (KPI murni)'}
          </p>
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
            player: r.player, isActive: r.is_active,
          }))}
          deptScores={deptScores}
          aspectScores={aspectScores}
          monthly={monthly}
          deptMonthly={deptMonthly}
          months={ymSorted}
          yearLabel={selYear}
          yearMonthly={yearMonthly}
          year360={year360}
          yearKpiAvg={yearKpiAvg}
          year360Avg={year360Avg}
          has360={ap.has_360}
          periodLabel={ap.label}
          kpiStandard={ap.kpi_standard}
        />
      </div>
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
