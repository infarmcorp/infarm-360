import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { finalScoreOf } from '@/lib/scoring';
import { ReportTable, type ReportRow } from './report-table';
import { Recompute360Button } from './recompute-360-button';
import { BulkFinalizeButton } from './bulk-finalize-button';

/**
 * Review Hasil Akhir (HRD): hitung Skor Akhir tiap pegawai, lihat ACC SPV & status,
 * lalu Simpan Draf / Finalisasi. Finalisasi → pegawai dapat melihat di Laporan Hasil Saya.
 */
export default async function AdminLaporanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  // Pelaporan: ambil TANPA filter is_active; nonaktif disaring belakangan kecuali punya data
  // periode (KPI/360°/laporan) → pegawai yang resign di akhir periode tetap bisa difinalisasi.
  // Direksi SENGAJA IKUT di sini (subjek 360° — keputusan 2026-07-08): mereka tak punya KPI,
  // jadi hanya tampil bila punya skor 360° (disaring `shownRows` di bawah). Ini KHUSUS halaman
  // Review Hasil Akhir — Dashboard/KPI/kepatuhan tetap mengecualikan Direksi.
  const { data: emps } = await supabase.from('employees').select('id, name, dept, is_active, role').eq('is_external', false);
  const employees = emps ?? [];

  const { data: months } = await supabase.from('period_months').select('ym').eq('period_id', ap.id);
  const yms = (months ?? []).map((m) => m.ym);
  const sortedMonths = [...yms].sort();
  const { data: kpiRows } = yms.length
    ? await supabase.from('kpi_scores').select('employee_id, score, ym').in('ym', yms) : { data: [] };
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  const kpiMonthsByEmp = new Map<string, Set<string>>(); // bulan yang sudah ada KPI per pegawai
  (kpiRows ?? []).forEach((r) => {
    const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n++; kpiAgg.set(r.employee_id, a);
    const s = kpiMonthsByEmp.get(r.employee_id) ?? new Set<string>(); s.add(r.ym); kpiMonthsByEmp.set(r.employee_id, s);
  });

  const { data: r360 } = await supabase.from('result_360').select('employee_id, score, computed_at').eq('period_id', ap.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  // computed_at per pegawai → deteksi "perlu hitung ulang" (penilaian berubah setelah hitung).
  const computedAtBy = new Map((r360 ?? []).map((r) => [r.employee_id, r.computed_at]));
  const { data: pen } = await supabase.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));
  const { data: reports } = await supabase
    .from('final_reports').select('employee_id, status, spv_acc, final_score').eq('period_id', ap.id);
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  // Pemimpin tim (untuk hint "ACC oleh Direksi"): laporan SPV/pemimpin tim di-ACC Direksi, bukan SPV.
  const { data: teamRows } = await createAdminClient().from('spv_team_members').select('spv_id');
  const leaderIds = new Set((teamRows ?? []).map((t) => t.spv_id));

  // Kelengkapan "dinilai oleh": berapa penilai WAJIB yang sudah submit untuk tiap pegawai
  // (selaras Progress 360 — kelengkapan berbasis penilaian wajib).
  // CATATAN: TANPA filter is_active — pegawai nonaktif (resign) pemetaannya dimatikan, tapi
  // penilaian terhadapnya tetap sah; tanpa ini kolom "Dinilai oleh" jadi "—" yang menyesatkan.
  const { data: maps } = await supabase
    .from('mappings').select('assessor_id, target_id, mandatory').eq('period_id', ap.id);
  const { data: subs } = await supabase
    .from('assessments').select('assessor_id, target_id, submitted_at').eq('period_id', ap.id).eq('status', 'submitted');
  const doneSet = new Set((subs ?? []).map((s) => `${s.assessor_id}|${s.target_id}`));
  // submitted_at TERBARU per pegawai (sebagai target) → dibandingkan dgn computed_at result_360.
  const maxSubByTarget = new Map<string, string>();
  (subs ?? []).forEach((s) => {
    if (!s.submitted_at) return;
    const cur = maxSubByTarget.get(s.target_id);
    if (!cur || s.submitted_at > cur) maxSubByTarget.set(s.target_id, s.submitted_at);
  });
  const ratedTotal = new Map<string, number>();
  const ratedDone = new Map<string, number>();
  (maps ?? []).forEach((m) => {
    if (!m.mandatory) return; // kelengkapan berbasis WAJIB
    ratedTotal.set(m.target_id, (ratedTotal.get(m.target_id) ?? 0) + 1);
    if (doneSet.has(`${m.assessor_id}|${m.target_id}`)) ratedDone.set(m.target_id, (ratedDone.get(m.target_id) ?? 0) + 1);
  });

  // Koreksi Garis Hubungan yang DI-ACC (mengubah kelas bobot) → juga memicu "perlu hitung".
  // reviewed_at TERBARU per pegawai (target) dibandingkan dgn computed_at result_360.
  const { data: corrs } = await supabase
    .from('relation_correction_requests').select('target_id, reviewed_at')
    .eq('period_id', ap.id).eq('status', 'approved').not('reviewed_at', 'is', null);
  const maxReviewedByTarget = new Map<string, string>();
  (corrs ?? []).forEach((c) => {
    if (!c.reviewed_at) return;
    const cur = maxReviewedByTarget.get(c.target_id);
    if (!cur || c.reviewed_at > cur) maxReviewedByTarget.set(c.target_id, c.reviewed_at);
  });

  const rows: ReportRow[] = employees.map((e) => {
    const agg = kpiAgg.get(e.id);
    const kpiAvg = agg ? agg.sum / agg.n : null;
    const s360 = s360By.get(e.id) ?? null;
    const penalty = penBy.get(e.id) ?? 0;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360, penalty, true); // allow360Only: subjek ber-360°-tanpa-KPI (mis. Direksi) → skor dari 360°
    const rep = repBy.get(e.id);
    // Perlu hitung ulang 360°: ada penilaian dikirim/diubah setelah result_360 terakhir dihitung
    // (atau sudah ada penilaian tapi belum pernah dihitung). Hanya relevan saat 360° aktif.
    const maxSub = maxSubByTarget.get(e.id) ?? null;
    const computedAt = computedAtBy.get(e.id) ?? null;
    const maxReviewed = maxReviewedByTarget.get(e.id) ?? null;
    const staleByAssessment = maxSub != null && (computedAt == null || maxSub > computedAt);
    // Koreksi relevan hanya RELATIF terhadap hitung sebelumnya (butuh computedAt).
    const staleByCorrection = maxReviewed != null && computedAt != null && maxReviewed > computedAt;
    const needsRecompute = ap.has_360 && (staleByAssessment || staleByCorrection);
    // Bulan KPI yang belum terisi (untuk indikator "X/Y bulan" + konfirmasi finalisasi).
    const presentMonths = kpiMonthsByEmp.get(e.id) ?? new Set<string>();
    const missingMonths = sortedMonths.filter((m) => !presentMonths.has(m));
    return {
      id: e.id, name: e.name, dept: e.dept,
      kpiAvg, s360, penalty, needsRecompute,
      totalMonths: sortedMonths.length, missingMonths,
      final, storedFinal: rep?.final_score ?? null,
      status: rep?.status ?? null, spvAcc: !!rep?.spv_acc,
      isSpvSubject: e.role !== 'direksi' && (e.role === 'spv' || leaderIds.has(e.id)),
      ratedDone: ratedDone.get(e.id) ?? 0, ratedTotal: ratedTotal.get(e.id) ?? 0,
    };
  }).sort((a, b) => (b.final ?? -1) - (a.final ?? -1));
  // Tampilkan yang AKTIF atau PUNYA DATA periode (KPI/360°/sudah ada laporan); nonaktif tanpa
  // data disembunyikan. Pegawai nonaktif yang sudah dinilai/ber-KPI tetap bisa difinalisasi.
  // DIREKSI DIKECUALIKAN dari "tampil karena aktif": mereka tak pernah punya KPI, jadi tanpa ini
  // Direksi aktif akan muncul sbg baris kosong tiap kuartal. Direksi hanya tampil bila PUNYA DATA
  // (skor 360°/laporan) — lewat cabang `r.s360 != null || r.status != null` di bawah.
  const activeIds = new Set(employees.filter((e) => e.is_active && e.role !== 'direksi').map((e) => e.id));
  const shownRows = rows.filter((r) => activeIds.has(r.id) || r.kpiAvg != null || r.s360 != null || r.status != null);
  const staleCount = shownRows.filter((r) => r.needsRecompute).length;
  // "Belum pernah dihitung" = ada penilaian masuk tapi result_360 masih kosong (subset staleCount)
  // → Skor Akhir mereka masih 100% KPI. Dibedakan agar pesan langkah lebih jelas.
  const neverCount = shownRows.filter((r) => ap.has_360 && r.s360 == null && maxSubByTarget.has(r.id)).length;
  const changedCount = Math.max(0, staleCount - neverCount);
  const depts = [...new Set(shownRows.map((r) => r.dept))].sort();
  // Kandidat finalisasi massal: sudah di-ACC (spv_acc) & masih Ditinjau (in_review). staleAcc =
  // di antaranya yang Skor 360°-nya perlu dihitung ulang (untuk peringatan di dialog konfirmasi).
  const accReady = shownRows.filter((r) => r.spvAcc && r.status === 'in_review');
  const accReadyCount = accReady.length;
  const accStaleCount = accReady.filter((r) => r.needsRecompute).length;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Review Hasil Akhir</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · finalisasi Skor Akhir kalibrasi.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      {/* Penanda langkah + kokpit hitung 360°, agar HRD tahu urutan & tak bolak-balik halaman. */}
      <div className="mb-4 space-y-2">
        {/* Strip alur bernomor — selalu tampil saat 360° aktif. */}
        {ap.has_360 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
            <span className="font-bold text-slate-700">Alur Review:</span>
            <span className="font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">① Hitung Ulang Skor 360°</span>
            <span aria-hidden className="text-gray-400">→</span>
            <span className="font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">② Tinjau &amp; susun ringkasan</span>
            <span aria-hidden className="text-gray-400">→</span>
            <span className="font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">③ Finalisasi</span>
          </div>
        )}

        {/* Banner langkah wajib: 360° aktif tapi ada yang belum/perlu dihitung. */}
        {ap.has_360 && staleCount > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 text-[12px] text-amber-900">
            <span aria-hidden>⚠️</span>
            <div>
              <strong>Langkah ①: Hitung Ulang Skor 360° dulu.</strong> Skor 360° hanya diperbarui saat tombol ini ditekan —
              {neverCount > 0 && <> <strong>{neverCount} pegawai belum pernah dihitung</strong> (Skor Akhir mereka masih 100% KPI).</>}
              {changedCount > 0 && <> <strong>{changedCount} pegawai perlu dihitung ulang</strong> (penilaian/koreksi berubah sejak hitung terakhir).</>}
              {' '}Tekan tombol di bawah <strong>sebelum</strong> Tinjau &amp; Finalisasi agar Skor Akhir benar.
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
          {ap.has_360 && <Recompute360Button />}
          {ap.has_360 && staleCount === 0 && (
            <span className="text-[11px] font-semibold text-emerald-700">✓ Skor 360° mutakhir</span>
          )}
          {/* Bulk-finalisasi ditumpuk DI ATAS tombol Bobot/Flag (kolom rata-kanan). */}
          <div className="flex flex-col items-end gap-2 ml-auto">
            <BulkFinalizeButton count={accReadyCount} staleCount={accStaleCount} />
            <div className="flex items-center gap-2">
              <Link href="/admin/bobot" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white">⚖ Atur Bobot</Link>
              <Link href="/admin/kepatuhan" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white">⚑ Flag Kepatuhan</Link>
            </div>
          </div>
        </div>
      </div>

      <ReportTable rows={shownRows} depts={depts} has360={ap.has_360} />
      <p className="text-[10px] text-gray-500 italic mt-3">
        Klik <strong>Tinjau</strong> untuk membuka & mengelola laporan pegawai (Simpan Draf → Rilis ke SPV →
        Finalisasi) di panel detail. Setelah <strong>Final</strong>, kolom Skor Akhir menampilkan angka
        tersimpan yang dilihat pegawai; badge <strong>berubah</strong> muncul bila data terkini berbeda
        (kembalikan ke draf lalu finalisasi ulang untuk memperbarui).
      </p>
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
