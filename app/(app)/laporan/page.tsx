import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadReport } from '@/lib/report';
import { ReportDoc } from './report-doc';

/**
 * Laporan Hasil Saya (pegawai). Tampil bila HRD sudah FINALISASI (RLS fr_read:
 * employee hanya melihat laporannya yang status='finalized'). Dokumen rinci: radar
 * aspek, ringkasan skor, komentar mentah (nama penilai DIANONIMKAN untuk pegawai).
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

  return <Shell><ReportDoc data={data} anonymize /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
