import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { finalScoreOf } from '@/lib/scoring';
import { loadReport, loadTeamReportForSpv, loadTeamReportForHrdSpv, loadSpvReportForDireksi } from '@/lib/report';
import { ReportDoc } from '../report-doc';
import { ReportActions } from '../report-actions';
import { AspectSummaryEditor } from '../aspect-summary-editor';
import { AspectSummaryView } from '../aspect-summary-view';
import { RawFeedback } from '../raw-feedback';
import { saveQualSummaries } from '@/app/(app)/admin/laporan/actions';

// Label ringkasan pertanyaan kualitatif (dipakai editor & tampilan read-only).
const QUAL_TITLE = 'Ringkasan Umpan Balik Kualitatif 360°';
const QUAL_INTRO = 'Rangkuman kalibrasi HRD atas jawaban pertanyaan kualitatif (esai) 360° — anonim, tanpa menyebut identitas penilai.';

/**
 * Dokumen Laporan rinci satu pegawai. Tiga jalur tampilan:
 *  - SPV & HRD mode-SPV → DETAIL AGREGAT saja (L1+L2, anonim, TANPA komentar mentah),
 *    tampak hanya bila HRD sudah merilis ('in_review') / final.
 *  - HRD mode-admin → laporan penuh + panel aksi & raw feedback (anonim).
 *  - Direksi → HANYA laporan SPV (agregat L2, via Laporan Kinerja Tim); laporan non-SPV DITOLAK.
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

  // Peran subjek laporan (untuk eskalasi Direksi→SPV & pelabelan tombol HRD).
  const { data: subject } = await supabase.from('employees').select('role').eq('id', employeeId).maybeSingle();
  const subjectIsSpv = subject?.role === 'spv';

  // Direksi meninjau laporan SPV → jalur AGREGAT L2 (eskalasi Pegawai→SPV, SPV→Direksi),
  // sama seperti SPV meninjau timnya: tanpa komentar mentah, tampak setelah HRD rilis.
  // Target non-SPV → jatuh ke jalur Direksi lama (laporan penuh read-only) di bawah.
  if (role === 'direksi' && subjectIsSpv) {
    const data = await loadSpvReportForDireksi(user.id, employeeId, ap);
    if (!data) {
      return (
        <Shell>
          <Link href="/laporan-tim" className="text-xs text-gray-500 hover:underline no-print">← Laporan Kinerja Tim</Link>
          <p className="text-sm text-gray-500 mt-3">Laporan belum dirilis HRD untuk ditinjau.</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <Link href="/laporan-tim" className="text-xs text-gray-500 hover:underline no-print">← Laporan Kinerja Tim</Link>
        <div className="mt-2">
          <ReportDoc data={data} anonymize hideAssessorComments />
          {data.has360 && <AspectSummaryView summaries={data.aspectSummaries} />}
          {data.has360 && <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />}
        </div>
      </Shell>
    );
  }

  // Direksi HANYA boleh meninjau laporan SPV (lewat Laporan Kinerja Tim). Sampai di sini
  // dengan role 'direksi' berarti subjek BUKAN SPV → tolak akses (laporan pegawai non-SPV).
  if (role === 'direksi') {
    return (
      <Shell>
        <Link href="/laporan-tim" className="text-xs text-gray-500 hover:underline no-print">← Laporan Kinerja Tim</Link>
        <p className="text-sm text-gray-500 mt-3">Direksi hanya dapat meninjau laporan Supervisor (SPV).</p>
      </Shell>
    );
  }

  // Tautan kembali sadar-peran: jalur SPV ke Laporan Kinerja Tim, HRD-admin ke Daftar Laporan.
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
          {data.has360 && <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />}
        </div>
      </Shell>
    );
  }

  // Jalur HRD (mode admin): laporan penuh (tunduk RLS; raw 360° untuk HRD anonim).
  // Direksi tak sampai di sini (diblok di atas); asSpv sudah ditangani → sisanya = HRD admin.
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

  // Bulan KPI yang belum terisi (untuk konfirmasi LUNAK saat Finalisasi — pegawai baru
  // aktif sebagian periode itu sah; HRD yang memutuskan).
  let kpiTotalMonths = 0;
  let kpiMissingMonths: string[] = [];
  if (isAdmin) {
    const { data: pmonths } = await supabase.from('period_months').select('ym').eq('period_id', ap.id);
    const allMonths = (pmonths ?? []).map((m) => m.ym).sort();
    const { data: empKpi } = allMonths.length
      ? await supabase.from('kpi_scores').select('ym').eq('employee_id', employeeId).in('ym', allMonths)
      : { data: [] as { ym: string }[] };
    const have = new Set((empKpi ?? []).map((k) => k.ym));
    kpiTotalMonths = allMonths.length;
    kpiMissingMonths = allMonths.filter((m) => !have.has(m));
  }

  // isAdmin (pemegang izin HRD, bukan asSpv) → tampilan admin penuh (panel aksi + raw
  // feedback anonim). Direksi tak sampai di sini (hanya laporan SPV L2, diblok di atas).
  return (
    <Shell>
      <Link href={back.href} className="text-xs text-gray-500 hover:underline no-print">{back.label}</Link>
      <div className="mt-2">
          {/* Peringatan skor 360° basi: penilaian berubah setelah hitung ulang terakhir. */}
          {isAdmin && score360Stale && (
            <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 text-[12px] text-amber-900 no-print">
              <span aria-hidden>⚠️</span>
              <div>
                <strong>Skor 360° perlu dihitung ulang.</strong> Penyebab:
                <ul className="list-disc pl-5 mt-1 mb-1.5 space-y-0.5">
                  {staleReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                Jalankan <strong>&quot;Hitung Ulang Skor 360°&quot;</strong> (tombol di halaman{' '}
                <Link href="/admin/laporan" className="underline font-bold">Review Hasil Akhir</Link> atau{' '}
                <Link href="/admin/bobot" className="underline font-bold">Bobot &amp; Kalkulasi</Link>), lalu
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
              liveFinal={finalScoreOf(data.kpiAvg, data.s360, data.has360, data.penalty, true)}
              canCompute={data.kpiAvg != null || (data.has360 && data.s360 != null)}
              totalMonths={kpiTotalMonths}
              missingMonths={kpiMissingMonths}
              stale360={score360Stale}
              subjectIsSpv={subjectIsSpv}
            />
          )}
          {/* HRD: sembunyikan blok komentar-per-penilai (bernama) → diganti raw feedback anonim;
              tombol Unduh PDF bawaan disembunyikan karena sudah ada di panel aksi. */}
          <ReportDoc data={data} anonymize={false} hideAssessorComments={isAdmin} hidePrint={isAdmin} />
          {isAdmin && data.has360 && (
            <>
              <AspectSummaryEditor employeeId={employeeId} aspects={data.aspects.map((a) => a.name)} initial={data.aspectSummaries} locked={data.status === 'finalized'} />
              {data.qualQuestions.length > 0 && (
                <AspectSummaryEditor
                  employeeId={employeeId}
                  aspects={data.qualQuestions}
                  initial={data.qualSummaries}
                  locked={data.status === 'finalized'}
                  saveAction={saveQualSummaries}
                  title={QUAL_TITLE}
                  intro={QUAL_INTRO}
                  noun="pertanyaan"
                />
              )}
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
