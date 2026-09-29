# CHANGELOG — Infarm 360° Performance Appraisal System

> Rekap **tematik** perubahan penting — **rincian per item ada di git history & kode**. Bagian ini
> hanya menyoroti hal yang **tak terbaca dari kode**: invariant lintas-fitur, alasan keputusan, dan
> daftar migrasi. Status/sesi terkini → `STATUS.md`; sisa pekerjaan → **[TODO.md](TODO.md)** & **[BACKLOG.md](BACKLOG.md)**.

### Invariant & fitur inti (yang wajib dijaga)
- **Skor Akhir seragam di semua halaman** (audit 2026-09-29, keputusan HRD). Sebelumnya dihitung ulang di
  ±12 tempat dengan aturan berbeda (opsi `allow360Only` hanya di sebagian halaman; Dashboard sebagian tanpa
  punishment; ambang dicek atas nilai tak terbulat → 79.996 tampil "80.00" tapi dikelaskan <80; Laporan
  Tim menampilkan `final_score` tersimpan apa pun statusnya). Kini: `finalScoreOf` tunggal (tanpa KPI →
  360° saja di SEMUA halaman; hasil `roundScore` 2 desimal selaras `numeric(5,2)`), `kpiAvgOf` (presisi
  penuh, bulatkan di akhir — agar tak menggeser Skor Akhir yang sudah difinalisasi), klasifikasi
  (`playerClassOf`/`perfCategoryOf`/band) atas nilai terbulat, dan **`displayedFinalOf`**: laporan FINAL →
  angka tersimpan (yang dilihat pegawai) di Dashboard, Monitor, Laporan Tim, Rekap, Suksesi, Ekspor;
  hanya Review Hasil Akhir menampilkan "berubah → N" (`hasScoreDrift`, ≥0.01, menggantikan ambang 0.05).
  Dashboard: punishment selalu dipotong; mode "semua kuartal" = rata-rata Skor Akhir per kuartal.
  Dampak data (dicek read-only): tak ada kategori bergeser & tak ada laporan final ter-"berubah"; yang
  berubah hanya pegawai tanpa KPI (kini tampil skor 360°) & Laporan Tim tanpa laporan (kini angka hidup).
- **Visibilitas laporan bertahap** (`draft → in_review → finalized`, migrasi 0011/0012). Lapisannya:
  **L1** Skor Akhir · **L2** agregat (radar/aspek + ringkasan HRD, anonim) · **raw ANONIM**
  (`byAspect`/`essays` — komentar/rating verbatim TANPA nama) · **L3 BERNAMA** (`assessors` — identitas
  per penilai). **SPV lihat L1 sejak draft; L2 + raw ANONIM hanya setelah "Rilis ke SPV"; L3 BERNAMA
  TIDAK PERNAH** (diperluas 2026-07-15, lihat **Security Rules**); pegawai lihat laporannya saat
  `finalized`. Detail SPV/Koordinator/Direksi-tim dihitung server (`loadTeamReportForSpv`/
  `ForCoordinator`/`loadSpvReportForDireksi`, semua buang **hanya** `assessors`). RLS raw 360° tetap
  tertutup untuk SPV via API (0012 cabut `is_my_member`); paparan raw anonim murni app-level via `service_role`.
- **Izin HRD = grant, bukan posisi** (`is_hrd_admin`, migrasi 0013). Cek via `canAdmin()`/`is_hrd()`,
  bukan `role==='hrd'`. Dual-mode **Admin ↔ posisi-asli**; **default login = base**. **Paritas
  SPV↔HRD-mode-SPV wajib** (lihat blok PENTING di "Apa Ini").
- **Peninjau Hasil Lintas Divisi** (`is_cross_reviewer`, migrasi 0018). Grant **SENGAJA tidak** menyalakan
  `is_hrd()` → pemegangnya tetap pegawai biasa di RLS; akses lintas-divisi hanya via `service_role`
  (`loadCrossDivisionReport`, tegakkan "divisi target ≠ divisi peninjau"). Privasi **nyata**, bukan
  app-only — pola acuan untuk grant sensitif (lihat Keputusan terkunci).
- **Manajemen Akses — RBAC grant halaman berlingkup** (`page_grants`, migrasi 0024/0025, 2026-07-18..20).
  Model **beku** (disepakati pengguna): **1 grant = orang + halaman + lingkup + (boleh-edit?)**. Konsol
  `/admin/akses` (gate `isFullHrd`) memberi **akses ke halaman existing dari katalog TETAP**
  (`GRANTABLE_PAGES`) — **bukan** page-builder (lihat Keputusan terkunci). Katalog LIVE: `monitor`
  (pemantauan, lihat-saja) + `review` (administrator, Tahap 1 lihat-saja). Halaman `pemantauan` selalu
  lihat-saja (`can_edit` dinormalkan false); `administrator` punya dimensi edit (`can_edit`).
  - **INVARIANT ENFORCEMENT (wajib diikuti tiap halaman baru yang di-grant):** (1) gate **SADAR-MODE**
    `isHrdFull = canSection(page) && hrdMode==='admin'`; (2) jalur grant baca via **`service_role`**
    berlingkup (helper `grantedScope`/`grantedAccess`/`deptScopeFilter`/`applyDeptScope` di `roles.ts`,
    diuji `tests/page-scope.test.ts`) karena pemegang grant non-HRD ditolak RLS; (3) `?dept=` **TAK BISA**
    menembus lingkup (`resolveDept` fallback aman); (4) **aksi tulis TAK diubah** = HRD-only sampai Tahap 2
    (grant lihat-saja → sembunyikan tombol tulis + blok halaman detail). ⚠️ Untuk pemegang **`is_hrd()`**
    (rekan HRD) ini **pembatasan TAMPILAN**, bukan gembok RLS; gembok nyata (grant tanpa `is_hrd()` +
    tulis via service_role cek `can_edit`) = Tahap 2/Fase lanjut. Detail memori: [[page-access-rbac]].
