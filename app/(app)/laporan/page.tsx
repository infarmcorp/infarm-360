import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadReport } from '@/lib/report';
import { ReportDoc } from './report-doc';
import { AspectSummaryView } from './aspect-summary-view';

/**
 * Laporan Hasil Saya (pegawai). Tampil bila HRD sudah FINALISASI (RLS fr_read:
 * employee hanya melihat laporannya yang status='finalized'). Tampilan AGREGAT (L1+L2):
 * ringkasan skor, radar aspek, dan Ringkasan Aspek HRD (anonim). Komentar mentah per
 * penilai (lapis 3) TIDAK ditampilkan — dan dibuang dari payload agar tak terkirim ke
 * klien (konsisten dgn jalur SPV `loadTeamReportForSpv`).
 */
export default async function LaporanSayaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const { data: report } = await supabase
    .from('final_reports').select('status').eq('employee_id', user.id).eq('period_id', ap.id).maybeSingle();
  if (report?.status !== 'finalized') {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-gray-800">Laporan Hasil Saya</h1>
        <p className="text-sm text-gray-500">Periode: {ap.label}</p>
        <p className="text-sm text-gray-500 mt-4">
          Laporan Anda <strong>belum difinalisasi</strong> oleh HRD. Silakan cek kembali nanti.
        </p>
      </Shell>
    );
  }

  const data = await loadReport(supabase, user.id, ap);
  if (!data) return <Shell><p className="text-sm text-gray-500">Data laporan tidak ditemukan.</p></Shell>;

  // Buang lapis 3 (komentar mentah per penilai) sebelum render — pegawai hanya melihat
  // agregat (L1+L2). Array dikosongkan agar tak ikut terserialisasi ke browser.
  const safe = { ...data, assessors: [], byAspect: [], essays: [] };

  return (
    <Shell>
      <ReportDoc data={safe} anonymize hideAssessorComments />
      {safe.has360 && <AspectSummaryView summaries={safe.aspectSummaries} />}
      {safe.has360 && (
        <AspectSummaryView
          summaries={safe.qualSummaries}
          title="Ringkasan Umpan Balik Kualitatif 360°"
          intro="Rangkuman kalibrasi HRD atas jawaban pertanyaan kualitatif (esai) 360° — anonim, tanpa identitas penilai."
        />
      )}
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
