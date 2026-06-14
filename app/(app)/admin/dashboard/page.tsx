import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  finalScoreOf, talentBoxOf, playerClassOf,
} from '@/lib/scoring';
import { DashboardVisual } from './dashboard-visual';

/**
 * Dashboard Organisasi (HRD) — versi termigrasi Supabase.
 * Gabung Rerata KPI (periode aktif) + result_360 + punishment → Skor Akhir,
 * lalu klasifikasi 9-Box & 4-Box. Dikunci ke periode aktif (KPI, 360, Skor sefase).
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd' && me?.role !== 'direksi') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk HRD / Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  // Gelombang 1 — query yang hanya butuh `ap.id` (atau tak butuh apa pun) dijalankan paralel.
  const [empRes, monthsRes, r360Res, penRes, aspectRes, asmtRes] = await Promise.all([
    supabase.from('employees').select('id, name, dept').neq('role', 'direksi'),
    supabase.from('period_months').select('ym').eq('period_id', ap.id),
    supabase.from('result_360').select('employee_id, score').eq('period_id', ap.id),
    supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id),
    supabase.from('culture_aspects').select('id, name, order_idx').eq('period_id', ap.id).order('order_idx'),
    supabase.from('assessments').select('id, assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted'),
  ]);
  const emps = empRes.data ?? [];
  const ymList = (monthsRes.data ?? []).map((m) => m.ym);
  const aspectList = aspectRes.data ?? [];
  const nonSelfIds = (asmtRes.data ?? []).filter((a) => a.assessor_id !== a.target_id).map((a) => a.id);

  // Gelombang 2 — query turunan (butuh hasil gelombang 1), saling independen → paralel.
  const [kpiRes, indRes, scoreRes] = await Promise.all([
    ymList.length ? supabase.from('kpi_scores').select('employee_id, ym, score').in('ym', ymList) : Promise.resolve({ data: [] as { employee_id: string; ym: string; score: number }[] }),
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

  // Skor 360 (hasil komputasi) + punishment.
  const s360By = new Map((r360Res.data ?? []).map((r) => [r.employee_id, r.score]));
  const penBy = new Map((penRes.data ?? []).map((p) => [p.employee_id, p.points]));

  const rows = emps.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const penalty = penBy.get(e.id) ?? 0;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penalty);
    const box = kpiAvg != null && s360 != null ? talentBoxOf(kpiAvg, s360) : null;
    const player = final != null && kpiAvg != null
      ? playerClassOf(final, kpiAvg, s360, ap.has_360) : null;
    return { id: e.id, name: e.name, dept: e.dept, kpiAvg, s360, final, box, player };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));

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
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Dashboard Organisasi</h1>
          <p className="text-sm text-gray-500">
            Periode aktif: {ap.label} · {ap.has_360 ? '360° aktif (blend 50/50)' : '360° nonaktif (KPI murni)'}
          </p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      <div className="my-5">
        <DashboardVisual
          rows={rows.map((r) => ({
            id: r.id, name: r.name, dept: r.dept,
            kpiAvg: r.kpiAvg, s360: r.s360, final: r.final,
            boxKey: r.box?.key ?? null, player: r.player,
          }))}
          deptScores={deptScores}
          aspectScores={aspectScores}
          monthly={monthly}
          has360={ap.has_360}
          periodLabel={ap.label}
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