- **Peran Koordinator** (`is_coordinator` + tabel `coordinator_team_members`, migrasi 0021, 2026-07-12;
  **diperluas 2026-07-15**). Pegawai (role='employee') yang membawahi beberapa pegawai & diberi akses ke
  "Laporan Kinerja Tim" untuk **daftar eksplisit** yang dinaunginya (sebagian pegawai lain tetap langsung
  ke SPV). **Pola Peninjau:** grant **TIDAK** menyalakan `is_hrd()`/`is_my_member` → koordinator tetap
  pegawai biasa di RLS; seluruh data laporan dibaca via **`service_role`** berlingkup ke
  `coordinator_team_members`-nya + **L3 (bernama) selalu dibuang** (`loadTeamReportForCoordinator`, cermin
  `loadTeamReportForSpv`; sejak 2026-07-15 keduanya **menyisakan raw ANONIM** byAspect/essays).
  - **BISA (sejak 2026-07-15):** **meng-ACC** laporan pegawai naungannya (setelah rilis HRD; `setSpvAcc`
    cabang koordinator, reuse kolom `spv_acc`, guard laporan sudah dirilis) & **input KPI** (tab Input;
    `saveKpiAsCoordinator` via service_role, guard periode aktif + edit-wajib-komentar, audit
    `changed_by`=koordinator, upsert `onConflict 'employee_id,ym'` → **tak menumpuk**). **Konsekuensi
    paritas:** **SPV/HRD-mode-SPV** kini **hanya** ACC & input KPI pegawai **TANPA** koordinator (server
    tolak `role='spv'` utk pegawai berkoordinator; pegawai berkoordinator dikeluarkan dari daftar input
    SPV). SPV tetap **lihat status ACC** koordinator (read-only).
  - **TIDAK:** finalisasi (tetap HRD) & **TIDAK** memengaruhi 360° (bukan "Atasan" untuk skor). Detail L2
    (klik nama) tetap gerbang **rilis HRD** (in_review/finalized). Tabel ber-RLS (baca: HRD/koordinator
    ybs; tulis: HRD). UI: grant "Koordinator" + dialog "Tim Koordinasi" di Kelola Pegawai; menu base
    "Laporan Kinerja Tim" + "Input KPI". Menambah koordinator = **DATA, bukan kode** (HRD mandiri, tanpa deploy).
- **Toggle 360° (`has_360`) & Tutup/Buka Form (`form_open`, migrasi 0017)** = dua gerbang terpisah.
  Gerbang form pegawai = `has_360 && form_open`; guard tulis (`submitAssessment`/`addAdhocTarget`/
  `requestCorrection`) menolak bila salah satu mati. `form_open` menutup form **tanpa** membuang 360°
  dari skor.
- **Penilai eksternal** (`is_external`, migrasi 0016) = **penilai-saja** (relasi Cross); disembunyikan
  dari semua jalur **subjek** & tak boleh jadi target (berlapis).
- **Direksi = subjek 360° TERBATAS** (keputusan 2026-07-08): Direksi **boleh** dinilai 360° dan hasilnya
  tampil di **Review Hasil Akhir + Ekspor Rekap** (Skor Akhir dihitung murni dari 360° via
  `finalScoreOf(..., allow360Only=true)` karena Direksi tak pernah punya KPI). TAPI Direksi **tetap
  dikecualikan** dari Dashboard/4-Box, KPI, kepatuhan, monitor, laporan-tim (`​.neq('role','direksi')`
  di ~20 tempat itu **sengaja dipertahankan**). Jadi "Direksi bukan subjek" **tak lagi berlaku mutlak** —
  presisinya: subjek di Review+Ekspor, non-subjek di tempat lain.
- **Eskalasi laporan SPV→Direksi** (2026-07-09): laporan pegawai ditinjau SPV; laporan **SPV** ditinjau
  **DIREKSI**. Subjek yang ditinjau Direksi = **`isDireksiReviewSubject`** (bukan Direksi, non-eksternal,
  & **role='spv' ATAU memimpin tim** — mencakup HRD-posisi bertindak-SPV mis. Ulfa; BOD role='direksi'
  dikecualikan). Halaman "Laporan Kinerja Tim" Direksi = `DireksiTeamReport` (daftar subjek itu);
  detail via `loadSpvReportForDireksi` = **agregat L2** (`service_role`, buang L3). ACC Direksi **pakai
  ulang** kolom `spv_acc` (`setSpvAcc` sadar-peran: Direksi→`service_role`, cek target=SPV + sudah
  dirilis). **Direksi HANYA boleh meninjau laporan SPV** — laporan pegawai **non-SPV DITOLAK** di
  `laporan/[employeeId]` (app-level; RLS Direksi belum diperketat — hardening terpisah bila perlu).
  Baris **"Anda"** (laporan diri sendiri) **dihapus** dari Laporan Kinerja Tim SPV & HRD-mode-SPV →
  SPV lihat laporannya sendiri hanya via **"Laporan Hasil Saya"** saat `finalized`. Laporan Kinerja Tim
  kini menampilkan kolom **KPI & Skor 360°** (L1, via `scoreMaps` service_role) sebelum Skor Akhir.
  Finalisasi tetap milik HRD; ACC non-blok. **Tanpa migrasi / tanpa ubah RLS.**
