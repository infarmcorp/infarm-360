import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadReportForDireksiReview } from '@/lib/report';
import { ReportDoc } from '@/app/(app)/laporan/report-doc';
import { AspectSummaryView } from '@/app/(app)/laporan/aspect-summary-view';
import { RawFeedback } from '@/app/(app)/laporan/raw-feedback';

const QUAL_TITLE = 'Ringkasan Umpan Balik Kualitatif 360°';
const QUAL_INTRO = 'Rangkuman kalibrasi HRD atas jawaban pertanyaan kualitatif (esai) 360° — anonim, tanpa identitas penilai.';

/**
 * Detail Review Hasil Akhir — DIREKSI (read-only). L2 + raw feedback ANONIM (byAspect/essays),
 * tanpa blok per-penilai bernama (L3, dibuang di `loadReportForDireksiReview`). Tanpa panel aksi /
 * editor / Hitung Ulang / Rilis / Finalisasi — murni tinjauan. Semua status (termasuk draf).
 */
export default async function ReviewHasilDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'direksi') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const data = await loadReportForDireksiReview(user.id, employeeId, ap);
  if (!data) {
    return (
      <Shell>
        <Link href="/review-hasil" className="text-xs text-gray-500 hover:underline no-print">← Tinjauan Hasil Akhir</Link>
        <p className="text-sm text-gray-500 mt-3">Data tidak ditemukan.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link href="/review-hasil" className="text-xs text-gray-500 hover:underline no-print">← Tinjauan Hasil Akhir</Link>
      <div className="mt-2">
        {/* Anonim + sembunyikan blok per-penilai bernama (L3 sudah dibuang di loader). */}
        <ReportDoc data={data} anonymize hideAssessorComments />
        {data.has360 && <AspectSummaryView summaries={data.aspectSummaries} />}
        {data.has360 && <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />}
        {data.has360 && <RawFeedback byAspect={data.byAspect} essays={data.essays} badge="DIREKSI" />}
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
