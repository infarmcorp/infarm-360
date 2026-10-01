import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllByIds } from '@/lib/supabase/paginate';
import { finalScoreOf, kpiAvgOf } from '@/lib/scoring';
import { ReportTable, type ReportRow } from '@/app/(app)/admin/laporan/report-table';

/**
 * Review Hasil Akhir — DIREKSI (read-only, oversight eksekutif).
 * Daftar SEMUA pegawai (termasuk non-SPV & Direksi/diri sendiri). Kolom KPI · 360° · Skor Akhir ·
 * ACC · Status. Tautan "Tinjau" → detail read-only (`/review-hasil/[id]`): L2 + raw feedback anonim.
 * Data dibaca via service_role (Direksi tak menulis apa pun; tak ada Hitung Ulang/Rilis/Finalisasi).
 * Berbeda dari "Laporan Kinerja Tim" (fokus SPV + ACC). Skor mengikuti Review HRD (rumus resmi tunggal lib/scoring).
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
  // kpi_scores semua pegawai × bulan → bisa >1000; ambil penuh (chunk id + paginasi).
  const kpiRows = yms.length && empIds.length
    ? await fetchAllByIds<{ employee_id: string; score: number }>(empIds, (chunk, from, to) =>
        admin.from('kpi_scores').select('employee_id, score').in('ym', yms).in('employee_id', chunk).order('employee_id').order('ym').range(from, to))
    : [];
  const kpiValsBy = new Map<string, number[]>();
  kpiRows.forEach((r) => kpiValsBy.set(r.employee_id, [...(kpiValsBy.get(r.employee_id) ?? []), Number(r.score)]));

  const { data: r360 } = await admin.from('result_360').select('employee_id, score, late_penalty').eq('period_id', ap.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  const lateBy = new Map((r360 ?? []).map((r) => [r.employee_id, Number(r.late_penalty ?? 0)]));
  const { data: reports } = await admin.from('final_reports').select('employee_id, status, spv_acc, final_score').eq('period_id', ap.id);
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  const rows: ReportRow[] = employees
    .filter((e) => e.is_active || kpiValsBy.has(e.id) || s360By.has(e.id) || repBy.has(e.id))
    .map((e) => {
      const kpiAvg = kpiAvgOf(kpiValsBy.get(e.id) ?? []);
      const s360 = s360By.get(e.id) ?? null;
      const final = finalScoreOf(kpiAvg, s360, ap.has_360); // rumus resmi tunggal (selaras Review HRD)
      const rep = repBy.get(e.id);
      return {
        id: e.id, name: e.name, dept: e.dept,
        kpiAvg, s360, needsRecompute: false, latePenalty: lateBy.get(e.id) ?? 0,
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
          <h1 className="text-xl font-bold text-gray-800">Tinjauan Hasil Akhir</h1>
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
