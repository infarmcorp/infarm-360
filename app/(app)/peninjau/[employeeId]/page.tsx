import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canCrossReview } from '@/lib/auth/roles';
import { loadCrossDivisionReport } from '@/lib/report';
import { ReportDoc } from '../../laporan/report-doc';
import { AspectSummaryEditor } from '../../laporan/aspect-summary-editor';
import { RawFeedback } from '../../laporan/raw-feedback';
import { saveCrossAspectSummaries, saveCrossQualSummaries } from '../actions';

/**
 * Dokumen Laporan untuk PENINJAU HASIL LINTAS DIVISI (grant is_cross_reviewer).
 * Hanya divisi LAIN (bukan divisi peninjau). Kedalaman: L2 + komentar ANONIM
 * (radar/aspek + RawFeedback anonim), TANPA blok per-penilai bernama (L3). Peninjau
 * boleh menulis Ringkasan Aspek (saveCrossAspectSummaries), TANPA rilis/finalisasi.
 */
export default async function PeninjauDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('is_cross_reviewer').eq('id', user.id).maybeSingle();
  if (!canCrossReview(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk Peninjau Hasil Lintas Divisi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // Periode aktif via service_role (selaras jalur peninjau yang non-HRD).
  const admin = createAdminClient();
  const { data: ap } = await admin
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const data = await loadCrossDivisionReport(user.id, employeeId, ap);
  if (!data) {
    return (
      <Shell>
        <Link href="/peninjau" className="text-xs text-gray-500 hover:underline no-print">← Review Lintas Divisi</Link>
        <p className="text-sm text-gray-500 mt-3">
          Data tidak ditemukan atau di luar lingkup Anda (hanya divisi selain divisi Anda sendiri).
        </p>
      </Shell>
    );
  }

  const locked = data.status === 'finalized';

  return (
    <Shell>
      <Link href="/peninjau" className="text-xs text-gray-500 hover:underline no-print">← Review Lintas Divisi</Link>
      <div className="mt-2">
        <div className="mb-3 flex items-start gap-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-[12px] text-indigo-900 no-print">
          <span aria-hidden>ℹ️</span>
          <div>
            Anda meninjau sebagai <strong>Peninjau Lintas Divisi</strong>. Komentar ditampilkan{' '}
            <strong>anonim</strong> (tanpa nama penilai). Anda dapat menulis <strong>Ringkasan Aspek</strong>{' '}
            (tersimpan otomatis), tetapi <strong>tidak</strong> dapat merilis ke SPV atau memfinalisasi —
            itu tetap kewenangan HRD.
            {locked && <> Laporan ini sudah <strong>final</strong> sehingga ringkasan terkunci.</>}
          </div>
        </div>
        {/* Anonim + sembunyikan blok per-penilai bernama (L3 sudah dibuang di loader). */}
        <ReportDoc data={data} anonymize hideAssessorComments hidePrint />
        {data.has360 && (
          <>
            <AspectSummaryEditor
              employeeId={employeeId}
              aspects={data.aspects.map((a) => a.name)}
              initial={data.aspectSummaries}
              locked={locked}
              saveAction={saveCrossAspectSummaries}
            />
            {data.qualQuestions.length > 0 && (
              <AspectSummaryEditor
                employeeId={employeeId}
                aspects={data.qualQuestions}
                initial={data.qualSummaries}
                locked={locked}
                saveAction={saveCrossQualSummaries}
                title="Ringkasan Umpan Balik Kualitatif 360°"
                intro="Rangkuman kalibrasi atas jawaban pertanyaan kualitatif (esai) 360° — anonim, tanpa menyebut identitas penilai."
                noun="pertanyaan"
              />
            )}
            <RawFeedback byAspect={data.byAspect} essays={data.essays} badge="PENINJAU" />
          </>
        )}
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
