# STATUS — Infarm 360° Performance Appraisal System

Potret status & catatan sesi (cepat-basi — perbarui tiap sesi). Panduan tahan-lama ada di
**CLAUDE.md**; rincian tiap fitur di **[CHANGELOG.md](CHANGELOG.md)**; sisa pekerjaan di **[TODO.md](TODO.md)** / **[BACKLOG.md](BACKLOG.md)**
(CLAUDE.md); catatan operasional trial/Q2 di **REKOMENDASI.md**.

## Sedang Dikerjakan (per 2026-07-20)

**Fokus aktif:** **akurasi data Q1** (backfill Looker presisi tinggi + koreksi KPI darurat) &
**Manajemen Akses** (halaman administrator pertama yang di-grant: Review Hasil Akhir, Tahap 1).
Migrasi fungsional **selesai & live**; sisa sebagian besar **aktivasi env** (email/sandi) + **kebersihan akun** + **backup rutin**.

- **Sesi 2026-07-20:**
  - **Backfill Looker Q1 presisi tinggi — SELESAI & DI LIVE** (push `383b745`): migrasi **0026**
    (`assessment_indicator_scores.rating` `numeric(3,2)`→**`numeric(8,6)`**, aditif/aman) + skrip
    **reusable** `scripts/import-360-backfill.mjs` (dry-run default; `--apply`/`--create-missing`/
    `--period=`). Diimpor: **250 rating aspek + 50 headline** diperbarui + **1 penilaian baru
    (Rosyid FT2026-068)** ditambahkan ke Q1 (FT2026-069/070/071 sengaja tetap di luar). Backup pra-aksi
    `backups/backup-2026-07-20T03-38-29-707Z`; audit `hrd_audit_log` (`score360.backfill`). Heatmap aspek
    Q1 kini eksak (aspek = `rating×20`). ⚠️ **JANGAN Hitung Ulang Q1** (headline dari `skor_360_100`).
    Migrasi + skrip **sudah di-commit & push**; **CSV data pegawai TIDAK di-commit** (gitignore `BACKFILL-*.csv`).
  - **Koreksi KPI darurat langsung-DB ("Cara 1")** — permintaan pengguna, ubah nilai bulan tunggal:
    **Q1** Ikana Feb→69.8, Ulfa Mar→94.51, Christo Jan→84; **Juni (Q2)** Qurrotun→97.87, Aiga→95.92,
    Rosyid→98.00. Ditulis ke `kpi_scores` + audit `kpi_audit` (action=`set`, bukan `edit` — constraint
    0019 hanya izinkan `set`/`delete`). Data, bukan kode.
  - **"Laporan Hasil Saya" lintas periode — SELESAI & DI LIVE** (push `b89e98a`): laporan **finalized**
    tetap dapat diakses setelah periode ditutup (memuat semua laporan final + **pemilih periode** pil;
    default periode final terbaru). RLS `fr_read` memang tak bergantung periode aktif — hanya logika
    halaman yang tadinya membatasi. File: `app/(app)/laporan/page.tsx`.
  - **Fix hitung "laporan belum difinalisasi" — SELESAI & DI LIVE** (push `451d90e`): dialog "Kunci &
    Akhiri Periode" menghitung beda dari sidebar (6 vs 10) → `activePeriodReadiness` diberi
    `.eq('is_external', false)` agar konsisten dgn hitung TODO sidebar. File: `app/(app)/admin/periode/actions.ts`.
  - **Manajemen Akses — Review Hasil Akhir grant LIHAT-SAJA (Tahap 1) — SELESAI di `dev`, BELUM PUSH**
    (commit `a42d6ee`, terverifikasi di localhost: tak bisa edit/Tinjau). Halaman **administrator pertama**
    yang bisa di-grant ke non-HRD: `'review'` masuk `GRANTABLE_PAGES` (kind administrator, **tapi Tahap 1
    read-only**; `can_edit` default false). `admin/laporan/page.tsx` jadi **SADAR-MODE**
    (`isHrdFull = canSection('laporan') && hrdMode==='admin'`) + jalur grant: baca via `service_role`,
    `employees` disaring `deptScopeFilter`, tombol tulis & "Tinjau" disembunyikan; aksi tulis TAK diubah =
    HRD-only; detail `/laporan/[employeeId]` **tetap diblok** untuk grant holder. +4 tes (120 hijau).
    **Tahap 2 (ditunda):** finalisasi/edit oleh non-HRD + detail read-only. Detail: [[page-access-rbac]].
  - **Verifikasi weighting (Q&A, tanpa kode):** dikonfirmasi Dashboard/Monitor/heatmap per-pegawai **sudah
    menerapkan** `weightedScore360`; aspek per-pegawai cocok dgn Review Hasil Akhir; org-agregat beda
    (pooled vs mean-of-means) — moot utk Q1 sintetis (1 penilai/pegawai).
  - **TODO baru (belum digarap):** seragamkan skor 360° di **Ekspor Rekap** (`exportRekap` baca
    `result_360` tersimpan; `exportSummary360`/`exportAspectScores` hitung LIVE → bisa beda antar-sheet).
    Lihat [TODO.md](TODO.md) "Keandalan teknis".

