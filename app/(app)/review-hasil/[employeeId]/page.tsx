import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadReportForDireksiReview } from '@/lib/report';
import { ReportDoc } from '@/app/(app)/laporan/report-doc';
import { AspectSummaryView } from '@/app/(app)/laporan/aspect-summary-view';
import { RawFeedback } from '@/app/(app)/laporan/raw-feedback';
import { ArrowLeft } from 'lucide-react';
import { CARD } from '@/components/infarm-ui';
import { INFARM_PAGE } from '@/app/infarm-fonts';

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
    return <Shell><p className={MSG}>Halaman ini untuk Direksi.</p></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className={MSG}>Tidak ada periode aktif.</p></Shell>;

  const data = await loadReportForDireksiReview(user.id, employeeId, ap);
  if (!data) {
    return (
      <Shell>
        <BackLink href="/review-hasil">Tinjauan Hasil Akhir</BackLink>
        <p className={MSG}>Data tidak ditemukan.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <BackLink href="/review-hasil">Tinjauan Hasil Akhir</BackLink>
      <div>
        {/* Anonim + sembunyikan blok per-penilai bernama (L3 sudah dibuang di loader). */}
        <ReportDoc data={data} anonymize hideAssessorComments />
        {data.has360 && <AspectSummaryView summaries={data.aspectSummaries} />}
        {data.has360 && <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />}
        {data.has360 && <RawFeedback byAspect={data.byAspect} essays={data.essays} badge="DIREKSI" />}
      </div>
    </Shell>
  );
}

// Pesan status = kartu putih Design System Infarm.
const MSG = `${CARD} text-[13px] text-ink-soft`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Kanvas Design System Infarm (pola detail laporan /laporan/[employeeId]); cetak = latar putih.
    <main className={`${INFARM_PAGE} w-full min-h-full px-5 py-7 lg:px-7 print:bg-white print:p-0`}>
      <div>{children}</div>
    </main>
  );
}

/** Tautan kembali ke daftar (tak ikut dicetak). */
function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="no-print mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-brand">
      <ArrowLeft className="w-4 h-4" aria-hidden /> {children}
    </Link>
  );
}
