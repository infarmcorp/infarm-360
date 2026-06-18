import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadReport } from '@/lib/report';
import { ReportDoc } from '../report-doc';
import { ReportActions } from '../report-actions';
import { AspectSummaryEditor } from '../aspect-summary-editor';
import { RawFeedback } from '../raw-feedback';

/**
 * Dokumen Laporan rinci satu pegawai — untuk HRD/Direksi (semua) & SPV (tim, RLS
 * is_my_member). Nama penilai DITAMPILKAN (bukan anonim). Data tunduk RLS pemanggil.
 */
export default async function LaporanDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  const role = me?.role;
  if (role !== 'hrd' && role !== 'direksi' && role !== 'spv') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV / HRD / Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  const data = await loadReport(supabase, employeeId, ap);
  if (!data) {
    return <Shell><p className="text-sm text-gray-500">Data tidak ditemukan atau di luar lingkup akses Anda.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const isHrd = role === 'hrd';
  return (
    <Shell>
      <Link href="/admin/laporan" className="text-xs text-gray-500 hover:underline no-print">← Daftar Laporan</Link>
      <div className="mt-2">
        {/* HRD: panel aksi (Unduh PDF / Simpan Draf / Finalisasi Hasil) di atas dokumen. */}
        {isHrd && (
          <ReportActions
            employeeId={employeeId}
            status={data.status}
            finalScore={data.finalScore}
            canCompute={data.kpiAvg != null}
          />
        )}
        {/* HRD: sembunyikan blok komentar-per-penilai (bernama) → diganti raw feedback anonim;
            tombol Unduh PDF bawaan disembunyikan karena sudah ada di panel aksi. */}
        <ReportDoc data={data} anonymize={false} hideAssessorComments={isHrd} hidePrint={isHrd} />
        {isHrd && data.has360 && (
          <>
            <AspectSummaryEditor employeeId={employeeId} aspects={data.aspects.map((a) => a.name)} initial={data.aspectSummaries} />
            <RawFeedback byAspect={data.byAspect} essays={data.essays} />
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