- **Sesi 2026-07-16..18 (di-push ke `main`, commit `2b01e93`) — TANPA migrasi DB (murni penyajian):**
  - **Monitor Kinerja Pegawai untuk HRD (BARU):** `app/(app)/admin/monitor/` (gate `canSection
    'dashboard'`) = cermin Monitor SPV utk seluruh internal; filter **periode+divisi**, scorecard/tren/
    movers ikut filter, tabel 5/hal, **delta divisi-vs-org**. Menu di `app-shell.tsx`.
  - **"Penyebab Perubahan":** urai Δ rata-rata jadi **skor pegawai konsisten** vs **perubahan komposisi**
    (identitas eksak). Kartu di Monitor; tooltip Δ selaras di Dashboard. **Pergerakan 360° per-aspek** +
    toggle "Lihat semua".
  - **Heatmap + Donut aspek/indikator per pegawai** (`extremes-heatmap.tsx`/`per-employee-heatmap.tsx`/
    `lib/aspect360.ts`): donut frekuensi **terlemah/terkuat** (4 teratas + Lainnya) **di atas** heatmap;
    **klik irisan → heatmap tersaring**. Semua peran; palet selaras Dashboard; 5/hal + cari.
  - **Profil Aspek tim + pembanding "vs organisasi"** (`team-aspect.tsx`/`orgAspectAverages`): garis +
    chip Δ per aspek (SPV/Koordinator = vs perusahaan; HRD divisi = divisi vs org; `Semua divisi` = tanpa pembanding).
  - **Penataan section berhierarki** (`section-header.tsx`) di Monitor & tiap sub-tab Dashboard;
    **DistBars** diseragamkan ke 4 kategori; **kelengkapan** jadi baris di bawah scorecard (`completeness.tsx`).
  - **Dashboard:** **Scatter KPI×360°** + **distribusi kategori per kuartal** + legenda ambang; coaching
    `<85`→`<80`; hapus banner judul tab KPI/360; **tabel 10/hal + pager**; sub-judul tujuan + tautan silang.
  - **Menutup seluruh audit** (kesan per peran, janggal, kurang informatif, usulan chart 1–5).
  - ⚠️ **Sisa:** **verifikasi visual di browser** (data live) kedua halaman (fix hydration donut sudah
    diterapkan — koordinat `donutArc` dibulatkan 3 desimal).