- **Review Hasil Akhir Direksi (read-only)** (`/review-hasil` + `/[employeeId]`, `loadReportForDireksiReview`,
  2026-07-09): permukaan **kedua** Direksi (terpisah dari Laporan Kinerja Tim). Lingkup **SEMUA pegawai**
  (termasuk non-SPV & diri sendiri), kedalaman **L2 + raw feedback ANONIM** (byAspect/essays + ringkasan
  aspek & kualitatif), **semua status termasuk draf**. **TANPA** Hitung Ulang / Rilis / Finalisasi / edit
  ringkasan / ACC — murni tinjauan; hanya **lihat status ACC**. L3 bernama dibuang (`assessors:[]`). Baca
  via `service_role` (pola Peninjau). Beda dgn blok Direksi di `/laporan/[employeeId]` (jalur SPV-only ACC)
  — dua permukaan sengaja terpisah.
- **Ringkasan naratif HRD = 2 jenis** (`final_reports.content`): `aspectSummaries` (per aspek 360°, lama)
  & `qualSummaries` (per **pertanyaan kualitatif**/esai, 2026-07-09). Editor/tampilan dipakai ulang
  (`AspectSummaryEditor`/`AspectSummaryView` digeneralisasi prop `title`/`intro`/`noun`); simpan lewat
  `saveQualSummaries` (HRD) / `saveCrossQualSummaries` (Peninjau). Penyimpanan **merge** `{...content,
  <kunci>}` → dua jenis **tak saling menimpa**. Tampil di jalur HRD/SPV/Direksi/pegawai/peninjau & ikut
  **Ekspor Ringkasan Naratif** (dibedakan kolom `jenis`).
- **Pegawai non-aktif**: tak jadi subjek (`.eq('is_active', true)` di jalur flag/siklus) & diblokir dari
  pemetaan + email undangan/pengingat. Halaman **pelaporan** (Opsi B) tetap tampilkan yang **aktif ATAU
  punya data di periode** (anti-hilang data pegawai resign).
- **Form penilaian**: auto-simpan draf (debounce 5s), **semua esai WAJIB** (kebijakan mutlak),
  konfirmasi kirim + layar sukses, `key={targetId}` cegah kebocoran state antar-target.
- **Edit KPI bulan sama WAJIB komentar audit** (ditegakkan server, bukan hanya label).
- **Hapus KPI ber-audit** (`deleteKpiScore`, migrasi 0019, 2026-07-09): SPV & HRD-mode-SPV boleh
  MENGHAPUS skor KPI tim/diri (RLS `kpi_write for all` sudah cakup DELETE — tak perlu policy baru).
  **Alasan WAJIB**, guard periode aktif, DICATAT di `kpi_audit` (`action='delete'`, `score`=nilai lama).
  Riwayat & Audit menandai **"dihapus (dari X)"**. Boleh saat laporan `finalized` (drift badge menangani;
  paritas dgn perilaku edit KPI).
- **Standar KPI per kuartal** (`kpi_standard`, migrasi 0010) & semua dashboard/heatmap/trendline =
  **murni pelaporan** — TIDAK menyentuh rumus di `lib/scoring.ts`.
- **Tanggal aktif pegawai + keanggotaan Dashboard HIBRIDA** (`employees.joined_on`/`left_on`, migrasi
  0020, 2026-07-10). `joined_on` auto-isi (`created_at`/hari ini), `left_on` di-stamp saat dinonaktifkan
  (dikosongkan saat diaktifkan lagi); keduanya bisa dikoreksi HRD di Kelola Pegawai (kolom "Masa Aktif").
  Dashboard kini memilih anggota per-periode via **irisan masa kerja × rentang periode** (`joined_on ≤
  end_date` DAN (`left_on ≥ start_date` bila diisi, else fallback `is_active`)) **ATAU** punya data
  KPI/360° di kuartal itu (jaring pengaman) → filter kuartal lampau tetap menampilkan pegawai yang kini
  resign. **Murni pelaporan** — tak menyentuh `lib/scoring.ts`.
