import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin, canCoordinate, canSection, grantedAccess, employeeInScopes } from '@/lib/auth/roles';
import { finalScoreOf } from '@/lib/scoring';
import { loadReport, loadTeamReportForSpv, loadTeamReportForHrdSpv, loadTeamReportForCoordinator, loadSpvReportForDireksi, isDireksiReviewSubject } from '@/lib/report';
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
 *
 * PERIODE (2026-08): `?period=<id>` membuka laporan KUARTAL LAMPAU (dipakai filter periode di
 * Laporan Kinerja Tim). Default tetap periode aktif. Periode non-aktif = LIHAT-SAJA: panel aksi
 * (finalisasi/rilis) & editor ringkasan disembunyikan — Server Action-nya memang menolak periode
 * tak aktif, jadi menampilkan tombolnya hanya akan berujung error.
 */
export default async function LaporanDetailPage({
  params, searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { employeeId } = await params;
  const { period: periodParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, is_coordinator, hrd_sections, dept').eq('id', user.id).maybeSingle();
  const role = me?.role;
  const isAdmin = canAdmin(me);
  const isCoordinator = canCoordinate(me);
  // Pemegang grant "Review & Finalisasi" (Manajemen Akses) juga boleh membuka detail dalam lingkupnya
  // (dicek di cabang grant di bawah). Tanpa itu, gate kasar tetap: SPV / HRD / Direksi / Koordinator.
  // SADAR-MODE: HRD "penuh" HANYA di Mode Admin; di Mode-SPV, akses detail lewat grant (bila ada).
  const jarEarly = await cookies();
  const hrdModeEarly = jarEarly.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const isHrdFull = canSection(me, 'laporan') && hrdModeEarly === 'admin';
  let reviewGrant: { scopes: import('@/lib/auth/roles').PageScope[]; canEdit: boolean; canFinalize: boolean } | null = null;
  if (!isHrdFull) {
    const { data: grantRows } = await supabase.from('page_grants').select('section, scope, scopes, can_edit, can_finalize').eq('employee_id', user.id);
    reviewGrant = grantedAccess(grantRows, 'review');
  }
  if (!isAdmin && role !== 'direksi' && role !== 'spv' && !isCoordinator && !reviewGrant) {
    return <Shell><p className="text-sm text-ink-soft">Halaman ini untuk SPV / HRD / Direksi.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // Mode HRD (dual-mode): HRD-posisi mode-SPV dibatasi setara SPV (tanpa raw 360°).
  // Cookie absen = base/SPV (konsisten dgn layout.tsx; login mereset ke base) → bukan hanya 'spv'.
  const jar = await cookies();
  const hrdSpvMode = role === 'hrd' && jar.get('hrd_mode')?.value !== 'admin';
  // Jalur "seperti SPV": SPV biasa ATAU HRD-posisi yang sedang bertindak sebagai SPV.
  const asSpv = role === 'spv' || hrdSpvMode;

  // Periode: `?period=` bila dikenal, selain itu periode AKTIF. Id tak dikenal diabaikan
  // (tak boleh memaksa halaman membaca periode yang tak ada).
  const { data: periodRows } = await supabase
    .from('periods').select('id, label, has_360, status').order('start_date', { ascending: false });
  const allPeriods = periodRows ?? [];
  const ap = (periodParam ? allPeriods.find((p) => p.id === periodParam) : undefined)
    ?? allPeriods.find((p) => p.status === 'active')
    ?? null;
  if (!ap) return <Shell><p className="text-sm text-ink-soft">Belum ada periode penilaian.</p></Shell>;
  // Periode lampau → seluruh jalur tulis (finalisasi/rilis/ringkasan) ditutup di UI.
  const periodActive = ap.status === 'active';

  // Apakah subjek = SPV/pemimpin tim (untuk eskalasi Direksi→SPV & pelabelan tombol HRD).
  const subjectIsSpv = await isDireksiReviewSubject(employeeId);

  // ── Jalur GRANT "Review & Finalisasi" (Manajemen Akses, Tahap 2) ─────────────────────────────
  // Pemegang grant 'review' (non-HRD-penuh) membuka detail pegawai DALAM LINGKUP-nya. Diprioritaskan
  // di atas cabang peran (Direksi/Koordinator/SPV) — grant eksplisit & berlingkup. Baca via
  // service_role (pemegang bukan is_hrd() → RLS memblokir). Umpan balik tetap ANONIM (L3 bernama
  // sudah dibuang loadReport). READ-ONLY bila can_edit=false; panel aksi & editor hanya bila boleh-edit.
  if (!isHrdFull && reviewGrant) {
    const admin = createAdminClient();
    const { data: tgt } = await admin.from('employees').select('dept').eq('id', employeeId).maybeSingle();
    // Tim naungan (hanya bila lingkup 'coordinator_team'): id anggota tim pemegang grant.
    const teamIds = reviewGrant.scopes.includes('coordinator_team')
      ? new Set(((await admin.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id)).data ?? []).map((r) => r.employee_id))
      : undefined;
    // Target harus masuk SALAH SATU lingkup grant (employeeInScopes; 'self'/'coordinator_team' = per-ID).
    const inScope = !!tgt && employeeInScopes(reviewGrant.scopes, me?.dept ?? '', user.id, { id: employeeId, dept: tgt.dept ?? null }, teamIds);
    if (!inScope) {
      return <Shell>
        <Link href="/admin/laporan" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Review & Finalisasi</Link>
        <p className="text-sm text-ink-soft mt-3">Pegawai ini di luar lingkup akses yang diberikan kepada Anda.</p>
      </Shell>;
    }
    const data = await loadReport(admin, employeeId, ap);
    if (!data) {
      return <Shell>
        <Link href="/admin/laporan" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Review & Finalisasi</Link>
        <p className="text-sm text-ink-soft mt-3">Data tidak ditemukan.</p>
      </Shell>;
    }
    // Periode lampau → turunkan ke lihat-saja, apa pun tingkat izin grant-nya.
    const canEditReport = reviewGrant.canEdit && periodActive;       // Meringkas+ → boleh tulis Ringkasan Aspek
    const canFinalizeReport = reviewGrant.canFinalize && periodActive; // Finalisasi → boleh panel aksi (finalisasi/rilis)
    const locked = data.status === 'finalized' || !canEditReport;

    // Untuk panel aksi (hanya saat boleh FINALISASI): deteksi Skor 360° basi + bulan KPI belum terisi.
    let gStale = false;
    let gTotalMonths = 0;
    let gMissingMonths: string[] = [];
    if (canFinalizeReport) {
      const [r360meta, lastAsmt, lastCorr, pmonthsRes] = await Promise.all([
        admin.from('result_360').select('computed_at').eq('employee_id', employeeId).eq('period_id', ap.id).maybeSingle(),
        admin.from('assessments').select('submitted_at').eq('target_id', employeeId).eq('period_id', ap.id)
          .eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
        admin.from('relation_correction_requests').select('reviewed_at').eq('target_id', employeeId).eq('period_id', ap.id)
          .eq('status', 'approved').not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(1).maybeSingle(),
        admin.from('period_months').select('ym').eq('period_id', ap.id),
      ]);
      if (data.has360) {
        const computedAt = r360meta.data?.computed_at ?? null;
        const newer = (ts: string | null) => !!ts && (!computedAt || new Date(ts).getTime() > new Date(computedAt).getTime());
        gStale = (!computedAt && !!lastAsmt.data?.submitted_at) || newer(lastAsmt.data?.submitted_at ?? null) || newer(lastCorr.data?.reviewed_at ?? null);
      }
      const allMonths = (pmonthsRes.data ?? []).map((m) => m.ym).sort();
      const { data: empKpi } = allMonths.length
        ? await admin.from('kpi_scores').select('ym').eq('employee_id', employeeId).in('ym', allMonths)
        : { data: [] as { ym: string }[] };
      const have = new Set((empKpi ?? []).map((k) => k.ym));
      gTotalMonths = allMonths.length;
      gMissingMonths = allMonths.filter((m) => !have.has(m));
    }

    return (
      <Shell>
        <Link href="/admin/laporan" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Review & Finalisasi</Link>
        <div className="mt-2">
          {!canEditReport && (
            <div className="mb-3 text-[11px] text-ink-soft bg-neutral-tint border border-line rounded-control px-3 py-2 no-print">
              Tampilan <strong>lihat-saja</strong> — akses dari HRD (lingkup terbatas). Perubahan laporan hanya oleh yang berwenang.
            </div>
          )}
          {canEditReport && !canFinalizeReport && (
            <div className="mb-3 text-[11px] text-warn-ink bg-warn-tint border border-warn-ink/25 rounded-control px-3 py-2 no-print">
              Akses <strong>meringkas</strong> — Anda dapat menulis <strong>Ringkasan Aspek</strong>. Finalisasi &amp; kalibrasi skor tetap wewenang HRD.
            </div>
          )}
          {canFinalizeReport && (
            <ReportActions
              employeeId={employeeId}
              status={data.status}
              finalScore={data.finalScore}
              liveFinal={finalScoreOf(data.kpiAvg, data.s360, data.has360, data.penalty)}
              canCompute={data.kpiAvg != null || (data.has360 && data.s360 != null)}
              totalMonths={gTotalMonths}
              missingMonths={gMissingMonths}
              stale360={gStale}
              subjectIsSpv={subjectIsSpv}
            />
          )}
          <ReportDoc data={data} anonymize hideAssessorComments />
          {data.has360 && (canEditReport ? (
            <>
              <AspectSummaryEditor employeeId={employeeId} aspects={data.aspects.map((a) => a.name)} initial={data.aspectSummaries} locked={locked} />
              {data.qualQuestions.length > 0 && (
                <AspectSummaryEditor
                  employeeId={employeeId}
                  aspects={data.qualQuestions}
                  initial={data.qualSummaries}
                  locked={locked}
                  saveAction={saveQualSummaries}
                  title={QUAL_TITLE}
                  intro={QUAL_INTRO}
                  noun="pertanyaan"
                />
              )}
            </>
          ) : (
            <>
              <AspectSummaryView summaries={data.aspectSummaries} />
              <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />
            </>
          ))}
          {data.has360 && <RawFeedback byAspect={data.byAspect} essays={data.essays} badge="AKSES HRD" />}
        </div>
      </Shell>
    );
  }

  // Direksi meninjau laporan SPV → jalur AGREGAT L2 (eskalasi Pegawai→SPV, SPV→Direksi),
  // sama seperti SPV meninjau timnya: tanpa komentar mentah, tampak setelah HRD rilis.
  // Target non-SPV → jatuh ke jalur Direksi lama (laporan penuh read-only) di bawah.
  if (role === 'direksi' && subjectIsSpv) {
    const data = await loadSpvReportForDireksi(user.id, employeeId, ap);
    if (!data) {
      return (
        <Shell>
          <Link href="/laporan-tim" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Laporan Kinerja Tim</Link>
          <p className="text-sm text-ink-soft mt-3">Laporan belum dirilis HRD untuk ditinjau.</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <Link href="/laporan-tim" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Laporan Kinerja Tim</Link>
        <div className="mt-2">
          <ReportDoc data={data} anonymize hideAssessorComments />
          {data.has360 && <AspectSummaryView summaries={data.aspectSummaries} />}
          {data.has360 && <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />}
          {data.has360 && <RawFeedback byAspect={data.byAspect} essays={data.essays} badge="DIREKSI" />}
        </div>
      </Shell>
    );
  }

  // Direksi HANYA boleh meninjau laporan SPV (lewat Laporan Kinerja Tim). Sampai di sini
  // dengan role 'direksi' berarti subjek BUKAN SPV → tolak akses (laporan pegawai non-SPV).
  if (role === 'direksi') {
    return (
      <Shell>
        <Link href="/laporan-tim" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Laporan Kinerja Tim</Link>
        <p className="text-sm text-ink-soft mt-3">Direksi hanya dapat meninjau laporan Supervisor (SPV).</p>
      </Shell>
    );
  }

  // Jalur KOORDINATOR (grant is_coordinator, role bukan SPV/HRD/Direksi): detail agregat L2
  // (radar/aspek + ringkasan), TANPA umpan balik mentah (L3), hanya bila HRD sudah merilis &
  // pegawai ada di tim koordinasinya. Baca via service_role berlingkup (loadTeamReportForCoordinator).
  if (isCoordinator && !isAdmin && role !== 'spv') {
    const data = await loadTeamReportForCoordinator(user.id, employeeId, ap);
    if (!data) {
      return (
        <Shell>
          <Link href="/laporan-tim" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Laporan Kinerja Tim</Link>
          <p className="text-sm text-ink-soft mt-3">
            Laporan belum dirilis HRD untuk ditinjau, atau di luar lingkup tim koordinasi Anda.
          </p>
        </Shell>
      );
    }
    return (
      <Shell>
        <Link href="/laporan-tim" className="text-xs text-ink-faint hover:text-ink-soft no-print">← Laporan Kinerja Tim</Link>
        <div className="mt-2">
          <ReportDoc data={data} anonymize hideAssessorComments />
          {data.has360 && <AspectSummaryView summaries={data.aspectSummaries} />}
          {data.has360 && <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />}
          {data.has360 && <RawFeedback byAspect={data.byAspect} essays={data.essays} badge="KOORDINATOR" />}
        </div>
      </Shell>
    );
  }

  // Tautan kembali sadar-peran: jalur SPV ke Laporan Kinerja Tim, HRD-admin ke Daftar Laporan.
  // Periode ikut dibawa agar kembali ke kuartal yang sedang ditinjau, bukan lompat ke periode aktif.
  const backQS = periodActive ? '' : `?period=${ap.id}`;
  const back = asSpv
    ? { href: `/laporan-tim${backQS}`, label: '← Laporan Kinerja Tim' }
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
          <Link href={back.href} className="text-xs text-ink-faint hover:text-ink-soft no-print">{back.label}</Link>
          <p className="text-sm text-ink-soft mt-3">
            Laporan belum dirilis HRD untuk ditinjau, atau di luar lingkup tim Anda.
          </p>
        </Shell>
      );
    }
    return (
      <Shell>
        <Link href={back.href} className="text-xs text-ink-faint hover:text-ink-soft no-print">{back.label}</Link>
        <div className="mt-2">
          <ReportDoc data={data} anonymize hideAssessorComments />
          {data.has360 && <AspectSummaryView summaries={data.aspectSummaries} />}
          {data.has360 && <AspectSummaryView summaries={data.qualSummaries} title={QUAL_TITLE} intro={QUAL_INTRO} />}
          {data.has360 && <RawFeedback byAspect={data.byAspect} essays={data.essays} badge={role === 'spv' ? 'SPV' : 'HRD (MODE SPV)'} />}
        </div>
      </Shell>
    );
  }

  // Jalur HRD (mode admin): laporan penuh (tunduk RLS; raw 360° untuk HRD anonim).
  // Direksi tak sampai di sini (diblok di atas); asSpv sudah ditangani → sisanya = HRD admin.
  const data = await loadReport(supabase, employeeId, ap);
  if (!data) {
    return <Shell><p className="text-sm text-ink-soft">Data tidak ditemukan atau di luar lingkup akses Anda.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
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
      <Link href={back.href} className="text-xs text-ink-faint hover:text-ink-soft no-print">{back.label}</Link>
      <div className="mt-2">
          {/* Peringatan skor 360° basi: penilaian berubah setelah hitung ulang terakhir. */}
          {isAdmin && score360Stale && (
            <div className="mb-3 flex items-start gap-2 bg-warn-tint border border-warn-ink/30 rounded-panel p-3 text-[12px] text-warn-ink no-print">
              <span aria-hidden>⚠️</span>
              <div>
                <strong>Skor 360° perlu dihitung ulang.</strong> Penyebab:
                <ul className="list-disc pl-5 mt-1 mb-1.5 space-y-0.5">
                  {staleReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                Jalankan <strong>&quot;Hitung Ulang Skor 360°&quot;</strong> (tombol di halaman{' '}
                <Link href="/admin/laporan" className="underline font-bold">Review & Finalisasi</Link> atau{' '}
                <Link href="/admin/bobot" className="underline font-bold">Bobot &amp; Kalkulasi</Link>), lalu
                Simpan Draf / Rilis / Finalisasi ulang agar Skor Akhir mencerminkan kondisi terbaru.
              </div>
            </div>
          )}
          {/* Penanda periode lampau — menjelaskan hilangnya panel aksi & editor. */}
          {!periodActive && (
            <p className="mb-3 rounded-control border border-warn-ink/25 bg-warn-tint px-3 py-2 text-[12px] text-warn-ink no-print">
              Laporan periode <strong>{ap.label}</strong> (sudah tidak aktif) — ditampilkan untuk ditinjau, tanpa perubahan.
            </p>
          )}
          {/* HRD: panel aksi (Unduh PDF / Simpan Draf / Rilis ke SPV / Finalisasi Hasil).
              Hanya di periode AKTIF — Server Action-nya menolak periode tak aktif. */}
          {isAdmin && periodActive && (
            <ReportActions
              employeeId={employeeId}
              status={data.status}
              finalScore={data.finalScore}
              liveFinal={finalScoreOf(data.kpiAvg, data.s360, data.has360, data.penalty)}
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
              <AspectSummaryEditor employeeId={employeeId} aspects={data.aspects.map((a) => a.name)} initial={data.aspectSummaries} locked={data.status === 'finalized' || !periodActive} />
              {data.qualQuestions.length > 0 && (
                <AspectSummaryEditor
                  employeeId={employeeId}
                  aspects={data.qualQuestions}
                  initial={data.qualSummaries}
                  locked={data.status === 'finalized' || !periodActive}
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
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <div className="bg-surface border border-line rounded-panel p-5">{children}</div>
    </main>
  );
}