- **Sesi 2026-07-15 (di-push ke `main`):**
  - **Koordinator kini BISA meng-ACC** laporan pegawai yang dinaunginya (setelah HRD rilis). **SPV**
    untuk pegawai berkoordinator **tidak lagi ACC** — hanya lihat status ACC koordinator (read-only);
    SPV fokus meng-ACC pegawai **tanpa** koordinator. Ditegakkan di server (`setSpvAcc` cabang
    koordinator via service_role + guard SPV menolak pegawai berkoordinator). Reuse kolom `spv_acc`,
    **tanpa migrasi**. Data live: 6 pegawai berkoordinator semua di tim SPV Andra Andiara.
  - **SPV/Koordinator/Direksi kini melihat umpan balik 360° MENTAH ANONIM** (`byAspect`/`essays` —
    komentar & rating verbatim tanpa nama) untuk pegawai yang ditinjaunya. L3 **BERNAMA** (`assessors`)
    tetap dibuang. RLS tak berubah (raw tetap tertutup via API; paparan anonim app-level via service_role).
    ⚠️ risiko de-anonimisasi pada kelas penilai kecil; mudah dibalik. Detail: [[raw-anon-exposure]].
  - **Koordinator kini INPUT KPI** (tab Input saja) pegawai naungannya; **SPV input KPI hanya pegawai
    TANPA koordinator** (dikeluarkan dari daftar SPV/HRD-mode-SPV; server tolak role='spv'). Via
    service_role berlingkup + audit (`changed_by`=koordinator) + edit-wajib-komentar. Tanpa migrasi.
  - **Log Aktivitas HRD** → paginasi **10 baris di server** (hemat egress) + filter kategori/cari server.
    **Audit KPI** → daftar rata **terbaru di atas** (bukan dikelompokkan per nama) + kolom Pegawai.
  - **Grant HRD Admin & Peninjau hanya untuk divisi HRD** (`isHrdDept` = dept diawali "HRD"): tombol UI
    disembunyikan + server menolak grant utk non-HRD (pencabutan tetap boleh).
  - **Backfill 360° Q1 2026** (dinilai eksternal) ke Dashboard: **migrasi 0022** (`rating`→numeric(3,2))
    + `has_360=true` Q1 + `result_360` (headline eksak) + penilaian sintetis (anchor=Direksi) utk 5
    aspek. 50 pegawai. ⚠️ **JANGAN "Hitung Ulang Skor 360°" Q1** (menimpa backfill). Backup pra-aksi di
    `backups/backup-2026-07-15T09-45-48-694Z`. Data via skrip (tak di-commit); `BACKFILL-360-Q1.csv` lokal.
  - **Dashboard Analisis 360°**: "Tren 360°" & "Evaluasi Sub-Aspek" ditata **sejajar** (2 kolom).

**Sesi 2026-07-10..12 sudah PUSHED ke `main` & live (commit `9266b34`).**
Bagian ini hanya potret status; perincian tiap fitur ada di **[CHANGELOG.md](CHANGELOG.md)** & **[TODO.md](TODO.md)**.

- **Peran Koordinator (2026-07-12, migrasi 0021 diterapkan ke live + di-push):** pegawai (role=employee)
  ber-grant `is_coordinator` lihat-saja "Laporan Kinerja Tim" untuk daftar eksplisit `coordinator_team_members`
  (pola Peninjau: grant non-RLS, akses service_role berlingkup, L3 dibuang; tanpa KPI/ACC/efek 360°). UI grant +
  dialog "Tim Koordinasi" di Kelola Pegawai. Assignment awal (live): Arif→{Qurrotun,Reni}; Widodo→{Adistya,
  Fikar,Sitti Aisyatul,Vizcha}. Detail: [[coordinator-access]] / Changelog "Peran Koordinator".

- **Sesi 2026-07-10 → 2026-07-12 (SEMUA sudah push & live — commit `9266b34`):**
  - **Tanggal aktif pegawai** (`joined_on`/`left_on`, migrasi **0020**, sudah diterapkan ke DB live) +
    kolom "Masa Aktif" di Kelola Pegawai; **Dashboard keanggotaan HIBRIDA** sadar-periode.
  - **Trend KPI seragam** (`lib/trend.ts`) di Laporan Kinerja Tim / Monitor / Dashboard; **"KPI belum
    terbaca"** (unread) dikecualikan seragam dari rerata/kategorisasi (baris tetap tampil, 360° tetap dihitung).
  - **Scorecard + metrik tim bersama** (`lib/team-metrics.ts`); **Monitor** dirombak jadi dashboard SPV
    (scorecard + tabel + filter periode + 3 grafik tren; tanpa tinjau/Status/ACC; sertakan baris SPV sendiri).
  - **Label Skor Akhir `(live)` vs `(tersimpan)`** (Monitor/Dashboard = live; Laporan Kinerja Tim = finalisasi).
  - **Skor 360° per-aspek TERBOBOT** (dashboard + laporan per-pegawai) + **presisi 2 desimal**
    (`round1`→`round2`); dashboard 360 tambah heatmap Divisi×Aspek, donut, scorecard tertinggi/terendah.
  - ⚠️ **PENDING aksi HRD:** klik **"Hitung Ulang Skor 360°"** agar `result_360` tersimpan jadi 2 desimal.
  - **Belum diperbarui:** item **#3 `allow360Only`** (Monitor `true` vs Dashboard `false`) sengaja dibiarkan.
  - Skrip diagnostik read-only baru: `scripts/check-unread.mjs` (daftar pegawai "KPI belum terbaca").