- **Trend KPI seragam + "KPI Belum Terbaca"** (`lib/trend.ts` `trendOf`, 2026-07-10). Satu sumber
  definisi trend 3-bulan (6 kategori: empty/unread/stable/up/down/volatile) dipakai di **Laporan Kinerja
  Tim, Monitor, & Dashboard** (kolom Trend KPI + tooltip). **"Belum terbaca"** = data kuartal belum
  menggambarkan fluktuasi, **bukan** kinerja rendah → **dikecualikan seragam** dari rerata &
  kategorisasi KPI/Skor Akhir di ketiga permukaan (baris tetap tampil; **360° tetap dihitung**); Dashboard
  4-Box menampilkannya sebagai bucket terpisah "Belum Terbaca". Input `trendOf` **selalu 3 bulan pertama**
  `period_months` terurut (null = bulan belum diisi). Murni pelaporan.
  - **DIUBAH 2026-09-29 (definisi HRD):** KPI **kosong** = belum ditetapkan; **0 = nilai sungguhan**.
    Trend kini ditentukan **jumlah bulan terisi**: 0 → `empty` · 1 (2 bulan kosong, mis. pegawai masuk
    bulan ke-3) → `unread` · 2 (bulan-1 kosong = pegawai baru; bulan-3 kosong = resign / kuartal berjalan)
    → Stabil (selisih ≤2) / Naik / Turun dari dua bulan itu · 3 → aturan lama (Fluktuatif hanya di sini).
    Aturan lama "bln-1=0 & bln-2=0 → Belum terbaca" **dihapus**. Pengecualian "belum terbaca" kini juga
    diterapkan per (pegawai × kuartal) di grafik **tren tahunan**, **distribusi per kuartal**, dan
    Dashboard mode **semua kuartal** (`lib/dashboard/aggregate.ts`) — sebelumnya hanya kartu kuartal
    terpilih. Rumus Skor Akhir **tak berubah** (rerata bulan terisi; 0 ikut, kosong tidak).
- **Metrik tim bersama + Skor Akhir "live vs tersimpan"** (`lib/team-metrics.ts`, 2026-07-10).
  `scoreMaps`/`companyAverages`/`teamAverages`/`penaltyMap` dipakai bersama **Laporan Kinerja Tim** &
  **Monitor** (scorecard Total/Avg-KPI/Avg-360° + selisih vs perusahaan). **Laporan Kinerja Tim** tampilkan
  Skor Akhir **tersimpan** (`final_reports.final_score`); **Monitor & Dashboard-Tabel** tampilkan Skor Akhir
  **live** (`finalScoreOf`, di Monitor `allow360Only=true`) → header/footnote diberi label `(tersimpan)`/
  `(live)` agar tak dikira tak konsisten (angka memang bisa beda bila laporan difinalisasi sebelum Hitung
  Ulang). `team-table` prop `scoreBasis`; Monitor = dashboard SPV (tanpa tinjau/Status/ACC, **sertakan baris
  SPV sendiri**, filter periode + 3 grafik tren lintas periode/bulan via `monitor-trends.tsx`).
- **Skor 360° per-aspek TERBOBOT + presisi 2 desimal** (2026-07-10). Skor per-aspek di Dashboard
  (`admin/dashboard/page.tsx`) & laporan per-pegawai (`lib/report.ts`) kini pakai `weightedScore360`
  (bobot per kelas penilai, Self dikecualikan) — selaras Skor 360° headline, **bukan** rerata polos lagi.
  `lib/score360.ts` `round1`→**`round2`** (2 desimal) untuk `result_360` tersimpan; tampilan `.toFixed(2)`
  menyeluruh. ⚠️ Skor `result_360` lama masih presisi 1-desimal sampai HRD klik **"Hitung Ulang Skor 360°"**.
- **Banner "Skor 360° basi"** (migrasi 0014 `reviewed_at`): deteksi penilaian diubah / koreksi relasi
  di-ACC setelah `computed_at` → ingatkan Hitung Ulang.
- **Deadline penilaian 360° + potongan keterlambatan** (migrasi 0036, 2026-09-18; keputusan pengguna).
  Form **tidak** ditutup otomatis; status On Time / Late = **`first_submitted_at`** (diisi TRIGGER dari
  jam server DB, immutable; `submitted_at` lama tertimpa tiap edit ulang jadi tak bisa dipakai) vs
  `periods.assessment_deadline` (input WIB di Kelola Periode). Penilaian terlambat **tetap dihitung**
  untuk yang dinilai. Penilai dengan ≥1 penilaian **Wajib** terlambat → potongan **FLAT −3** pada **Skor
  360° MILIKNYA** (bukan Skor Akhir, bukan per penilaian), **otomatis**; tak punya Skor 360° → gugur.
  Tak dihitung: Opsional/Ad-Hoc, Paksa Selesai HRD (`forced_by_hrd`, diisi trigger), pemetaan dibuat
  sesudah deadline. HRD bisa **mengecualikan** (`late_penalty_waivers`, alasan wajib, ter-audit) di Flag
  Kepatuhan. **`result_360.score` = SETELAH potongan** (semua pembaca otomatis ikut) · `score_raw` =
  rumus murni · `late_penalty`. Diterapkan saat Hitung Ulang 360°, ubah deadline, ubah pengecualian, dan
  saat penilai kirim terlambat (`refreshLatePenalties`). Rumus murni: `lib/late.ts` (diuji `tests/late.test.ts`).

