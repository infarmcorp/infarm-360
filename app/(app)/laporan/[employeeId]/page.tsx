import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { loadReport, loadTeamReportForSpv, loadTeamReportForHrdSpv } from '@/lib/report';
import { ReportDoc } from '../report-doc';
import { ReportActions } from '../report-actions';
import { AspectSummaryEditor } from '../aspect-summary-editor';
import { AspectSummaryView } from '../aspect-summary-view';
import { RawFeedback } from '../raw-feedback';
import { SummaryDirtyProvider } from '../summary-dirty';

/**
 * Dokumen Laporan rinci satu pegawai. Tiga jalur tampilan:
 *  - SPV & HRD mode-SPV → DETAIL AGREGAT saja (L1+L2, anonim, TANPA komentar mentah),
 *    tampak hanya bila HRD sudah merilis ('in_review') / final.
 *  - HRD mode-admin → laporan penuh + panel aksi & raw feedback (anonim).
 *  - Direksi → laporan penuh (read-only, sesuai kebijakan).
 */
export default async function LaporanDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  const role = me?.role;
  const isAdmin = canAdmin(me);
  if (!isAdmin && role !== 'direksi' && role !== 'spv') {
    return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV / HRD / Direksi.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // Mode HRD (dual-mode): HRD-posisi mode-SPV dibatasi setara SPV (tanpa raw 360°).
  // Cookie absen = base/SPV (konsisten dgn layout.tsx; login mereset ke base) → bukan hanya 'spv'.
  const jar = await cookies();
  const hrdSpvMode = role === 'hrd' && jar.get('hrd_mode')?.value !== 'admin';
  // Jalur "seperti SPV": SPV biasa ATAU HRD-posisi yang sedang bertindak sebagai SPV.
  const asSpv = role === 'spv' || hrdSpvMode;

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  // Tautan kembali sadar-peran: jalur SPV ke Laporan Kinerja Tim, HRD-admin/Direksi ke Daftar Laporan.
  const back = asSpv
    ? { href: '/laporan-tim', label: '← Laporan Kinerja Tim' }
    : { href: '/admin/laporan', label: '← Daftar Laporan' };

  // Jalur "seperti SPV" (SPV biasa + HRD mode-SPV): HANYA detail agregat (radar/aspek +
  // ringkasan aspek HRD), tanpa umpan balik mentah (lapis 3). Tampak hanya bila HRD sudah
  // merilis ('in_review') / 'finalized'. SPV → lingkup tim formal; HRD mode-SPV → sedivisi.
  if (asSpv) {
    const data = role === 'spv'
      ? await loadTeamReportForSpv(user.id, employeeId, ap)
      : await loadTeamReportForHrdSpv(user.id, employeeId, ap);
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

  // Deteksi "Skor 360° basi": skor usang bila ada perubahan SETELAH hitung ulang terakhir —
  // (a) penilaian terkirim/diubah (assessments.submitted_at > result_360.computed_at), ATAU
  // (b) KOREKSI RELASI di-ACC (reviewed_at > computed_at) yang mengubah kelas bobot. Juga basi
  // bila ada penilaian tapi result_360 belum pernah dihitung. Hanya HRD pada periode ber-360°.
  let score360Stale = false;
  const staleReasons: string[] = []; // alasan spesifik kenapa skor basi (untuk banner)
  if (isAdmin && data.has360) {
    const [r360meta, lastAsmt, lastCorr] = await Promise.all([
      supabase.from('result_360').select('computed_at').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle(),
      supabase.from('assessments').select('submitted_at').eq('target_id', employeeId).eq('period_id', ap.id)
        .eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('relation_correction_requests').select('reviewed_at').eq('target_id', employeeId).eq('period_id', ap.id)
        .eq('status', 'approved').not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const computedAt = r360meta.data?.computed_at ?? null;
    const lastSubmitted = lastAsmt.data?.submitted_at ?? null;
    const lastReviewed = lastCorr.data?.reviewed_at ?? null;
    const newerThanCompute = (ts: string | null) =>
      !!ts && (!computedAt || new Date(ts).getTime() > new Date(computedAt).getTime());
    const neverComputed = !computedAt && !!lastSubmitted;
    const staleByAssessment = newerThanCompute(lastSubmitted);
    const staleByCorrection = newerThanCompute(lastReviewed);

    if (neverComputed) {
      staleReasons.push('Skor 360° belum pernah dihitung untuk pegawai ini, padahal sudah ada penilaian yang masuk.');
    } else {
      if (staleByAssessment) staleReasons.push('Ada penilaian 360° yang dikirim atau diubah oleh penilai setelah Skor 360° terakhir dihitung.');
      if (staleByCorrection) staleReasons.push('Ada Koreksi Garis Hubungan yang disetujui (ACC) setelah Skor 360° terakhir dihitung — kelas bobot penilai berubah sehingga skor perlu dihitung ulang.');
    }
    score360Stale = staleReasons.length > 0;
  }

  // isAdmin (pemegang izin HRD, bukan asSpv & bukan direksi) → tampilan admin penuh
  // (panel aksi + raw feedback anonim). Direksi → read-only penuh.
  return (
    <Shell>
      <Link href={back.href} className="text-xs text-gray-500 hover:underline no-print">{back.label}</Link>
      {/* Provider berbagi status "ringkasan belum disimpan" antara editor & panel aksi
          (guard konfirmasi saat Rilis/Finalisasi). */}
      <SummaryDirtyProvider>
        <div className="mt-2">
          {/* Peringatan skor 360° basi: penilaian berubah setelah hitung ulang terakhir. */}
          {isAdmin && score360Stale && (
            <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 text-[12px] text-amber-900 no-print">
              <span aria-hidden>⚠️</span>
              <div>
                <strong>Skor 360° mungkin belum mutakhir.</strong> Penyebab:
                <ul className="list-disc pl-5 mt-1 mb-1.5 space-y-0.5">
                  {staleReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                Jalankan <strong>&quot;Hitung Ulang Skor 360°&quot;</strong> di halaman{' '}
                <Link href="/admin/bobot" className="underline font-bold">Bobot &amp; Kalkulasi</Link>, lalu
                Simpan Draf / Rilis / Finalisasi ulang agar Skor Akhir mencerminkan kondisi terbaru.
              </div>
            </div>
          )}
          {/* HRD: panel aksi (Unduh PDF / Simpan Draf / Rilis ke SPV / Finalisasi Hasil). */}
          {isAdmin && (
            <ReportActions
              employeeId={employeeId}
              status={data.status}
              finalScore={data.finalScore}
              canCompute={data.kpiAvg != null}
            />
          )}
          {/* HRD: sembunyikan blok komentar-per-penilai (bernama) → diganti raw feedback anonim;
              tombol Unduh PDF bawaan disembunyikan karena sudah ada di panel aksi. */}
          <ReportDoc data={data} anonymize={false} hideAssessorComments={isAdmin} hidePrint={isAdmin} />
          {isAdmin && data.has360 && (
            <>
              <AspectSummaryEditor employeeId={employeeId} aspects={data.aspects.map((a) => a.name)} initial={data.aspectSummaries} />
              <RawFeedback byAspect={data.byAspect} essays={data.essays} />
            </>
          )}
        </div>
      </SummaryDirtyProvider>
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