- **Sesi 2026-06-30 → 2026-07-01 (SEMUA sudah push & live):**
  - **Peninjau Hasil Lintas Divisi** (grant `is_cross_reviewer`, migrasi 0018) — commit `0043678`.
  - **Opsi B pelaporan:** halaman **pelaporan** (Dashboard/Rekap/Monitor/Laporan-Tim/Review Hasil
    Akhir) tampilkan pegawai **aktif ATAU punya data di periode** (bukan `is_active` keras) → hasil
    kuartal pegawai resign akhir-periode tak hilang. Halaman **flag/siklus** (Kepatuhan/Progress/
    Penilaian/input-KPI) tetap **hanya aktif**. `setEmployeeActive` ikut toggle `mappings.is_active`.
  - **Minta Koreksi relasi untuk target Ad-Hoc** (buka UI-gate `penilaian/page.tsx`) — commit `0043678`.
  - **Hapus Matriks 9-Box dari dashboard** (4-Box **tetap**; `talentBoxOf`/tes di `lib/scoring.ts`
    **tetap**) + **radar aspek bernomor** (`report-doc.tsx`) + **F2/F4/F5** pengerasan nonaktif +
    **F3** badge "nonaktif" (dashboard tetap **per-periode**, anti survivorship bias) — commit `fb66d1a`.
  - **Pegawai nonaktif diblokir dari pemetaan** (import/create/bulk/copy) + guard `sendOnboarding`;
    nonaktif tak menerima undangan/pengingat — commit `a756cf5`.
  - **Ekspor 360° gabungan 1 file (2 sheet)** + **Ekspor Ringkasan Aspek Naratif** — commit `85408ad`.
  - **Tutup/Buka Form** (migrasi 0017 `form_open`), filter periode Monitoring ke Riwayat & Audit,
    **Hapus Periode**, lampiran panduan PDF per peran di email undangan (+ `/panduan` publik),
    fix `deleteMapping` rekonsiliasi `result_360` — commit `17e7f13`/`3627c55`/`597b4df`/`8e5f134` dst.
  - **Data trial:** 6 akun uji dihapus permanen via `scripts/delete-people.mjs` (commit `908a661`);
    backup pra-aksi di `backups/`.
  - **Keputusan terkunci (2026-06-30): TIDAK ada "page-builder" untuk HRD** (lihat Keputusan terkunci).

- **Riwayat sesi sebelumnya (ringkas — detail lengkap di Changelog):**
  - **2026-06-24:** penilai eksternal (`is_external`, migrasi 0016); fix dropdown nama login HP
    (`220f90d`); hapus Ad-Hoc + semua pemetaan **selalu wajib** + landing base → `/penilaian`
    (`f6e25f6`); UX form HP (gulir + reset zoom, `df017a1`).
  - **2026-06-23:** pengerasan form "Mulai Nilai" (auto-simpan draf, konfirmasi kirim, layar sukses,
    **esai wajib**, rating terbaca, rail responsif); banner Garis Hubungan; **REKOMENDASI.md**.
  - **Sesi lama:** alur visibilitas laporan bertahap (`draft→in_review→finalized`, migrasi 0011/0012);
    grant HRD (`is_hrd_admin`, migrasi 0013) + `canAdmin()`; jaring regresi L3 (`verify:rls` 21 assertion);
    heatmap KPI/divisi; palet warna skor terpadu (`lib/score-color.ts`); paritas SPV↔HRD-mode-SPV.
  - **Keputusan terkunci:** semua komentar (min 4 char) + semua esai **WAJIB** (kebijakan mutlak).