### Fitur pendukung (ringkas)
- **Token Redesign UI — restyle per-halaman ke design system** (2026-08; **murni presentasi**, tak
  menyentuh logika/RLS/rumus/parity/state). Migrasi tampilan dari "template dashboard AI" ke **token**
  di `app/globals.css` (blok `@theme` + utility **`.data-value`**/`.mono` = IBM Plex Mono untuk semua
  angka/ID). Acuan: Kelola Siklus Periode + sidebar. Aturan lengkap (brand hanya primary/aktif;
  status = soft-tint via `StatusChip`; border/radius token; tanpa shadow kecuali mengambang; primitif
  `Panel`/`Button`/`OverflowMenu`) **terkunci di CLAUDE.md "Design System — Token Redesign (2026-08)"**.
  - **Pemetaan warna semantik → token** (invariant konsistensi): **brand**=primary/aktif/positif ·
    **warn**=peringatan/pending/"Wajib" · **danger**=error/hapus/wajib-isi · **neutral**=nonaktif.
    Chart/2-seri: Rekan/utama=**brand**, pembanding (Self)=**warn** (hex SVG diselaraskan ke `--color-*`).
  - **Halaman ter-token (per commit):** sidebar+Periode(acuan)/Pertanyaan/Bobot/Pemetaan/Progress/
    Kepatuhan/Akses/Pegawai/Promosi (s/d `8f5944d`) · Struktur+Monitoring-Audit KPI (`d970142`) · Log
    Aktivitas+Ekspor (`918c28c`) · Dashboard **chrome** (`13fd383`) · Monitor SPV&HRD **chrome**
    (`77ffbd4`) · Isi 360° Feedback + Laporan Hasil + Akun Saya (`162bc8e`).
  - **Dikecualikan atas permintaan pengguna (konten berwarna dibiarkan):** `dashboard-visual.tsx`
    (sub-tab Kompilasi/KPI/360/Tabel) & analitik Monitor dari section "Ringkasan" ke bawah
    (`monitor-trends`/`extremes-heatmap`/`per-employee-heatmap`/`dist-bars`/`team-aspect`/`section-header`).
  - ⚠️ **Gotcha paritas:** `laporan-tim/team-table.tsx` & `scorecards.tsx` **dipakai bersama Monitor** →
    restyle Laporan Kinerja Tim (belum) akan mengubah Monitor juga; jaga pengecualian di atas.
  - **Sisa belum di-token:** Laporan Kinerja Tim, Review Hasil Akhir, Beranda, Login/Auth, `loading.tsx`
    (lihat [TODO.md](TODO.md) "Token Redesign UI").
