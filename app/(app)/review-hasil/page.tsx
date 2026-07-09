import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { finalScoreOf } from '@/lib/scoring';
import { ReportTable, type ReportRow } from '@/app/(app)/admin/laporan/report-table';

/**
 * Review Hasil Akhir — DIREKSI (read-only, oversight eksekutif).
 * Daftar SEMUA pegawai (termasuk non-SPV & Direksi/diri sendiri). Kolom KPI · 360° · Skor Akhir ·
 * ACC · Status. Tautan "Tinjau" → detail read-only (`/review-hasil/[id]`): L2 + raw feedback anonim.
 * Data dibaca via service_role (Direksi tak menulis apa pun; tak ada Hitung Ulang/Rilis/Finalisasi).
 * Berbeda dari "Laporan Kinerja Tim" (fokus SPV + ACC). Skor mengikuti Review HRD (allow360Only).
 */
export default async function ReviewHasilDireksiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'direksi') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const admin = createAdminClient();
  const { data: ap } = await admin
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: emps } = await admin.from('employees').select('id, name, dept, is_active').eq('is_external', false);
  const employees = emps ?? [];
  const empIds = employees.map((e) => e.id);

  const { data: months } = await admin.from('period_months').select('ym').eq('period_id', ap.id);
  const yms = (months ?? []).map((m) => m.ym);
  const { data: kpiRows } = yms.length && empIds.length
    ? await admin.from('kpi_scores').select('employee_id, score').in('ym', yms).in('employee_id', empIds)
    : { data: [] as { employee_id: string; score: number }[] };
  const kpiAgg = new Map<string, { s: number; n: number }>();
  (kpiRows ?? []).forEach((r) => { const a = kpiAgg.get(r.employee_id) ?? { s: 0, n: 0 }; a.s += r.score; a.n += 1; kpiAgg.set(r.employee_id, a); });

  const { data: r360 } = await admin.from('result_360').select('employee_id, score').eq('period_id', ap.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const { data: pen } = await admin.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));
  const { data: reports } = await admin.from('final_reports').select('employee_id, status, spv_acc, final_score').eq('period_id', ap.id);
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  const rows: ReportRow[] = employees
    .filter((e) => e.is_active || kpiAgg.has(e.id) || s360By.has(e.id) || repBy.has(e.id))
    .map((e) => {
      const agg = kpiAgg.get(e.id);
      const kpiAvg = agg ? agg.s / agg.n : null;
      const s360 = s360By.get(e.id) ?? null;
      const penalty = penBy.get(e.id) ?? 0;
      const final = finalScoreOf(kpiAvg, s360, ap.has_360, penalty, true); // selaras Review HRD
      const rep = repBy.get(e.id);
      return {
        id: e.id, name: e.name, dept: e.dept,
        kpiAvg, s360, penalty, needsRecompute: false,
        totalMonths: 0, missingMonths: [],
        final, storedFinal: rep?.final_score ?? null,
        status: rep?.status ?? null, spvAcc: !!rep?.spv_acc,
        isSpvSubject: false,
        ratedDone: 0, ratedTotal: 0,
      };
    })
    .sort((a, b) => (b.final ?? -1) - (a.final ?? -1));
  const depts = [...new Set(rows.map((r) => r.dept))].sort();

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Review Hasil Akhir</h1>
          <p className="text-sm text-gray-500">
            {ap.label} · tinjauan eksekutif (read-only) hasil akhir seluruh pegawai. Kalibrasi &amp;
            finalisasi tetap wewenang HRD.
          </p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>
      <ReportTable rows={rows} depts={depts} has360={ap.has_360} hrefBase="/review-hasil" />
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