- **App sudah LIVE & berjalan (2026-07-01):** Undangan Massal terkirim → sandi unik per orang (✅).
- **Berikutnya (butuh aksi pengguna 🔑):** **rotasi `SUPABASE_SERVICE_ROLE_KEY`** (bila pernah
  ter-share saat dev); **backup rutin ke luar laptop**; (opsional) aktifkan Lupa Sandi via email untuk
  akun beremail asli. **Komunikasikan ke HRD** langkah "Rilis ke SPV".
- **Berikutnya (bisa digarap langsung):** branch protection GitHub (PR butuh CI hijau); tes Server
  Action (finalisasi/`releaseToSpv`/`setHrdAdmin`/ACC). Lihat **[TODO.md](TODO.md)** / **[BACKLOG.md](BACKLOG.md)**.

**File paling relevan:**
- Manajemen Akses (RBAC page_grants): `app/(app)/admin/akses/`, `lib/auth/roles.ts` (`grantedScope`/`grantedAccess`/
  `deptScopeFilter`/`GRANTABLE_PAGES`/`GRANTABLE_PAGE_KIND`), `app/(app)/admin/laporan/page.tsx` (SADAR-MODE +
  jalur grant review), `report-table.tsx` (prop `readOnly`), `app/(app)/app-shell.tsx` ("Akses dari HRD"),
  migrasi 0024/0025, `tests/page-scope.test.ts`
- Backfill 360° presisi tinggi: `scripts/import-360-backfill.mjs`, migrasi `0026_ais_rating_precision.sql`
- Laporan Hasil Saya lintas periode: `app/(app)/laporan/page.tsx`
- Peninjau lintas divisi: `app/(app)/peninjau/`, `lib/report.ts` (`loadCrossDivisionReport`), `lib/auth/roles.ts` (`canCrossReview`)
- Laporan & visibilitas: `lib/report.ts` (`loadReport`/`loadTeamReportForSpv`/`loadTeamReportForHrdSpv`),
  `app/(app)/laporan/`, `app/(app)/laporan-tim/`, `app/(app)/admin/laporan/` · RLS: migrasi 0012
- Dashboard: `app/(app)/admin/dashboard/` (`page.tsx` + `dashboard-visual.tsx`)
- Monitor Kinerja HRD: `app/(app)/admin/monitor/` (`page.tsx`/`monitor-filters.tsx`) · aspek per-pegawai: `lib/aspect360.ts`
- Laporan Kinerja Tim & Monitor: `app/(app)/laporan-tim/` (`team-table.tsx`/`scorecards.tsx`),
  `app/(app)/monitor/` (`page.tsx`/`monitor-trends.tsx`/`period-filter.tsx`/`extremes-heatmap.tsx`/
  `per-employee-heatmap.tsx`/`team-aspect.tsx`/`dist-bars.tsx`/`section-header.tsx`/`completeness.tsx`),
  `lib/team-metrics.ts`, `lib/trend.ts`
- Tanggal aktif pegawai: `app/(app)/admin/pegawai/` (`actions.ts`/`page.tsx`/`pegawai-client.tsx`), migrasi 0020
- Ekspor: `app/(app)/admin/ekspor/` (`actions.ts` + `ekspor-client.tsx`)
- Skor & tes: `lib/scoring.ts`, `lib/score360.ts`, `tests/`, `scripts/verify-rls.ts`, `.github/workflows/ci.yml`
- Izin/sesi: `lib/auth/roles.ts` (`canAdmin`), `app/(app)/layout.tsx`, `app/(app)/app-shell.tsx`, `app/login/`
- Email: `lib/email/mailer.ts`, `app/(app)/admin/progress/actions.ts` · Skema/RLS: `supabase/migrations/`
