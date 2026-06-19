import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadReport, loadTeamReportForSpv } from '@/lib/report';
import { ReportDoc } from '../report-doc';
import { ReportActions } from '../report-actions';
import { AspectSummaryEditor } from '../aspect-summary-editor';
import { AspectSummaryView } from '../aspect-summary-view';
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

  // Tautan kembali sadar-peran: SPV ke Laporan Kinerja Tim, HRD/Direksi ke Daftar Laporan.
  const back = role === 'spv'
    ? { href: '/laporan-tim', label: '← Laporan Kinerja Tim' }
    : { href: '/admin/laporan', label: '← Daftar Laporan' };

  // Jalur SPV: HANYA detail agregat (radar/aspek + ringkasan aspek HRD), tanpa umpan
  // balik mentah (lapis 3). Tampak hanya bila HRD sudah merilis ('in_review') atau
  // 'finalized' — lihat loadTeamReportForSpv (gating membership + status + buang raw).
  if (role === 'spv') {
    const data = await loadTeamReportForSpv(user.id, employeeId, ap);
    if (!data) {
      return (
        <Shell>
          <Link href={back.href} className="text-xs text-gray-500 hover:underline no-print">{back.label}</Link>
          <p className="text-sm text-gray-500 mt-3">
            Laporan belum dirilis HRD untuk ditinjau, atau di luar lingkup tim Anda.
          </p>
        </Shell>
      );
    }
    return (
      <Shell>
        <Link href={back.href} className="text-xs text-gray-500 hover:underline no-print">{back.label}</Link>
        <div className="mt-2">
          <ReportDoc data={data} anonymize hideAssessorComments />
          {data.has360 && <AspectSummaryView summaries={data.aspectSummaries} />}
        </div>
      </Shell>
    );
  }

  // Jalur HRD / Direksi: laporan penuh (tunduk RLS; raw 360° untuk HRD anonim).
  const data = await loadReport(supabase, employeeId, ap);
  if (!data) {
    return <Shell><p className="text-sm text-gray-500">Data tidak ditemukan atau di luar lingkup akses Anda.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const isHrd = role === 'hrd';
  return (
    <Shell>
      <Link href={back.href} className="text-xs text-gray-500 hover:underline no-print">{back.label}</Link>
      <div className="mt-2">
        {/* HRD: panel aksi (Unduh PDF / Simpan Draf / Rilis ke SPV / Finalisasi Hasil). */}
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