- **Analitik Monitor Kinerja & Dashboard — pendalaman** (2026-07-16..18, commit `2b01e93`; **TANPA
  migrasi** — seluruhnya penyajian dari data terkomputasi, rumus terkunci tak disentuh). Menutup audit
  UX (kesan per peran / janggal / kurang informatif / usulan chart 1–5).
  - **Monitor Kinerja Pegawai HRD (BARU):** `app/(app)/admin/monitor/` (gate `canSection 'dashboard'` →
    hanya HRD; Direksi ditunda sampai fitur atur-akses) = cermin Monitor SPV utk seluruh internal, baca
    via `createAdminClient` + `fetchAllByIds`/`fetchAllPaged`. Filter **periode+divisi** (`monitor-filters.tsx`);
    scorecard/tren/**movers ikut filter** (bukan halaman tabel); tabel 5/hal; **delta divisi-vs-org**
    (`companyAverages`). Menu "Monitor Kinerja Pegawai" di `app-shell.tsx` (section `dashboard`).
  - **"Penyebab Perubahan":** Δ rata-rata antar-periode diurai jadi **skor pegawai konsisten** (kohort)
    vs **perubahan komposisi** (masuk/keluar) — **identitas eksak** `total = real + cohort`. Kartu di
    Monitor (`monitor-trends.tsx` `CauseBlock`), **tooltip Δ selaras** di Dashboard (`moveTooltip`, istilah
    disamakan). **Pergerakan 360° per-aspek** (di aspek mana naik/turun) + toggle "Lihat semua" (default 3).
  - **Heatmap aspek & indikator per-pegawai** (`per-employee-heatmap.tsx`) + **donut frekuensi
    terlemah/terkuat** (`extremes-heatmap.tsx`, 4 teratas + "Lainnya", maks 5 irisan) **di atas** heatmap;
    **klik irisan → heatmap tersaring** (baris yg ekstremnya di kolom itu). Skor per-aspek & per-indikator
    per pegawai dihitung 1-pass di `lib/aspect360.ts` (`aspectScoresByEmployee`, metodologi 360° resmi
    terbobot/Self-dikecualikan). Palet selaras Dashboard (`heatColor`); 5/hal + cari. ⚠️ **fix hydration:**
    koordinat `donutArc` dibulatkan 3 desimal (Math.cos/sin beda ~1e-14 Node↔browser).
  - **Profil Aspek tim + pembanding "vs organisasi"** (`team-aspect.tsx`; `orgAspectAverages`/
    `aspectAveragesFrom` di `lib/aspect360.ts`): garis rata-rata org + chip Δ per aspek. HRD `Semua divisi`
    → tanpa pembanding (lingkup = org; hindari query ganda & Δ ±0).
  - **Penataan section berhierarki** (`section-header.tsx`, aksen emerald/indigo/amber/slate) di Monitor &
    tiap sub-tab Dashboard (Ringkasan → Komposisi/Distribusi → Arah → Rincian). **DistBars** (`dist-bars.tsx`)
    diseragamkan ke **4 kategori** Dashboard; **kelengkapan data** jadi baris di bawah scorecard (`completeness.tsx`
    `FilledNote`, gantikan kartu penuh).
  - **Dashboard Organisasi:** **Scatter KPI×360°** (kuadran ambang 80) + **distribusi kategori per kuartal**
    (`QuarterlyDist`, arah talenta) + **legenda ambang**; coaching `<85`→`<80`; **hapus banner judul** tab
    KPI/360 (komponen `Banner` dibuang); **tabel 10/hal + pager**; sub-judul tujuan + tautan silang ke Monitor.
    `page.tsx` query tahunan dipaginasi (`fetchAllByIds`) + `quarterlyDist` per-kuartal (via `finalScoreOf` tanpa punishment).
- **Ekspor Log Aktivitas HRD → Excel** (2026-07-16). Kartu baru di Ekspor Dataset (`exportHrdAuditLog`
  di `admin/ekspor/actions.ts` + `ekspor-client.tsx`): dataset **lintas-periode** dari `hrd_audit_log`
  (waktu/pelaku/kategori/aksi/ringkasan/target/detail-meta, terbaru di atas), **paginasi `.range()`**
  karena log tumbuh >1000 baris. Read-only.
- **Bulk-finalisasi laporan ber-ACC** (2026-07-16). Tombol "Finalisasi Semua Ber-ACC (N)" di Review
  Hasil Akhir (`bulkFinalizeAccepted` di `admin/laporan/actions.ts` + `bulk-finalize-button.tsx`):
  finalisasi sekaligus semua laporan `spv_acc=true` & `status='in_review'` (Skor Akhir dihitung ulang
  via `computeFinal`; skip bila KPI & 360° kosong). ConfirmDialog + peringatan bila Skor 360° perlu
  Hitung Ulang. HRD-only, audit `report.bulk_finalize`. **Tanpa migrasi** (reuse kolom `spv_acc`/status).
- **Dashboard 4-Box — kecualikan data single-axis** (2026-07-16). Saat 360° aktif, pegawai yang baru
  punya SATU sumbu (KPI saja / 360° saja) tak diklasifikasi A/B/C (cegah "lompat" saat sumbu kedua masuk)
  → bucket "Data Belum Lengkap (1 Sumbu)" + badge Tabel "—*". Saat 360° nonaktif tak berubah. **`playerClassOf`
  (terkunci) TIDAK disentuh** — pengecualian app-level di dashboard saja (`page.tsx` `axisIncomplete`,
  `dashboard-visual.tsx`). Murni pelaporan; rumus/tes tak berubah.
- **"Laporan Hasil Saya" lintas periode** (2026-07-20, `b89e98a`). Laporan `finalized` tetap dapat diakses
  **setelah periode ditutup**: halaman (`app/(app)/laporan/page.tsx`) memuat semua laporan final + **pemilih
  periode** (pil, default periode final terbaru). RLS `fr_read` (0002) memang tak bergantung periode aktif —
  hanya logika halaman yang tadinya membatasi ke periode aktif. Fix hitung sinkron "laporan belum
  difinalisasi" dialog Kunci&Akhiri (`activePeriodReadiness` + `.eq('is_external', false)`, `451d90e`).
- Onboarding email + **sandi unik per orang**; pengingat 360° (Gmail SMTP / Resend, dorman bila env kosong).
- Akun Saya (ganti sandi mandiri, semua peran). Konfirmasi in-app `ConfirmDialog` (~8 titik).
- Kelola Pertanyaan: aspek + "Pakai Pertanyaan Periode Sebelumnya" (idempoten). Hapus Periode (cascade
  360° + KPI bulan unik; wajib ketik `HAPUS`).
- Ekspor dataset **dikonsolidasi jadi 4 file multi-sheet** (2026-07-12, hilangkan unduhan ganda):
  **Pegawai (Master)** · **Konfigurasi Periode Lengkap** (Ringkasan/Bobot/Bulan KPI/Aspek/Esai/**Pemetaan**) ·
  **Kinerja Lengkap** (Rekap/KPI Bulanan/Audit KPI/Punishment) · **Penilaian 360° Lengkap**
  (**Ringkasan per Pegawai** + Kuantitatif + Kualitatif + Ringkasan Naratif HRD, anonim). Semua `exportX`
  di `admin/ekspor/actions.ts` tetap; dirangkai jadi multi-sheet di klien. **`exportRekap` & ekspor lain
  kini 2 desimal (`r2`)** — sebelumnya `r1` (1 desimal) memotong nilai mis. `X,04`→`X,00`. `exportSummary360`
  = ringkasan 360° per pegawai (jml penilai per kelas dari mappings; Nilai Atasan/Internal/Self skala 1–5;
  Nilai 360° terbobot; Gap Self−Others; Skala 100) — dihitung LIVE via `weightedScore360` (Jml Penilai =
  penilai non-Self yang dipetakan; konsisten internal `nilai_360×20=skala_100`).
- Palet warna skor terpadu (`lib/score-color.ts`), indikator tenggat periode, empty-state berpandu.
- **Log Aktivitas HRD — paginasi server 10 baris/hal** (`admin/audit/`, 2026-07-15): baca `searchParams
  {page,cat,q}`, `.or()` ilike (needle disanitasi `[,()*:%\\]`→spasi), `.range()` + `count:'exact'`; pager
  prev/next. Hemat egress (tak lagi tarik seluruh log ke klien). **Audit KPI** dirombak jadi `FlatAudit[]`
  **terbaru-di-atas** (`changed_at` desc) + kolom Pegawai — bukan dikelompokkan per pegawai.
- **Layout Dashboard Analisis 360°** (2026-07-15): "Tren 360° per Kuartal" & "Evaluasi Budaya Sub-Aspek"
  ditata **sejajar** (`grid lg:grid-cols-2`). Grafik garis (`TrendLine` dashboard & `LineChart` Monitor)
  diberi **padding kiri lebih lebar + label titik tepi rata-dalam** (pertama=start/terakhir=end) agar label
  nilai/sumbu tak menembus sumbu-Y (2026-07-16).
- Dihapus dari dashboard (atas permintaan): **Matriks 9-Box** & **Papan Suksesi/Promosi** — namun rumus
  `talentBoxOf`/`kpiBandOf`/`s360BandOf` di `lib/scoring.ts` **TETAP ADA & teruji** (jangan dihapus).

### Skema DB (migrasi) — semua diterapkan & diverifikasi
- `0005` audit log HRD (append-only) · `0006` `indicators.description`/`rating_guide` · `0007` 10 indeks FK.
- `0008` `is_spv()` + RLS SPV tulis KPI diri sendiri · `0009` SPV baca laporan diri (termasuk draf).
- `0010` `periods.kpi_standard` (pelaporan, bukan ambang rumus).
- `0011` enum `report_status` +`in_review` (⚠️ terapkan terpisah dari 0012) · `0012` cabut `is_my_member`
  dari `asmt/ais/aqa_read` (tutup kebocoran L3 ke SPV).
- `0013` `is_hrd_admin` + `is_hrd()` = `role='hrd' OR is_hrd_admin`.
- `0014` `relation_correction_requests.reviewed_at` (deteksi skor basi).
- `0015` `mappings.is_adhoc` · `0016` `employees.is_external` · `0017` `periods.form_open` ·
  `0018` `employees.is_cross_reviewer` · `0019` `kpi_audit.action` (`set`/`delete`, utk Hapus KPI ber-audit) ·
  `0020` `employees.joined_on`/`left_on` (tanggal aktif; keanggotaan Dashboard hibrida — pelaporan, non-rumus) ·
  `0021` `employees.is_coordinator` + tabel `coordinator_team_members` (peran Koordinator: Laporan Kinerja
  Tim + sejak 2026-07-15 ACC & input KPI naungannya; pola Peninjau, grant non-RLS + service_role berlingkup) ·
  `0022` `assessment_indicator_scores.rating` smallint → **numeric(3,2)** (pelebaran aman/aditif; rating
  bulat lama tetap valid, CHECK 1–5 rentang tetap; mendukung backfill nilai aspek 360° DESIMAL mis. hasil
  eksternal Q1 2026).
- `0023` `employees.hrd_sections text[]` (akses HRD granular per-bagian, NULL=penuh — Jalur A batas MENU;
  helper `canSection`, katalog 11 bagian) · `0024` tabel `page_grants` (employee_id, section, scope,
  unique(employee_id,section)) + RLS self-read — RBAC grant halaman berlingkup (Manajemen Akses) ·
  `0025` `page_grants.can_edit boolean default false` (dimensi EDIT utk halaman administrator; pemantauan
  selalu false) · `0026` `assessment_indicator_scores.rating` numeric(3,2) → **numeric(8,6)** (aditif/aman;
  presisi tinggi backfill Looker Q1 — mendukung desimal berulang mis. `4.727273`). Semua diterapkan ke DB live.
- `0036` `periods.assessment_deadline` · `assessments.first_submitted_at`/`forced_by_hrd` + trigger
  `assessments_stamp_submit` · `result_360.score_raw`/`late_penalty` · tabel `late_penalty_waivers` (RLS
  baca berjenjang, tulis HRD). ⚠️ **Belum diterapkan** ke DB (terapkan sebelum merge ke `main`).
- `0041` **Pengetatan RLS hasil audit (2026-09-29)** — celah "lewat API langsung" (anon key + JWT
  sendiri melewati Server Action): (1) `asmt_write` kini **wajib pemetaan aktif** (termasuk Ad-Hoc
  disetujui) — sebelumnya pegawai bisa menyuntik nilai untuk rekan mana pun (dihitung sbg 'Peer');
  (2) trigger `assessments_keep_submitted`: penilai non-HRD **tak bisa menurunkan ke draf / menghapus**
  penilaian terkirim (edit & kirim ulang tetap boleh; tombol "Simpan Draf" juga disembunyikan setelah
  terkirim + ditolak di `submitAssessment`); (3) trigger `final_reports_guard_non_hrd`: SPV via
  `fr_spv_acc` **hanya boleh ubah `spv_acc`** & hanya setelah dirilis (sebelumnya bisa ubah
  final_score/status/content); (4) `kpi_write` **hanya bulan periode aktif** (KPI periode terkunci tak
  bisa diubah lewat API); (5) `asmt_read`/`ais_read`/`aqa_read` **cabut cabang target** — pegawai dinilai
  tak lagi membaca baris mentah + identitas penilai (Laporan Hasil Saya kini dimuat via service_role,
  tetap dibatasi laporan FINAL miliknya). `verify:rls` diperluas untuk tiap poin. Data historis Q1 2026
  (51 penilaian sintetis backfill, tanpa pemetaan) tak terdampak (periode tutup, jalur service_role).
  ⚠️ **Belum diterapkan** ke DB.
- `final_reports.content` (jsonb lama) dipakai untuk `aspectSummaries` **&** `qualSummaries`
  (ringkasan pertanyaan kualitatif) — tanpa migrasi baru.

### Infra / Testing / CI
- **⚠️ Batas 1000-baris PostgREST (`db.max_rows`) — bug "salah diam-diam" kelas berbahaya (2026-07-08).**
  Query `.in()`/tabel besar **tanpa `.range()`** diam-diam terpotong di 1000 baris (tanpa error). Ditemukan
  di **dua tempat** & diperbaiki dgn paginasi + chunking id (150/req, cegah URL `.in()` >16KB):
  (1) **Ekspor 360°** (`exportAssessments`/`exportQualAnswers`) — ekspor cuma 1000 dari ~4500 baris.
  (2) **`computeResult360`** (`admin/360/actions.ts`) — **KRITIS**: rating 360° terbaca cuma 1000 dari 4500
  → Skor 360° dihitung dari data terpotong → **51 dari 52 pegawai skornya SALAH** (mis. Nashirul tersimpan
  100, seharusnya 74). Skor 360° = 50% Skor Akhir → merambat ke Review/Dashboard/4-Box/laporan. **Data mentah
  AMAN** (assessments/rating utuh); hanya `result_360` (turunan) yang salah → sembuh dgn Hitung Ulang.
  Deteksi "skor basi" hanya cek WAKTU (`submitted_at`>`computed_at`), **bukan kebenaran** skor → bug ini lolos
  tanpa badge. **Pelajaran:** query enumerasi apa pun yg bisa tumbuh >1000 baris WAJIB paginasi.
- **Vitest 99 tes** (skor `lib/scoring.ts`/`lib/score360.ts` + trend `lib/trend.ts` + parsing impor
  `lib/import/parse.ts` + **otorisasi/guard Server Action & `roles.ts`** via mock Supabase
  `tests/helpers/mock-supabase.ts`, 2026-07-16); **CI** (test+typecheck+build tiap push/PR). Rincian di **Pengujian**.
- **`npm run verify:rls`** — 21 assertion (kpi_scores + L3 tertutup untuk SPV); manual, tak di CI.
- Skrip operasional: `backup.mjs`/`restore.mjs` (dump 22 tabel), `reset-*.mjs`, `apply-migration.mjs`
  (pola `npm install --no-save pg`). `xlsx@0.20.3` (CDN, tutup advisory high). Arsip legacy `src/` dihapus.
- **⚠️ Backfill 360° Q1 2026 (dinilai eksternal, di LIVE 2026-07-15) — data, bukan kode.** Migrasi **0022**
  (`rating`→numeric(3,2)) → set `has_360=true` Q1 + `result_360` headline eksak + **penilaian sintetis**
  (anchor=Direksi sbg assessor) utk 5 aspek budaya → tampil di Dashboard organisasi (headline + per-aspek).
  50 pegawai. **Q1 tak punya skema bobot → dashboard pakai rerata polos** (bukan `weightedScore360`).
  **JANGAN klik "Hitung Ulang Skor 360°" utk Q1** (menimpa backfill). Backup pra-aksi di
  `backups/backup-2026-07-15T09-45-48-694Z`. Sumber lokal `BACKFILL-360-Q1.csv` & skrip `_backfill-q1.mjs`
  **tidak di-commit**.
- **⚠️ Backfill 360° Q1 presisi tinggi (Looker) — di LIVE 2026-07-20, `383b745`.** Menuntaskan selisih
  ~0.04 vs Looker dari backfill 0022: migrasi **0026** (`rating` numeric(3,2)→**numeric(8,6)**, aditif/aman)
  → skrip **reusable** `scripts/import-360-backfill.mjs` (`--apply`/`--create-missing`/`--period=`, dry-run
  default, laporan "PERUBAHAN NYATA vs DB", audit `score360.backfill`). Diimpor **250 rating aspek + 50
  headline** + **1 penilaian baru (Rosyid FT2026-068)** (FT2026-069/070/071 sengaja di luar). Heatmap aspek
  Q1 kini eksak (`aspek = rating×20`). Struktur Q1 tetap SINTETIS (1 anchor=Direksi, 1 indikator/aspek, tanpa
  skema bobot). ⚠️ **`result_360.score` = numeric(5,2)** → headline tetap 2 desimal (presisi tinggi hanya di
  rating aspek, penggerak heatmap). **JANGAN Hitung Ulang Q1**. Migrasi + skrip **di-commit**; CSV **tidak**
  di-commit (gitignore `BACKFILL-*.csv`). Backup pra-aksi `backups/backup-2026-07-20T03-38-29-707Z`.
