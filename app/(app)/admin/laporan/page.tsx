import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection, grantedAccess, employeeInScopes, type PageScope } from '@/lib/auth/roles';
import { finalScoreOf } from '@/lib/scoring';
import { ReportTable, type ReportRow } from './report-table';
import { Recompute360Button } from './recompute-360-button';
import { ResyncDriftButton } from './resync-drift-button';
import { BulkFinalizeButton } from './bulk-finalize-button';

/**
 * Review Hasil Akhir (HRD): hitung Skor Akhir tiap pegawai, lihat ACC SPV & status,
 * lalu Simpan Draf / Finalisasi. Finalisasi → pegawai dapat melihat di Laporan Hasil Saya.
 */
export default async function AdminLaporanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections, dept').eq('id', user.id).maybeSingle();

  // SADAR-MODE: HRD "penuh" HANYA di Mode Admin (paritas — HRD Mode-SPV dibatasi seperti non-HRD).
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const isHrdFull = canSection(me, 'laporan') && hrdMode === 'admin';

  // Jalur GRANT (non-HRD-penuh): akses Review Hasil Akhir ber-LINGKUP. Tahap 2 — grant boleh
  // menyertakan dimensi EDIT: `can_edit=true` → pemegang boleh membuka detail & finalisasi (dalam
  // lingkup, ditegakkan server via service_role); `can_edit=false` → tetap LIHAT-SAJA (Tahap 1).
  let reviewScopes: PageScope[] | null = null;
  let grantCanEdit = false;
  let grantCanFinalize = false;
  if (!isHrdFull) {
    const { data: grantRows } = await supabase.from('page_grants').select('section, scope, scopes, can_edit, can_finalize').eq('employee_id', user.id);
    const access = grantedAccess(grantRows, 'review');
    reviewScopes = access?.scopes ?? null;
    grantCanEdit = !!access?.canEdit;
    grantCanFinalize = !!access?.canFinalize;
  }
  if (!isHrdFull && !reviewScopes) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin atau pemegang akses Review Hasil Akhir.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // "Tinjau" (buka detail) tampil bila HRD penuh ATAU pemegang grant (baik lihat-saja maupun edit —
  // detail sendiri read-only bila tak boleh-edit). Grant lihat-saja lama tetap bisa melihat daftar.
  const readOnly = !isHrdFull && !reviewScopes; // (selalu false di titik ini; ambang jelas)
  // Pemegang grant bukan is_hrd() → RLS memblokir baca lintas-pegawai → baca via service_role.
  const db = (isHrdFull ? supabase : createAdminClient()) as typeof supabase;

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-gray-500">Tidak ada periode aktif.</p></Shell>;

  // Pelaporan: ambil TANPA filter is_active; nonaktif disaring belakangan kecuali punya data
  // periode (KPI/360°/laporan) → pegawai yang resign di akhir periode tetap bisa difinalisasi.
  // Direksi SENGAJA IKUT di sini (subjek 360° — keputusan 2026-07-08): mereka tak punya KPI,
  // jadi hanya tampil bila punya skor 360° (disaring `shownRows` di bawah). Ini KHUSUS halaman
  // Review Hasil Akhir — Dashboard/KPI/kepatuhan tetap mengecualikan Direksi.
  // Pemegang grant: daftar disaring per LINGKUP (deptScopeFilter — cerminan query Monitor).
  // Ambil semua pegawai internal; pemegang grant disaring per gabungan lingkup (employeeInScopes,
  // termasuk 'self' per-ID). HRD penuh (reviewScopes null) → tanpa saring (semua).
  // Tim naungan (hanya bila lingkup 'coordinator_team'): id anggota tim pemegang grant.
  const teamIds = reviewScopes?.includes('coordinator_team')
    ? new Set(((await db.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id)).data ?? []).map((r) => r.employee_id))
    : undefined;
  const { data: emps } = await db.from('employees').select('id, name, dept, is_active, role').eq('is_external', false);
  const employees = (emps ?? []).filter((e) =>
    !reviewScopes || employeeInScopes(reviewScopes, me?.dept ?? '', user.id, e, teamIds));

  const { data: months } = await db.from('period_months').select('ym').eq('period_id', ap.id);
  const yms = (months ?? []).map((m) => m.ym);
  const sortedMonths = [...yms].sort();
  // kpi_scores semua pegawai (bulan periode) → bisa >1000; ambil penuh.
  const kpiRows = yms.length
    ? await fetchAllPaged<{ employee_id: string; score: number; ym: string }>((from, to) =>
        db.from('kpi_scores').select('employee_id, score, ym').in('ym', yms).order('employee_id').order('ym').range(from, to))
    : [];
  const kpiAgg = new Map<string, { sum: number; n: number }>();
  const kpiMonthsByEmp = new Map<string, Set<string>>(); // bulan yang sudah ada KPI per pegawai
  kpiRows.forEach((r) => {
    const a = kpiAgg.get(r.employee_id) ?? { sum: 0, n: 0 }; a.sum += r.score; a.n++; kpiAgg.set(r.employee_id, a);
    const s = kpiMonthsByEmp.get(r.employee_id) ?? new Set<string>(); s.add(r.ym); kpiMonthsByEmp.set(r.employee_id, s);
  });

  const { data: r360 } = await db.from('result_360').select('employee_id, score, computed_at').eq('period_id', ap.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  // computed_at per pegawai → deteksi "perlu hitung ulang" (penilaian berubah setelah hitung).
  const computedAtBy = new Map((r360 ?? []).map((r) => [r.employee_id, r.computed_at]));
  const { data: pen } = await db.from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));
  const { data: reports } = await db
    .from('final_reports').select('employee_id, status, spv_acc, final_score').eq('period_id', ap.id);
  const repBy = new Map((reports ?? []).map((r) => [r.employee_id, r]));

  // Pemimpin tim (untuk hint "ACC oleh Direksi"): laporan SPV/pemimpin tim di-ACC Direksi, bukan SPV.
  const { data: teamRows } = await createAdminClient().from('spv_team_members').select('spv_id');
  const leaderIds = new Set((teamRows ?? []).map((t) => t.spv_id));

  // Kelengkapan "dinilai oleh": berapa penilai WAJIB yang sudah submit untuk tiap pegawai
  // (selaras Progress 360 — kelengkapan berbasis penilaian wajib).
  // CATATAN: TANPA filter is_active — pegawai nonaktif (resign) pemetaannya dimatikan, tapi
  // penilaian terhadapnya tetap sah; tanpa ini kolom "Dinilai oleh" jadi "—" yang menyesatkan.
  // mappings & assessments SELURUH pegawai → bisa >1000; ambil penuh (kelengkapan & deteksi
  // "perlu hitung ulang" harus lengkap, kalau terpotong bisa gagal memicu peringatan).
  const maps = await fetchAllPaged<{ assessor_id: string; target_id: string; mandatory: boolean }>((from, to) =>
    db.from('mappings').select('assessor_id, target_id, mandatory').eq('period_id', ap.id).order('assessor_id').order('target_id').range(from, to));
  const subs = await fetchAllPaged<{ assessor_id: string; target_id: string; submitted_at: string | null }>((from, to) =>
    db.from('assessments').select('assessor_id, target_id, submitted_at').eq('period_id', ap.id).eq('status', 'submitted').order('assessor_id').order('target_id').range(from, to));
  const doneSet = new Set(subs.map((s) => `${s.assessor_id}|${s.target_id}`));
  // submitted_at TERBARU per pegawai (sebagai target) → dibandingkan dgn computed_at result_360.
  const maxSubByTarget = new Map<string, string>();
  subs.forEach((s) => {
    if (!s.submitted_at) return;
    const cur = maxSubByTarget.get(s.target_id);
    if (!cur || s.submitted_at > cur) maxSubByTarget.set(s.target_id, s.submitted_at);
  });
  const ratedTotal = new Map<string, number>();
  const ratedDone = new Map<string, number>();
  maps.forEach((m) => {
    if (!m.mandatory) return; // kelengkapan berbasis WAJIB
    ratedTotal.set(m.target_id, (ratedTotal.get(m.target_id) ?? 0) + 1);
    if (doneSet.has(`${m.assessor_id}|${m.target_id}`)) ratedDone.set(m.target_id, (ratedDone.get(m.target_id) ?? 0) + 1);
  });

  // Koreksi Garis Hubungan yang DI-ACC (mengubah kelas bobot) → juga memicu "perlu hitung".
  // reviewed_at TERBARU per pegawai (target) dibandingkan dgn computed_at result_360.
  const { data: corrs } = await db
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
  // "berubah → N": laporan sudah Final tapi Skor Akhir tersimpan ≠ Skor Akhir live (KPI/360°/
  // punishment berubah setelah finalisasi) → perlu finalisasi ulang (langkah ②). Ambang 0.05
  // selaras badge di tabel. Ini state BERBEDA dari staleCount (Skor 360° usang, langkah ①).
  const driftCount = shownRows.filter((r) =>
    r.status === 'finalized' && r.final != null && r.storedFinal != null && Math.abs(r.final - r.storedFinal) >= 0.05,
  ).length;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Review Hasil Akhir</h1>
          <p className="text-sm text-gray-500">Periode aktif: {ap.label} · {isHrdFull ? 'finalisasi Skor Akhir kalibrasi.' : grantCanFinalize ? 'akses dari HRD — boleh tinjau & finalisasi (lingkup terbatas).' : grantCanEdit ? 'akses dari HRD — boleh tinjau & meringkas, tanpa finalisasi (lingkup terbatas).' : 'lihat-saja (akses dari HRD, lingkup terbatas).'}</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>

      {/* Kokpit "Sinkronkan Skor" — HANYA HRD penuh (pemegang grant = read-only). Menyatukan dua
          aksi yang dulu terpisah/membingungkan: ① Hitung Ulang Skor 360° (result_360 usang) dan
          ② Finalisasi Ulang laporan yang skornya berubah (final_score tersimpan ketinggalan). */}
      {isHrdFull && (
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-extrabold text-slate-700 uppercase tracking-tight">Sinkronkan Skor</h2>
          {ap.has_360 && staleCount === 0 && driftCount === 0 && (
            <span className="text-[11px] font-semibold text-emerald-700">✓ semua skor mutakhir</span>
          )}
        </div>

        {/* Penjelasan singkat 2 keadaan — mengganti dua badge yang dulu perlu dijelaskan panjang. */}
        <p className="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
          Skor hanya diperbarui saat Anda menekannya di sini.
          {ap.has_360 && <> <strong className="text-amber-700">Perlu hitung</strong> = penilaian 360° berubah sejak terakhir dihitung → tekan <strong>①</strong>.</>}
          {' '}<strong className="text-amber-700">Berubah → N</strong> = laporan sudah Final tapi angkanya ketinggalan → tekan <strong>②</strong> agar pegawai melihat Skor Akhir terbaru.
        </p>

        {/* Baris aksi utama: ① Hitung Ulang · ② Finalisasi Ulang Berubah. */}
        <div className="flex flex-wrap items-center gap-2">
          {ap.has_360 && <Recompute360Button />}
          {ap.has_360 && staleCount > 0 && (
            <span className="text-[11px] text-amber-800 font-semibold">
              {neverCount > 0 && <>{neverCount} belum pernah dihitung{changedCount > 0 ? ' · ' : ''}</>}
              {changedCount > 0 && <>{changedCount} perlu dihitung ulang</>}
            </span>
          )}
          <ResyncDriftButton count={driftCount} />
        </div>

        {/* Baris sekunder: finalisasi massal ber-ACC + pintasan Bobot/Flag. */}
        <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-200">
          <BulkFinalizeButton count={accReadyCount} staleCount={accStaleCount} />
          <div className="flex items-center gap-2 ml-auto">
            <Link href="/admin/bobot" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white">⚖ Atur Bobot</Link>
            <Link href="/admin/kepatuhan" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white">⚑ Flag Kepatuhan</Link>
          </div>
        </div>
      </div>
      )}

      <ReportTable rows={shownRows} depts={depts} has360={ap.has_360} readOnly={readOnly} />
      {isHrdFull ? (
        <p className="text-[10px] text-gray-500 italic mt-3">
          Klik <strong>Tinjau</strong> untuk membuka & mengelola laporan pegawai (Simpan Draf → Rilis ke SPV →
          Finalisasi) di panel detail. Setelah <strong>Final</strong>, kolom Skor Akhir menampilkan angka
          tersimpan yang dilihat pegawai; badge <strong>berubah</strong> muncul bila data terkini berbeda —
          tekan <strong>② Finalisasi Ulang Berubah</strong> di atas untuk menyegarkan semuanya sekaligus
          (atau kembalikan satu laporan ke draf lalu finalisasi ulang manual).
        </p>
      ) : grantCanFinalize ? (
        <p className="text-[10px] text-gray-500 italic mt-3">
          Klik <strong>Tinjau</strong> untuk membuka laporan pegawai dalam lingkup akses Anda dan
          mengelolanya (Simpan Draf → Rilis → Finalisasi). Akses ini diberikan HRD dan dibatasi lingkup.
        </p>
      ) : grantCanEdit ? (
        <p className="text-[10px] text-gray-500 italic mt-3">
          Klik <strong>Tinjau</strong> untuk membuka laporan pegawai dalam lingkup akses Anda dan menulis
          <strong> Ringkasan Aspek</strong>. Finalisasi &amp; kalibrasi skor tetap wewenang HRD.
        </p>
      ) : (
        <p className="text-[10px] text-gray-500 italic mt-3">
          Klik <strong>Tinjau</strong> untuk membuka laporan (tampilan <strong>lihat-saja</strong>) sesuai
          akses yang diberikan HRD (lingkup terbatas). Finalisasi & perubahan laporan hanya oleh HRD.
        </p>
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
