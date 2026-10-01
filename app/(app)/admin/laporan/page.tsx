import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection, grantedAccess, employeeInScopes, type PageScope } from '@/lib/auth/roles';
import { finalScoreOf, kpiAvgOf, hasScoreDrift } from '@/lib/scoring';
import { ReportTable, type ReportRow } from './report-table';
import { Recompute360Button } from './recompute-360-button';
import { ResyncDriftButton } from './resync-drift-button';
import { BulkFinalizeButton } from './bulk-finalize-button';
import { Panel } from '@/components/panel';
import { loadPendingLatePenalties, refreshLatePenalties } from '@/lib/late-server';

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
    return <Shell><p className="text-sm text-ink-soft">Halaman ini hanya untuk HRD Admin atau pemegang akses Review & Finalisasi.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  // "Tinjau" (buka detail) tampil bila HRD penuh ATAU pemegang grant (baik lihat-saja maupun edit —
  // detail sendiri read-only bila tak boleh-edit). Grant lihat-saja lama tetap bisa melihat daftar.
  const readOnly = !isHrdFull && !reviewScopes; // (selalu false di titik ini; ambang jelas)
  // Pemegang grant bukan is_hrd() → RLS memblokir baca lintas-pegawai → baca via service_role.
  const db = (isHrdFull ? supabase : createAdminClient()) as typeof supabase;

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-ink-soft">Tidak ada periode aktif.</p></Shell>;

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
  const kpiValsBy = new Map<string, number[]>(); // nilai KPI bulanan per pegawai → kpiAvgOf
  const kpiMonthsByEmp = new Map<string, Set<string>>(); // bulan yang sudah ada KPI per pegawai
  kpiRows.forEach((r) => {
    kpiValsBy.set(r.employee_id, [...(kpiValsBy.get(r.employee_id) ?? []), Number(r.score)]);
    const s = kpiMonthsByEmp.get(r.employee_id) ?? new Set<string>(); s.add(r.ym); kpiMonthsByEmp.set(r.employee_id, s);
  });

  // Potongan keterlambatan diterapkan OTOMATIS saat HRD membuka halaman ini (pengganti cron nonaktif,
  // keputusan HRD 2026-09-29) — angka 360°/Skor Akhir yang ditinjau sudah memuat potongan terbaru.
  // Gagal → tak memblokir halaman; sisa yang tertunda tetap diperingatkan di kokpit di bawah.
  if (isHrdFull && ap.has_360) { try { await refreshLatePenalties(ap.id); } catch { /* diperingatkan via pendingLate */ } }
  const { data: r360 } = await db.from('result_360').select('employee_id, score, computed_at').eq('period_id', ap.id);
  const s360By = new Map((r360 ?? []).map((r) => [r.employee_id, r.score]));
  // computed_at per pegawai → deteksi "perlu hitung ulang" (penilaian berubah setelah hitung).
  const computedAtBy = new Map((r360 ?? []).map((r) => [r.employee_id, r.computed_at]));
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

  // Perubahan BOBOT sesudah hitung terakhir juga membuat Skor 360° usang: skema periode
  // (weight_schemes.updated_at), bobot khusus per pegawai (updated_at), dan penghapusan bobot khusus
  // (tercatat di log aktivitas HRD). Data konfigurasi → dibaca via service_role.
  const cfg = createAdminClient();
  const [{ data: wsRow }, { data: ovrRows }, { data: ovrRemoved }] = await Promise.all([
    cfg.from('weight_schemes').select('updated_at').eq('period_id', ap.id).eq('is_active', true).maybeSingle(),
    cfg.from('employee_weight_overrides').select('employee_id, updated_at').eq('period_id', ap.id),
    cfg.from('hrd_audit_log').select('target_id, created_at').eq('action', 'weights.override_remove'),
  ]);
  const weightsChangedAt = wsRow?.updated_at ?? null;
  const ovrChangedBy = new Map<string, string>();
  const bumpOvr = (id: string | null, at: string | null) => {
    if (!id || !at) return;
    const cur = ovrChangedBy.get(id);
    if (!cur || Date.parse(at) > Date.parse(cur)) ovrChangedBy.set(id, at);
  };
  (ovrRows ?? []).forEach((o) => bumpOvr(o.employee_id, o.updated_at));
  (ovrRemoved ?? []).forEach((l) => bumpOvr(l.target_id, l.created_at));
  const after = (a: string | null, b: string | null) => a != null && b != null && Date.parse(a) > Date.parse(b);

  const rows: ReportRow[] = employees.map((e) => {
    const kpiAvg = kpiAvgOf(kpiValsBy.get(e.id) ?? []);
    const s360 = s360By.get(e.id) ?? null;
    const final = finalScoreOf(kpiAvg, s360, ap.has_360); // rumus resmi tunggal (tanpa KPI → 360° saja)
    const rep = repBy.get(e.id);
    // Perlu hitung ulang 360°: ada penilaian dikirim/diubah setelah result_360 terakhir dihitung
    // (atau sudah ada penilaian tapi belum pernah dihitung). Hanya relevan saat 360° aktif.
    const maxSub = maxSubByTarget.get(e.id) ?? null;
    const computedAt = computedAtBy.get(e.id) ?? null;
    const maxReviewed = maxReviewedByTarget.get(e.id) ?? null;
    const staleByAssessment = maxSub != null && (computedAt == null || maxSub > computedAt);
    // Koreksi relevan hanya RELATIF terhadap hitung sebelumnya (butuh computedAt).
    const staleByCorrection = maxReviewed != null && computedAt != null && maxReviewed > computedAt;
    const staleByWeights = after(weightsChangedAt, computedAt) || after(ovrChangedBy.get(e.id) ?? null, computedAt);
    const needsRecompute = ap.has_360 && (staleByAssessment || staleByCorrection || staleByWeights);
    // Bulan KPI yang belum terisi (untuk indikator "X/Y bulan" + konfirmasi finalisasi).
    const presentMonths = kpiMonthsByEmp.get(e.id) ?? new Set<string>();
    const missingMonths = sortedMonths.filter((m) => !presentMonths.has(m));
    return {
      id: e.id, name: e.name, dept: e.dept,
      kpiAvg, s360, needsRecompute,
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
  // "berubah → N": laporan sudah Final tapi Skor Akhir tersimpan ≠ Skor Akhir live (KPI/360°
  // berubah setelah finalisasi) → perlu finalisasi ulang (langkah ②). hasScoreDrift
  // selaras badge di tabel. Ini state BERBEDA dari staleCount (Skor 360° usang, langkah ①).
  const driftCount = shownRows.filter((r) => r.status === 'finalized' && hasScoreDrift(r.final, r.storedFinal)).length;
  // Potongan keterlambatan yang belum masuk Skor 360° tersimpan (cron nonaktif) → diterapkan di
  // halaman Flag Kepatuhan. Diperingatkan di sini agar tak terlanjur difinalisasi tanpa potongan.
  const pendingLate = isHrdFull && ap.has_360 ? (await loadPendingLatePenalties(ap.id)).length : 0;

  return (
    <Shell>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink flex items-center gap-2">
            Review &amp; Finalisasi
            {!isHrdFull && !grantCanEdit && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.05em] px-2 py-0.5 rounded-control border bg-neutral-tint text-ink-soft border-line">Lihat-saja</span>
            )}
          </h1>
          <p className="text-[13.5px] text-ink-soft mt-1">Periode aktif <span className="data-value font-semibold text-ink">{ap.label}</span> · {isHrdFull ? 'finalisasi Skor Akhir kalibrasi.' : grantCanFinalize ? 'akses dari HRD — boleh tinjau & finalisasi (lingkup terbatas).' : grantCanEdit ? 'akses dari HRD — boleh tinjau & meringkas, tanpa finalisasi (lingkup terbatas).' : 'lihat-saja (akses dari HRD, lingkup terbatas).'}</p>
        </div>
        <Link href="/" className="text-[12.5px] text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>

      {/* Kokpit "Sinkronkan Skor" — HANYA HRD penuh (pemegang grant = read-only). Menyatukan dua
          aksi yang dulu terpisah/membingungkan: ① Hitung Ulang Skor 360° (result_360 usang) dan
          ② Finalisasi Ulang laporan yang skornya berubah (final_score tersimpan ketinggalan). */}
      {isHrdFull && (
      <div className="mb-5 rounded-panel border border-line bg-neutral-tint p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.05em]">Sinkronkan Skor</h2>
          {ap.has_360 && staleCount === 0 && driftCount === 0 && pendingLate === 0 && (
            <span className="text-[11px] font-semibold text-brand-ink">✓ semua skor mutakhir</span>
          )}
        </div>

        {/* Penjelasan singkat 2 keadaan — mengganti dua badge yang dulu perlu dijelaskan panjang. */}
        <p className="text-[11px] text-ink-faint leading-relaxed max-w-3xl">
          Skor hanya diperbarui saat Anda menekannya di sini.
          {ap.has_360 && <> <strong className="text-warn-ink">Perlu hitung</strong> = penilaian 360° berubah sejak terakhir dihitung → tekan <strong>①</strong>.</>}
          {' '}<strong className="text-warn-ink">Berubah → N</strong> = laporan sudah Final tapi angkanya ketinggalan → tekan <strong>②</strong> agar pegawai melihat Skor Akhir terbaru.
        </p>

        {/* Baris aksi utama: ① Hitung Ulang · ② Finalisasi Ulang Berubah. */}
        <div className="flex flex-wrap items-center gap-2">
          {ap.has_360 && <Recompute360Button />}
          {ap.has_360 && staleCount > 0 && (
            <span className="text-[11px] text-warn-ink font-semibold">
              {neverCount > 0 && <>{neverCount} belum pernah dihitung{changedCount > 0 ? ' · ' : ''}</>}
              {changedCount > 0 && <>{changedCount} perlu dihitung ulang</>}
            </span>
          )}
          <ResyncDriftButton count={driftCount} />
        </div>
        {pendingLate > 0 && (
          <p className="text-[11px] text-warn-ink font-semibold">
            ⚠ {pendingLate} pegawai: potongan keterlambatan menilai belum masuk Skor 360° —{' '}
            <Link href="/admin/kepatuhan" className="underline hover:no-underline">terapkan di Flag Kepatuhan</Link> sebelum finalisasi.
          </p>
        )}

        {/* Baris sekunder: finalisasi massal ber-ACC + pintasan Bobot/Flag. */}
        <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-line">
          <BulkFinalizeButton count={accReadyCount} staleCount={accStaleCount} />
          <div className="flex items-center gap-2 ml-auto">
            <Link href="/admin/bobot" className="text-[11px] font-semibold px-3 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">⚖ Atur Bobot</Link>
            <Link href="/admin/kepatuhan" className="text-[11px] font-semibold px-3 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">⚑ Flag Kepatuhan</Link>
          </div>
        </div>
      </div>
      )}

      <Panel><ReportTable rows={shownRows} depts={depts} has360={ap.has_360} readOnly={readOnly} /></Panel>
      {isHrdFull ? (
        <p className="text-[11px] text-ink-faint mt-4 leading-relaxed">
          Klik <strong>Tinjau</strong> untuk membuka & mengelola laporan pegawai (Simpan Draf → Rilis ke SPV →
          Finalisasi) di panel detail. Setelah <strong>Final</strong>, kolom Skor Akhir menampilkan angka
          tersimpan yang dilihat pegawai; badge <strong>berubah</strong> muncul bila data terkini berbeda —
          tekan <strong>② Perbarui Laporan Final yang Berubah</strong> di atas untuk menyegarkan semuanya sekaligus
          (atau kembalikan satu laporan ke draf lalu finalisasi ulang manual).
        </p>
      ) : grantCanFinalize ? (
        <p className="text-[11px] text-ink-faint mt-4 leading-relaxed">
          Klik <strong>Tinjau</strong> untuk membuka laporan pegawai dalam lingkup akses Anda dan
          mengelolanya (Simpan Draf → Rilis → Finalisasi). Akses ini diberikan HRD dan dibatasi lingkup.
        </p>
      ) : grantCanEdit ? (
        <p className="text-[11px] text-ink-faint mt-4 leading-relaxed">
          Klik <strong>Tinjau</strong> untuk membuka laporan pegawai dalam lingkup akses Anda dan menulis
          <strong> Ringkasan Aspek</strong>. Finalisasi &amp; kalibrasi skor tetap wewenang HRD.
        </p>
      ) : (
        <p className="text-[11px] text-ink-faint mt-4 leading-relaxed">
          Klik <strong>Tinjau</strong> untuk membuka laporan (tampilan <strong>lihat-saja</strong>) sesuai
          akses yang diberikan HRD (lingkup terbatas). Finalisasi & perubahan laporan hanya oleh HRD.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
