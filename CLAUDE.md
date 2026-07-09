# CLAUDE.md — Infarm 360° Performance Appraisal System

Panduan untuk Claude Code saat bekerja di repo ini.

> **Status terkini & catatan sesi** (potret cepat-basi: sedang dikerjakan, riwayat sesi, file
> paling relevan) → lihat **`STATUS.md`**. Sisa pekerjaan → **TO-DO & Backlog** di bawah. Rincian
> tiap fitur → **Changelog** di bawah. Catatan operasional trial/Q2 → **REKOMENDASI.md**.

---

## Apa Ini

Aplikasi web **penilaian kinerja (Performance Appraisal) 360° internal** untuk Infarm.
Bukan e-commerce — **tidak ada pembayaran, keranjang, stok, atau pengiriman barang.**

Empat peran pengguna (kolom `employees.role`; logika kewenangan di `lib/auth/roles.ts`):
- **Employee** — mengisi penilaian 360 Feedback, lihat laporan hasil sendiri.
- **SPV (Supervisor)** — input KPI bulanan tim (+ KPI dirinya sendiri), ACC laporan tim,
  monitor kinerja bawahan.
- **HRD Admin** — kelola siklus periode, pertanyaan (+ aspek), bobot penilai, mapping (termasuk
  **sifat wajib/opsional**), flag kepatuhan + **punishment** (pengurangan poin per kuartal),
  finalisasi Final Report, dashboard. Punya **mode ganda**: bisa bertindak sesuai posisi aslinya.
  > **PENTING (per 2026-06-19):** "HRD Admin" kini **IZIN (grant `is_hrd_admin`), bukan posisi**.
  > Seseorang berposisi `employee`/`spv` bisa **diberi izin HRD** tanpa kehilangan posisinya. Cek
  > kewenangan HRD via `canAdmin()` (`lib/auth/roles.ts`) / RLS `is_hrd()` (= `role='hrd' OR
  > is_hrd_admin`), **bukan** `role === 'hrd'` mentah. Dual-mode = **Mode Admin ↔ Mode posisi-asli**
  > (token cookie `hrd_mode`: `admin` | `spv`=base); **default login = base** (masuk Admin disengaja).
  >
  > **ATURAN PARITAS (wajib dijaga):** setiap perubahan/penyesuaian pada **role SPV** (mis. lingkup
  > tim, menu Supervisor, RLS/scope KPI, Laporan Kinerja Tim, Monitor, aturan ACC) **HARUS berlaku
  > sama untuk HRD Admin saat Mode-SPV** — pengalamannya wajib identik dengan SPV biasa. Cek titik
  > sentuh: `app-shell.tsx` (menu base), `kpi/` (`riwayat-view`/`rekap-view`/`InputTab`), `monitor/`,
  > `laporan-tim/`, `laporan/[employeeId]` (jalur `asSpv` + `loadTeamReportForHrdSpv`). Jangan
  > tinggalkan cabang `role==='hrd'` mode-SPV tertinggal saat mengubah perilaku SPV.
- **Direksi** — dashboard eksekutif, ACC promosi/suksesi, **tinjau & ACC laporan SPV** (Laporan Kinerja
  Tim, agregat L2). **Hanya** laporan SPV — laporan pegawai non-SPV ditolak.

Acuan fungsional lengkap: `PANDUAN Infarm 360 Portal.pdf`. Panduan pengguna: `CARA-PENGGUNAAN.md`.

## Status Saat Ini vs Target

> **PENTING:** Migrasi fungsional **selesai & live**. Next.js 16 + **Supabase aktif** (auth
> nyata, RLS penuh per peran, seed idempoten). `/` = gerbang auth; arsip SPA legacy sudah
> **dihapus** (route `/legacy`, `src/`). Live di Vercel (auto-deploy dari `main`).

**Kondisi sekarang (`as-is`):**
- **Stack:** Next.js 16 App Router (Turbopack, React 19, Tailwind v4, TS strict). Lib: `motion`,
  `lucide-react`, `xlsx`, `zod`, `nodemailer`, `vitest` (dev).
- **Supabase** (ref `beajoczjpywozavatzmf`): auth `@supabase/ssr`, **20 tabel** (migrasi
  `supabase/migrations/0001`–`0013`), RLS penuh per peran, seed idempoten (`scripts/seed.ts`).
- **Shell persisten** di route group `app/(app)/` — sidebar + landing per peran, sub-fitur
  sebagai tab (`?tab=`). Helper: `lib/supabase/server.ts` (`createClient` user-scoped/RLS vs
  `createAdminClient` service_role).
- **Semua fitur P1/P2/P3 dimigrasi** — siklus 360°, KPI, dashboard visual (4 sub-tab + filter
  Periode/Divisi), monitor, rekap, suksesi, laporan rinci+PDF, progress 360, koreksi relasi,
  impor Excel, ad-hoc, audit KPI, mode ganda HRD, Kelola Pegawai (CRUD via service_role),
  roster login dari DB.
- **CI aktif** (`.github/workflows/ci.yml`): test + typecheck + build tiap push/PR.
- Login: lihat `lib/auth/demo-users.ts` (= sumber seed). Sandi awal bersama (ganti per orang).

**Sisa pra-produksi:** sebagian besar **aktivasi env** (email pengingat 360° + reset sandi) &
kebersihan akun (email seed asli, sandi beda per orang, rotasi kredensial). Daftar lengkap +
status di **TO-DO & Backlog** di bawah.

Saat mengerjakan fitur, ingat: kerjakan di route Next.js `app/(app)/` (arsip SPA legacy `src/`
sudah dihapus).

---

## TO-DO & Backlog (kekurangan / pengembangan)

Daftar hidup & **sumber tunggal TO-DO** (perbarui saat ada perubahan). Status: ✅ selesai ·
🔄 sebagian · ⬜ belum. Item **butuh-aksi-pengguna** ditandai 🔑.

### Keamanan pra-go-live
- ✅ **Sandi awal seragam — TERATASI (2026-07-01):** **Kirim Undangan Massal sudah dijalankan** →
  tiap akun kini punya **sandi unik per orang** (otomatis di-set saat onboarding). App **sudah live &
  berjalan**. Celah impersonasi (inti integritas 360°) tertutup. (Tiap pegawai tetap bisa ganti sandi
  sendiri via Akun Saya.)
- ✅ **Self-service ganti sandi** (Akun Saya) — menutup risiko sandi bersama tanpa email.
- 🔑⬜ **Lupa Sandi via email** (dormant) — kode siap (`app/auth/lupa-sandi`, `/auth/callback`,
  `/auth/perbarui-sandi`); aktifkan dgn email asli + SMTP/Resend + `NEXT_PUBLIC_ENABLE_PW_RESET=true`.
- 🔑🔄 **Email seed `nama@infarm.test` → asli** — **Undangan Massal SUDAH terkirim & app live
  (2026-07-01)** → akun beremail asli (`@gmail.com`) sudah onboard dengan sandi unik. **Sisa:** bila
  masih ada akun placeholder (non-gmail/`@infarm.test`), ganti ke email asli lalu kirim undangan lagi
  agar ikut menerima notifikasi (onboarding trial di-filter `@gmail.com`; set `ONBOARDING_GMAIL_ONLY=false`
  untuk semua domain). Tanpa email asli, undangan/pengingat tak sampai → 360° tak terisi.
- 🔑⬜ **Rotasi kredensial** (`SUPABASE_SERVICE_ROLE_KEY` dll) sebelum produksi — service_role menembus
  seluruh RLS; bila pernah ter-share saat dev → bocor = seluruh data terbuka.
- 🔑🔄 **Cadangan data (backup) rutin** — **KRUSIAL & sering terlupa**. Supabase **free tier** nyaris
  tanpa backup otomatis → salah hapus/migrasi = **data satu kuartal hilang permanen**.
  - ✅ **Skrip backup+restore SELESAI & TERUJI (2026-06-25):** `scripts/backup.mjs` (non-destruktif,
    dump **22 tabel** = 20 publik + `auth.users`/`auth.identities` incl. sandi ter-hash → JSON ke
    `backups/backup-<stamp>/`) & `scripts/restore.mjs` (upsert generik: deteksi PK + jsonb + buang
    kolom generated otomatis; 1 transaksi+rollback; FK/trigger dimatikan via `session_replication_role`;
    wajib argumen folder + kata `PULIHKAN`; flag `--no-auth`). Pakai pola `npm install --no-save pg`
    → jalankan → `npm uninstall --no-save pg` (sama spt skrip reset). **Restore diuji idempoten** ke DB
    nyata: 2593 baris, jumlah baris cocok 100% (tanpa duplikat).
  - 🔑⬜ **SISA (aksi pengguna):** (a) **jalankan rutin** (akhir periode + sebelum migrasi/reset);
    (b) **salin hasil ke luar laptop** (Google Drive/eksternal) — aturan 3-2-1, backup di laptop saja =
    satu titik kegagalan; (c) **opsional otomatis terjadwal** (Windows Task Scheduler / GitHub Actions
    cron — belum dibuat). Ekspor Dataset Excel = cadangan parsial; dump penuh lewat skrip ini.
  - ⏰ **PENGINGAT Q2 (diminta pengguna 2026-06-25):** saat **periode Q2 berjalan**, tawarkan lagi
    **penjadwalan backup otomatis** — rekomendasi **GitHub Actions cron + artifact** (tak bergantung
    laptop nyala; perlu secret `SUPABASE_DB_URL` di GitHub). Belum mendesak di trial krn data berubah
    di momen kritis (akhir periode), bukan tiap menit.
- ✅ **Hapus arsip legacy** `/legacy` + `src/` — selesai (seed dilepas ke `scripts/seed-data.ts`).
- ✅ **Audit npm — `xlsx` (high)** — **SELESAI**. Di-upgrade ke `xlsx@0.20.3` dari CDN resmi
  SheetJS (`package.json` → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`); advisory
  prototype-pollution + ReDoS tertutup, API/kode impor tak berubah, `build`+`test` hijau.
  Catatan tetap berlaku: `npm audit fix --force` **DILARANG** (menurunkan Next 16→9). Sisa
  advisory `postcss` (moderate) transitif dari Next → biarkan, beres saat Next update.

### Fungsional bernilai tinggi
- 🔑🔄 **Pengingat email 360°** — terbangun, **DORMAN** (aktif bila env email diset).
  - **Aktif (per 2026-06-24):** Gmail SMTP di-set di Vercel (`SMTP_USER`=`infarmdataanalyst@gmail.com`
    +`SMTP_PASS`+`SMTP_FROM`, scope Production). Email pengingat **berfungsi**. Tombol "Buka Portal"
    di template menautkan ke **domain produksi Vercel `/login`** via `appBaseUrl()` (prioritas
    `NEXT_PUBLIC_APP_URL`→`VERCEL_PROJECT_PRODUCTION_URL`→host). Tombol "Kirim Pengingat" hanya
    muncul utk penilai **belum lengkap** (mandatory); server `sendReminder` tolak kirim bila 0 sisa.
  - **Anti-spam — alternatif plain-text:** `sendEmail` kini selalu mengirim **multipart** (HTML +
    teks); versi teks diturunkan otomatis dari HTML via `htmlToText` (tautan jadi "teks (url)").
    Menurunkan skor spam tanpa ubah pemanggil. Solusi spam **permanen** tetap domain sendiri + Resend
    (SPF/DKIM/DMARC). (Selesai 2026-06-25.)
- ✅ **Email "Undangan & Info Akun" (onboarding sekali di awal periode)** — **SELESAI** (2026-06-25).
  Tombol **terpisah** dari "Kirim Pengingat" di Progress 360: **"Undangan"** (per-orang) + **"Kirim
  Undangan Massal"** (konfirmasi). Email berisi **nama, peran, email (ID login), sandi, link `/login`,
  daftar belum dinilai, + panduan ringkas per peran** (`onboardingHtml`). "Kirim Pengingat" tetap (hanya
  daftar belum dinilai) untuk reminder berikutnya.
  - **Password = Opsi A:** karena Supabase simpan password sbg **hash satu arah**, onboarding **men-set
    sandi acak unik per orang** (`genPassword` → `admin.updateUserById`) lalu email memuat sandi itu.
    Sekaligus menuntaskan "sandi beda per orang". ⚠️ Kirim ulang = sandi **di-set ulang** → tombol
    disengaja + konfirmasi; kirim **sebelum** orang ganti sandi sendiri.
  - **Filter TRIAL — hanya `@gmail.com`** (`onboardingAllowed`): non-gmail/placeholder (`@infarm.test`)
    **DILEWATI tanpa mengubah sandi** (cegah akun terkunci dgn sandi tak terkirim). Default gmail-only;
    untuk produksi penuh set env **`ONBOARDING_GMAIL_ONLY=false`** agar semua domain ikut.
  - File: `sendOnboarding(id)`/`massOnboarding()` di `admin/progress/actions.ts`, `onboardingHtml(...)`
    di `lib/email/mailer.ts`, tombol di `progress-client.tsx`, audit `progress.onboarding`/`mass_onboarding`.
- ✅ **Ekspor Excel** dashboard/rekap — + **ekspor 360° gabungan 1 file (2 sheet)** & **ekspor
  Ringkasan Aspek Naratif HRD** (2026-07-01).
- ✅ **Deadline periode lebih tegas** — indikator sisa hari + peringatan.
- ✅ **Heatmap Capaian KPI per Divisi × Bulan** (dashboard tab Analisis Hasil KPI).
- ✅ **Review Hasil Akhir — tampilkan Direksi + pegawai ber-360° tanpa KPI** (diminta 2026-07-03,
  **SELESAI di lokal 2026-07-08 — TERVERIFIKASI ke data live, BELUM commit/deploy**). Direksi kini
  subjek 360° yang tampil di **Review Hasil Akhir + Ekspor Rekap** dengan Skor Akhir dihitung **murni
  dari 360°** saat KPI kosong; **TETAP dikecualikan** dari Dashboard/4-Box/KPI/kepatuhan.
  - **Cara scoping (penting):** `finalScoreOf` (`lib/scoring.ts`) diberi parameter **opt-in
    `allow360Only` (default false)** — cabang baru `kpiAvg==null && has360 && s360!=null → base=s360`.
    Default false = perilaku LAMA (KPI kosong→null), jadi **semua pemakai lain tak berubah** (Dashboard,
    Suksesi, Rekap SPV, laporan pegawai, Peninjau). Hanya **Review + Ekspor Rekap** yang mengirim `true`.
    Ini sebabnya tak perlu menyentuh ~8 pemakai `finalScoreOf` lainnya.
  - **File berubah:** `lib/scoring.ts` (+param) & `tests/scoring.test.ts` (58 tes hijau); Review list
    `admin/laporan/page.tsx` (hapus `.neq('role','direksi')` KHUSUS di sini; Direksi disaring `shownRows`
    → tampil hanya bila punya 360°, tak muncul sbg baris kosong krn aktif); guard `admin/laporan/actions.ts`
    (`saveOrFinalizeReport`/`releaseToSpv` tolak hanya bila `final==null`); detail `laporan/[employeeId]/
    page.tsx` (`liveFinal` + `canCompute` ikut 360°); `report-table.tsx` (badge "Tanpa KPI" di samping
    Tinjau); ekspor `admin/ekspor/actions.ts` `exportRekap` (hapus filter direksi + `allow360Only`).
  - **Verifikasi live (2026-07-08):** 1 Direksi (aktif, 360°=87.5, tanpa KPI) — sebelumnya Skor Akhir
    `null` & tak bisa ditinjau; kini `87.5` & muncul di Review + Ekspor. 0 pegawai non-Direksi
    ber-360°-tanpa-KPI (jadi dampak nyata = tepat 1 Direksi itu, tanpa efek samping tak terduga).
  - **TIDAK disentuh (sesuai keputusan):** Dashboard (`admin/dashboard/page.tsx:59` tetap `.neq('role',
    'direksi')`), `playerClassOf`/4-Box, KPI, kepatuhan, `exportEmployees`, `exportPeriodConfig`,
    `lib/report.ts` `loadReport` fallback (biar SPV/pegawai/Peninjau tak ikut berubah pra-final).
- ⬜ **Dashboard — kecualikan data single-axis dari 4-Box** (diusulkan 2026-07-08, **terpisah, belum
  dikerjakan**). Saat ini `playerClassOf` memperlakukan sumbu kosong sbg "<80", jadi pegawai yang 360°-nya
  **belum dihitung** bisa terlanjur diplot B-KPI/C lalu melompat ke A setelah 360° masuk (menyesatkan).
  Usulan: 4-Box hanya plot pegawai yang punya **KEDUA** sumbu (KPI & 360°). **Pertanyaan desain sebelum
  mulai:** apakah hanya 4-Box atau juga bar-chart KPI? apa definisi "lengkap"? Menyentuh area terkunci
  (`playerClassOf`/filter dashboard) → butuh keputusan + verifikasi tersendiri; JANGAN gabung ke perubahan lain.
- ⬜ **Ringkasan Aspek 360° otomatis (Claude API)** — REKOMENDASI, belum dibangun. Editor
  per-aspek sudah ada; tambah tombol "✨ Buat Ringkasan Otomatis" → Server Action kirim rating +
  komentar **anonim** (`data.byAspect`, tanpa nama) ke Claude → isi textarea (HRD edit & Simpan).
  - **Perlu:** `ANTHROPIC_API_KEY` server-only, `@anthropic-ai/sdk`, Server Action HRD-only,
    pola dorman (`NEXT_PUBLIC_ENABLE_AI_SUMMARY=true`). Model: `claude-haiku-4-5` (termurah).
  - **Biaya** (1 komentar ≈ 1.000 char ≈ 250 token; Haiku, kurs $1≈Rp16rb): ~**$0.04/pegawai**
    (skenario 100 komentar + 30 jawaban esai) → **~$2–4/kuartal untuk 50–100 pegawai**. Biaya
    hanya saat tombol ditekan. Sonnet ≈ 3×.
  - **Privasi:** komentar dikirim ke Anthropic (sudah anonim); retensi API 30 hari, bukan utk
    melatih model pada data bisnis. Perlu persetujuan kebijakan internal.

### Keandalan teknis
- 🔑⬜ **PASCA-DEPLOY fix 1000-baris (2026-07-08) — WAJIB Hitung Ulang Skor 360°.** Perbaikan
  `computeResult360` (paginasi) sudah di-deploy, TAPI 51 skor `result_360` yang terlanjur salah **belum**
  terkoreksi otomatis. Aksi HRD: (1) buka **Review Hasil Akhir / Bobot & Kalkulasi** → klik **"Hitung Ulang
  Skor 360°"** sekali → menimpa semua skor dgn yang benar; (2) laporan yg sudah **finalized** → kembalikan
  ke draf lalu finalisasi ulang agar Skor Akhir ikut terkoreksi. Verifikasi cepat: Nashirul harus jadi ~74
  (bukan 100). Lihat Changelog "Batas 1000-baris PostgREST".
- ⬜ **Cek pra-finalisasi tertunda (catatan 2026-06-23)** — Prioritas 1 (uji fungsional+keamanan di
  browser) **SUDAH lolos** (laporan pegawai agregat, ACC gating, guard ringkasan, SPV lihat laporan
  diri, wajib-komentar edit KPI, L3 aman). **Sisa yang BELUM dicek:**
  - **#8 Kelengkapan 360°** — baru ~3 pegawai submit; **jangan finalisasi periode** sebelum
    pengisian cukup (cek Progress 360 / dorong via pengingat). Data sesedikit ini → skor tak representatif.
  - **#9 Sanity Skor Akhir di data nyata** — verifikasi `Skor Akhir = blend(KPI,360) − punishment` untuk
    beberapa pegawai nyata.
  - **#10 Kunci & Akhiri Periode** — ✅ **ditegakkan**: semua aksi tulis (KPI `saveKpiScores`,
    360° `submitAssessment`/`discardAssessment`/`addAdhocTarget`/`requestCorrection`) keys ke
    `status='active'` → periode `ended` otomatis tertolak (RLS asmt_write juga cek active). Verifikasi
    fungsional cepat di browser masih disarankan, tapi guard server sudah ada.
  - **#11 Aktivasi periode baru** saat periode lama belum lengkap → peringatan konfirmasi muncul.
  - **#13 Uji beban k6** (`scripts/loadtest/`) sebelum buka ke ~100 pengguna (belum dijalankan).
  - **#14 Blank di HP** (URL Vercel) — di-skip pengguna; dugaan browser/OS HP lama; belum dikejar.
  - **#18 "Selanjutnya" macet di iPhone (MENUNGGU REPRODUKSI, 2026-06-26)** — saat mengisi 360° di
    iPhone, tombol **Selanjutnya** tak memindah indikator sampai user **Simpan Draf → keluar → masuk
    lagi**. Logika React benar (`goNext` = `curPos+1`, tak ber-gate, tombol tak disabled; jalan setelah
    reload) → **bukan bug logika**, melainkan **interaksi iOS Safari + keyboard**. Hipotesis: (1)
    keyboard menutupi tombol nav di bawah editor → tap tak kena; (2) tap pertama "dimakan" untuk menutup
    keyboard (blur). Saat kembali fresh tak ada kolom fokus → bisa. **Belum diperbaiki** (user tunggu
    pengguna coba lagi). Fix kandidat bila terkonfirmasi: nav pakai `onPointerDown` + blur proaktif,
    atau bar nav sticky di atas keyboard. Hanya bisa diverifikasi di iPhone fisik.
  - ✅ **#15 `npm run verify:rls`** pra-Q2 — **DIJALANKAN 2026-06-25, 21/21 lolos** (RLS utuh pasca
    migrasi 0015/0016; lapis 3 tetap tertutup utk SPV). Ulangi bila ada migrasi/perubahan RLS baru.
  - **#16 Dependensi KPI utk finalisasi** — `saveOrFinalizeReport` menolak bila KPI pegawai kosong
    (KPI = 50% Skor Akhir). Pastikan SPV input KPI semua bulan periode sebelum tahap finalisasi.
  - ❌ **#17 Penegasan "Wajib tekan Kirim" — TIDAK DIKERJAKAN** (keputusan 2026-06-25): berhenti di
    draf = **kelalaian pegawai**, bukan tanggung jawab app. Lihat "Keputusan terkunci" di bawah.
  - (Pra-go-live email/sandi/rotasi kredensial/**backup rutin**/branch-protection tetap di bagian Keamanan & item bawah.)
- 🔄 **Tes unit** — Vitest **55 tes** (logika skor + parsing impor Excel KPI & pemetaan 360°).
- ⬜ **Tes Server Action** (finalisasi laporan, `releaseToSpv`, `setHrdAdmin`, ACC) — belum ada;
  butuh mock Supabase. Nilai sedang. **Task baru (diskusi 2026-06-19).**
- ⬜ **Branch protection GitHub** — PR ke `main` belum wajib CI hijau (push langsung bisa lolos
  walau build merah). Setting GitHub, ~5 menit. **Task baru (diskusi 2026-06-19).**
- ✅ **Verifikasi RLS terprogram per peran** — `npm run verify:rls` (`scripts/verify-rls.ts`):
  fixture uji mandiri (`RLSTEST-*`) → **21 assertion** `kpi_scores` (baca/tulis, termasuk **SPV
  tulis KPI rekan SPV → DITOLAK**) **+ 360° mentah lapis 3** (SPV ditolak baca `assessments`/AIS/AQA
  anggota tim [0012]; kontrol positif HRD/penilai/target). Self-cleaning, aman ke data nyata.
- 🔄 **Aksesibilitas & mobile** — dropdown keyboard-nav/ARIA + tabel lebar wrapped.
  **Keputusan (2026-06-19):** a11y **tidak** didorong sampai dukungan pembaca layar/tunanetra —
  basis pengguna tak menjangkau itu (jangan tambah `aria-label`/`role`/uji NVDA tanpa diminta;
  percobaan sebelumnya di-revert).
- ✅ **Audit kontras/keterbacaan teks (2026-06-19)** — SELESAI. Bukan a11y disabilitas;
  menguntungkan **semua** pengguna awas (HP/proyektor/ruang terang). `text-gray-400` (rasio
  ~2.8:1, **gagal** WCAG AA) → `text-gray-500` (~4.6:1, **lulus**) di seluruh `app/`+`components/`;
  teks <10px (`text-[8px]`/`text-[9px]`) → `text-[10px]`. **Dikecualikan** (sengaja): label di
  dalam SVG chart (radar `report-doc`, data point `monitor-chart`) — bump bikin grafik berdesakan;
  `text-gray-300` pada em-dash/bullet pemisah; badge berlatar warna (kontras dari pasangan latar).
  Murni `className` — logika/tipe/rumus tak tersentuh; `npm run build` hijau.

### Pengembangan opsional
- ⬜ Bulk-finalisasi laporan ber-ACC SPV · ⬜ Ekspor Log Aktivitas HRD ke Excel · ⬜ Ganti email
  mandiri (lanjutan Akun Saya).
- ✅ **"Peninjau Hasil Lintas Divisi" (grant `is_cross_reviewer`, migrasi 0018)** — **SELESAI
  (2026-06-30).** Pegawai (mis. divisi HRD) yang diberi izin dapat **meringkas Hasil Akhir 360°
  pegawai di SEMUA divisi KECUALI divisinya sendiri** (membantu HRD menulis Ringkasan Aspek tanpa
  melihat hasil rekan sedivisinya). Kewenangan: **lihat (L2 + komentar anonim) + tulis Ringkasan
  Aspek** — TANPA rilis/finalisasi/hitung-ulang (tetap milik HRD).
  - **Cara aman menghindari jebakan RLS:** kolom `is_cross_reviewer` **SENGAJA TIDAK** menyentuh
    `is_hrd()` → pemegang grant berposisi `employee` tetap pegawai biasa di level RLS (tak bisa baca
    L3 siapa pun, termasuk divisinya, lewat API). Akses lintas-divisi diberi **hanya** lewat server
    (`service_role`) di jalur `/peninjau` yang menegakkan **"divisi target ≠ divisi peninjau"**.
    Karena RLS menolak langsung, app-level scoping di sini = batas privasi **nyata** (bukan rasa aman
    palsu). L3 (komentar per-penilai bernama) tetap **dibuang** di loader.
  - **File:** migrasi `0018_employee_cross_reviewer.sql`; `lib/auth/roles.ts` `canCrossReview()`;
    `lib/report.ts` `loadCrossDivisionReport()`; `app/(app)/peninjau/` (`page.tsx`+`cross-table.tsx`,
    `[employeeId]/page.tsx`, `actions.ts` `saveCrossAspectSummaries`); grant UI di Kelola Pegawai
    (`setCrossReviewer` + badge/tombol "Peninjau"); menu base `app-shell.tsx` ("Review Lintas Divisi");
    `AspectSummaryEditor` dapat prop `saveAction`. Audit `employee.grant/revoke_cross_reviewer` &
    `crossreview.save_summary` (lewat `logAuditAsService`, pelaku non-HRD).
- ⬜ **Akses HRD granular penuh (per-bagian)** (diminta 2026-06-30, DITUNDA): grant HRD saat ini
  **semua-atau-tidak** (`is_hrd_admin` → `canAdmin()` penuh; lihat `lib/auth/roles.ts`). Permintaan
  (diskusi 2026-06-30): HRD ingin **memberi akses per-halaman berbeda per pegawai** (mis. A→{1,2,3},
  B→{4,5,6}), **bisa berubah sewaktu-waktu & tak harus runut**. **Kesimpulan diskusi: ini LAYAK & tak
  membuat app "terlalu dinamis"** — yang berubah adalah **data**, bukan kode (pola RBAC standar).
  - **Desain (granular ringan):** kolom `employees.hrd_sections text[]` (kosong=penuh, backward-
    compatible) + helper `canSection(actor, section)` dipakai di menu + guard halaman + Server Action.
    UI = **grid centang** per pegawai di Kelola Pegawai; bisa diubah kapan saja tanpa deploy. Kombinasi
    bebas per-user = sekadar baris data berbeda → murah.
  - **KUNCI agar tak liar:** katalog bagian **TETAP** (~11 nama baku: pegawai/periode/pemetaan/
    pertanyaan/bobot/progress/kepatuhan/laporan/dashboard/ekspor/log) — **bukan URL bebas**. Ini yang
    menjaga terkendali; "halaman apa saja" yang membuatnya rapuh, daftar-tetap-yang-dicentang tidak.
  - ⚠️ **PISAHKAN berdasarkan sensitivitas (wajib):** bagian **KONFIGURASI** (tak bocorkan data pribadi
    — pertanyaan/bobot/periode/pemetaan) → **app-level `canSection` CUKUP**. Bagian **DATA SENSITIF**
    (laporan/dashboard/ekspor/raw 360°) → app-only **TIDAK cukup**: bila pemegang grant tetap `is_hrd()`
    penuh, ia masih bisa baca **L3 mentah 360°** lewat API meski menu disembunyikan (rasa aman palsu).
    Untuk yang sensitif gunakan **pola Peninjau** (grant terpisah yang **TIDAK** menyalakan `is_hrd()`
    + akses via `service_role` berfilter / RLS-level). Jangan campur halaman sensitif ke daftar centang
    app-only. (RLS sulit mengekspresikan "daftar bagian arbitrer per-user" — itu satu-satunya bagian
    yang benar-benar mahal, hanya relevan untuk halaman sensitif.)

> Catatan paritas legacy yang **memang diinginkan** (bukan bug): edit skor KPI wajib komentar;
> input KPI pertama boleh tanpa komentar. Pertahankan.

> **Keputusan terkunci — TIDAK ada "page-builder" untuk HRD (2026-06-30):** sistem hanya memberi
> **akses ke halaman yang SUDAH ADA** dari **katalog tetap**; HRD **tidak boleh** merakit/membuat
> halaman/tampilan baru sendiri saat runtime. Membuat halaman baru = pekerjaan **developer** (kode +
> RLS + uji + deploy), bukan tombol konfigurasi — sebab tiap halaman rakitan = permukaan kebocoran &
> tanpa RLS yang sesuai (rasa aman palsu, lawan dari prinsip app ini). **Variasi per-mandat ditangani
> lewat SCOPE/parameter pada halaman existing**, bukan menggandakan halaman (contoh: Peninjau Lintas
> Divisi = SATU halaman Review yang menyesuaikan lingkup, bukan halaman baru per orang). Reframe tiap
> permintaan jadi "halaman existing yang mana + lingkup apa". Permintaan yang benar-benar butuh tampilan
> baru = **feature request ke developer** (antre, dengan RLS), bukan kapabilitas HRD.

> **Keputusan terkunci — app tegakkan kebijakan, bukan tambal kelalaian (2026-06-25):** aplikasi
> menegakkan **integritas & kebijakan** (RLS, wajib-komentar/esai, gate periode/360°), **bukan**
> mengakomodasi tiap kelalaian individu. Konsekuensi: **#17 penegasan "wajib tekan Kirim"** &
> **pop-up hapus ad-hoc/alert error → ConfirmDialog TIDAK dikerjakan**. Berhenti di draf atau salah
> klik = kelalaian pegawai, ditanggung pengguna (mis. tercermin di Progress 360 / kepatuhan), bukan
> dipagari UI. Jangan usulkan fitur "pengaman keteledoran" sejenis tanpa permintaan eksplisit.

---

## Aktivasi (saat siap produksi)

### Email pengingat / reset sandi — Gmail SMTP (tanpa beli domain)
Pengirim = akun Gmail sendiri (mis. `infarmcorp@gmail.com`), limit ~500/hari (cukup ~100 pegawai).
1. **Aktifkan 2-Step Verification** → https://myaccount.google.com/security
2. **Buat App Password** (16 char) → https://myaccount.google.com/apppasswords (perlu 2FA aktif).
3. **Set env di Vercel** (server-only): `SMTP_USER`=email · `SMTP_PASS`=App Password ·
   `SMTP_FROM` (opsional)=`Infarm 360 <email>`.
4. **Redeploy.** Tombol Kirim Pengingat / Pengingat Massal langsung mengirim.

Kode: `lib/email/mailer.ts` (prioritas SMTP > Resend; dorman bila kosong). Untuk produksi
ber-domain: beli domain → verifikasi di Resend → set `RESEND_API_KEY` (+ `RESEND_FROM`); kode
otomatis pakai Resend bila SMTP tak diset. (Tanpa domain, Resend hanya kirim ke email pemilik akun.)

### Lupa Sandi via email
Setelah email asli + SMTP/Resend di atas: daftarkan **Redirect URL** `https://<domain>/auth/callback`
di Supabase → Authentication → URL Configuration; set `NEXT_PUBLIC_ENABLE_PW_RESET=true`; redeploy.

---

## Keputusan Arsitektur (terkunci)

1. **Migrasi penuh ke Next.js App Router, bertahap** (bukan rewrite sekaligus, bukan
   menempel Supabase di Vite). Logika sensitif WAJIB di Server Action / Route Handler.
2. **Pola dibuktikan lewat vertical slice tipis dulu**: fitur **Input KPI bulanan (SPV)**
   = referensi end-to-end (auth → Server Action + Zod → tulis `kpi_scores` + `kpi_audit`
   → uji RLS). Fitur lain mereplikasi pola ini. Lihat `supabase/migrations/` untuk skema.
3. **Skema DB**: `supabase/migrations/0001_init.sql` (tabel) & `0002_policies.sql` (RLS).
   `result_360` & kalibrasi skor akhir hanya ditulis `service_role` dari server.

## Tech Stack (Target)

- **Framework**: Next.js 16 (App Router) · **Language**: TypeScript (strict)
- **Frontend**: React 19, Tailwind CSS v4
- **Backend**: Next.js Server Actions + Route Handlers
- **Database & Auth**: Supabase (PostgreSQL, Auth, Storage, **RLS**, Edge Functions)
- **Validasi**: Zod (di sisi server)
- **Excel/CSV**: `xlsx` (parse di klien) — impor KPI massal & impor mapping 360.
- **PDF**: print-to-PDF (`window.print()` + CSS `@media print`).
- **Email**: Gmail SMTP (`nodemailer`) atau Resend — kode aktif, **dorman** sampai env diset.
- **Testing**: Vitest (`npm test`) · **CI**: GitHub Actions
- **Deployment**: Vercel · **Version Control**: GitHub · **Package Manager**: npm

## Deployment (Vercel)

- Preview deploy otomatis dari setiap PR; production dari branch `main`.
- Environment variables di Vercel dashboard (jangan di-commit):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only
RESEND_API_KEY                 # server-only — pengingat email 360° (jalur Resend, butuh domain)
RESEND_FROM                    # server-only, opsional — mis. "Infarm 360 <noreply@domain>"
SMTP_USER                      # server-only — email Gmail (jalur SMTP, tanpa domain)
SMTP_PASS                      # server-only — App Password Gmail (butuh 2FA)
SMTP_FROM                      # server-only, opsional — mis. "Infarm 360 <infarmcorp@gmail.com>"
NEXT_PUBLIC_ENABLE_PW_RESET    # 'true' utk aktifkan alur "Lupa Sandi via email"
ONBOARDING_GMAIL_ONLY          # server-only — 'false' utk kirim undangan ke SEMUA domain (default: hanya @gmail.com, mode trial)
```

## Security Rules

- **Jangan expose** `SUPABASE_SERVICE_ROLE_KEY` di frontend.
  Hanya `NEXT_PUBLIC_*` yang boleh sampai ke client.
- **Otorisasi berbasis peran adalah inti keamanan aplikasi ini.** Tegakkan dengan
  **Supabase Row Level Security (RLS)** di level database, bukan hanya cek di UI:
  - Employee hanya boleh baca/tulis penilaian & laporan miliknya (laporan: hanya saat `finalized`).
  - SPV hanya boleh akses KPI/laporan bawahannya. **Umpan balik 360° MENTAH (komentar/identitas
    per penilai, lapis 3) TIDAK PERNAH boleh dibaca SPV** — RLS `asmt_read`/`ais_read`/`aqa_read`
    sengaja **tanpa** `is_my_member` (migrasi 0012). Detail agregat SPV (radar/aspek + ringkasan HRD)
    dihitung server via `service_role` (`loadTeamReportForSpv`), hanya saat laporan `in_review`/`finalized`.
  - HRD Admin akses penuh; mode-SPV dibatasi seperti SPV.
  - Direksi read-only + ACC promosi.
- Logika sensitif (kalibrasi skor akhir, finalisasi Final Report, aktivasi/kunci periode,
  perubahan bobot penilai) **harus** di Server Actions / Route Handlers — tidak di client.
- **Validasi semua input di server** (Zod), bukan hanya di frontend.
- Periode terkunci ("Kunci & Akhiri Periode") harus menolak edit penilaian di sisi server.
- Audit trail perubahan KPI (`KPIHistory`) tidak boleh bisa dihapus/diubah dari client.

## Konvensi

- TypeScript strict; hindari `any`.
- Komentar & label UI berbahasa Indonesia mengikuti istilah di PANDUAN (mis. "Mulai Nilai",
  "Final Report", "Garis Hubungan") agar konsisten dengan dokumen pengguna.
- Domain types: skema DB di `lib/database.types.ts`; tipe per-fitur inline/di lib terkait
  (arsip `src/types.ts` sudah dihapus). Jangan duplikasi — perluas di lib yang relevan.
- **Skor Akhir** = blend KPI+360 **dikurangi** punishment kepatuhan per kuartal (min 0). Rumus
  murni terkunci di `lib/scoring.ts` & `lib/score360.ts` (lihat Pengujian); kalau mengubah,
  sinkronkan semua tempat + perbarui tesnya.
- **Klasifikasi talenta Dashboard** (4-Box A/B-Culture/B-KPI/C — **tanpa D**) **dikunci ke satu
  kuartal** lewat filter periode agar KPI, 360°, dan Skor Akhir dari periode sama. Kuartal tanpa 360°
  → pada 4-Box hanya **B-KPI / C** yang mungkin (A & B-Culture butuh sumbu 360°). 4-Box berbasis
  **KPI × 360° langsung** (ambang 80), bukan Skor Akhir — lihat **Klasifikasi Talenta** di bawah.
  > **Matriks 9-Box DIHAPUS dari tampilan dashboard (2026-06-30)** atas permintaan — matriks tab
  > Kompilasi + kolom tabel dibuang. **Rumus `talentBoxOf`/`kpiBandOf`/`s360BandOf` di `lib/scoring.ts`
  > TETAP ADA & teruji** (jangan dihapus — bagian terkunci, mungkin dipakai ekspor/internal nanti);
  > hanya UI dashboard yang dilepas.

## Pengujian (Vitest — logika skor & parsing impor) + Verifikasi RLS

> **Kenapa ada:** rumus skor (Skor Akhir, 9-Box, A/B/C/D, bobot 360°) menentukan keputusan
> SDM nyata (promosi, punishment, kategori talenta). Kesalahan rumus **tidak memunculkan
> error** — aplikasi tetap jalan, angkanya saja yang salah ("salah diam-diam"). Tes mengunci
> rumus: bila ada perubahan tak sengaja, `npm test` langsung **gagal merah** sebelum sampai
> ke pengguna. **Bukan** aktivitas kuartalan — dijalankan saat **kode disentuh**.

- **Jalankan:** `npm test` (sekali) atau `npm run test:watch` (mode pantau).
- **Cakupan (56 tes):**
  - `tests/scoring.test.ts` → `lib/scoring.ts`: `finalScoreOf` (blend 50/50, KPI-only, s360
    null, punishment, floor 0), `playerClassOf` (KPI×360° ambang 80 → A / B-Culture / B-KPI / C,
    null bila keduanya kosong, nilai hilang <80; **tanpa D**), `kpiBandOf`/`s360BandOf`, `talentBoxOf` (9 kotak).
  - `tests/score360.test.ts` → `lib/score360.ts`: `weightedScore360` **4class** (semua kelas,
    normalisasi bobot, **kelas Bawahan**, **Self dikecualikan**) & **2class** (Internal = rerata
    semua skor Peer+Cross+Bawahan, fallback satu sisi).
  - `tests/import.test.ts` → `lib/import/parse.ts`: parsing impor Excel **KPI** (`parseKpiRows`,
    `isValidKpiRow`: alias kolom, normalisasi kode uppercase, skor kosong→tak valid, batas 0–100)
    & **pemetaan 360°** (`parseMappingRows`, `classifyMappingRows`: ok/invalid/self/dup, alias,
    penomoran baris) + 1 uji round-trip lewat `xlsx` asli (paritas jalur klien).
- **Rumus inti ada di KODE, bukan UI.** Yang bisa diubah HRD lewat aplikasi = *input* (bobot %,
  360° aktif/nonaktif, KPI, punishment). Cara blend & ambang terkunci di kode.
- **Kalau sengaja mengubah rumus:** perbarui tes terkait. `lib/score360.ts` diekstrak dari
  `app/(app)/admin/360/actions.ts` — jaga sinkron.
- **CI** menjalankan `npm test` + typecheck + build tiap push/PR (tab Actions GitHub).

**Verifikasi RLS terprogram** (`npm run verify:rls` → `scripts/verify-rls.ts`): bukan unit test —
skrip integrasi yang **membuat fixture user uji sendiri** (prefix `RLSTEST-*`, via service_role),
login sebagai tiap peran (anon key) untuk menegakkan kebijakan RLS `kpi_scores` (SPV→tim+diri,
Employee→diri, HRD/Direksi→semua; tulis lintas-SPV/Employee/Direksi DITOLAK; SPV tulis diri sendiri
DIIZINKAN [0008]) **dan umpan balik 360° mentah lapis 3** (fixture penilaian OTH→EMP: SPV ditolak
baca `assessments`/`assessment_indicator_scores`/`assessment_qual_answers` anggota timnya [0012];
kontrol positif HRD baca penuh, penilai & target baca miliknya), lalu **menghapus seluruh fixture**
(finally — termasuk hapus periode uji yang cascade ke seluruh turunan 360°). **AMAN**: tak menyentuh
data nyata, uji tulis pakai `UPDATE score=score` (idempoten). Total **21 assertion**. Butuh
`NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` di `.env.local`. Jalankan manual
pra-rilis (tak di CI — perlu kredensial).

## Klasifikasi Talenta — 9-Box & 4-Box (rincian ambang)

> Sumber kebenaran: `lib/scoring.ts` (terkunci + diuji `tests/scoring.test.ts`). Bagian ini
> hanya menjabarkan; **kalau mengubah ambang, ubah di kode lalu sinkronkan tabel ini + tes**.
> Dua input klasifikasi: **KPI** (rerata capaian KPI satu kuartal) dan **Skor 360°** (hasil
> `weightedScore360` di `lib/score360.ts`). Keduanya **dikunci ke satu kuartal** lewat
> `getTalentQuarterKey()`; kuartal tanpa 360° (`has360=false`) → 9-Box tak diplot, kolom `N/A`,
> dan kategori A Player nonaktif.

### Skor Akhir (prasyarat 4-Box) — `finalScoreOf`
- **360° aktif & ada:** `Skor Akhir = KPI×0.5 + 360×0.5` (blend 50/50).
- **360° nonaktif / null:** `Skor Akhir = KPI` murni (100% KPI).
- Lalu **dikurangi punishment** kepatuhan kuartal; **lantai 0** (`max(0, base − penalty)`).
- KPI `null` → Skor Akhir `null` (belum bisa diklasifikasi).

### 9-Box — KPI × 360° (`talentBoxOf`, `kpiBandOf`, `s360BandOf`)
Pita (band) tiap sumbu — **batas atas inklusif ke pita lebih tinggi**:

| Band | KPI (`kpiBandOf`) | Skor 360° (`s360BandOf`) |
|------|-------------------|--------------------------|
| **hi**  (tinggi) | `≥ 90`        | `≥ 80`                   |
| **mid** (sedang) | `80 – 89.99`  | `70 – 79.99`             |
| **lo**  (rendah) | `< 80`        | `< 70`                   |

Kotak = perpotongan band KPI (baris) × band 360° (kolom):

| KPI ↓ \ 360° → | **hi** (≥80) | **mid** (70–79) | **lo** (<70) |
|----------------|--------------|-----------------|--------------|
| **hi** (≥90)   | Star Talent          | High Performer       | Expert / Lone Wolf   |
| **mid** (80–89)| High Potential       | Core Contributor     | Needs Align          |
| **lo** (<80)   | Rough Diamond        | Inconsistent Player  | Underperformer       |

- Kuartal tanpa 360° aktif → **tidak diplot** (butuh sumbu 360°).

### 4-Box — A / B-Culture / B-KPI / C (`playerClassOf`)
**Berbasis KPI (rerata) × Skor 360° LANGSUNG, ambang 80 — BUKAN Skor Akhir. Tidak ada D Player.**
Signature: `playerClassOf(kpi: number|null, s360: number|null): PlayerClass|null`.

| Kelas (`key`) | Syarat |
|-------|--------|
| `null` (tak terklasifikasi) | KPI **dan** 360° keduanya kosong |
| **A Player** (`A`) | `KPI ≥ 80` **DAN** `360° ≥ 80` |
| **B Player (High Culture)** (`B_CULTURE`) | `KPI < 80` **DAN** `360° ≥ 80` |
| **B Player (High KPI)** (`B_KPI`) | `KPI ≥ 80` **DAN** `360° < 80` |
| **C Player** (`C`) | keduanya `< 80` |

- Nilai hilang (`null`) diperlakukan **di bawah 80** — kecuali **keduanya** kosong (→ `null`).
- **Tanpa 360°** (`has360=false` → s360 null): tak ada sumbu budaya → hanya **B-KPI** (KPI≥80) atau
  **C** yang mungkin; **A & B-Culture tidak tersedia**. (Pemanggil melewatkan `has_360 ? s360 : null`.)
- Berbeda dari versi lama (yang berbasis Skor Akhir + ada D). Diubah atas permintaan (rumus Excel HRD).
- 9-Box (`talentBoxOf`) **tidak berubah** (tetap band 90/80 × 80/70, butuh KPI & 360 keduanya ada).

## Perintah

```bash
npm install
npm run dev        # Next.js dev :3000
npm run build      # next build (jalankan sebelum push — memvalidasi tipe & prerender)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm test           # vitest run — unit test logika skor (lib/scoring.ts, lib/score360.ts)
npm run test:watch # vitest mode pantau
```

---

## Changelog (ringkas)

> Rekap **tematik** perubahan penting — **rincian per item ada di git history & kode**. Bagian ini
> hanya menyoroti hal yang **tak terbaca dari kode**: invariant lintas-fitur, alasan keputusan, dan
> daftar migrasi. Status/sesi terkini → `STATUS.md`; sisa pekerjaan → **TO-DO & Backlog** di atas.

### Invariant & fitur inti (yang wajib dijaga)
- **Visibilitas laporan bertahap** (`draft → in_review → finalized`, migrasi 0011/0012). Tiga lapis:
  **L1** Skor Akhir · **L2** agregat (radar/aspek + ringkasan HRD, anonim) · **L3** komentar mentah
  per penilai. **SPV lihat L1 sejak draft, L2 hanya setelah "Rilis ke SPV", L3 TIDAK PERNAH**; pegawai
  hanya saat `finalized`. Agregat SPV dihitung server (`loadTeamReportForSpv`, buang L3). Lihat juga
  **Security Rules**. (Kebocoran L3 ke SPV sudah ditutup — RLS cabut `is_my_member`.)
- **Izin HRD = grant, bukan posisi** (`is_hrd_admin`, migrasi 0013). Cek via `canAdmin()`/`is_hrd()`,
  bukan `role==='hrd'`. Dual-mode **Admin ↔ posisi-asli**; **default login = base**. **Paritas
  SPV↔HRD-mode-SPV wajib** (lihat blok PENTING di "Apa Ini").
- **Peninjau Hasil Lintas Divisi** (`is_cross_reviewer`, migrasi 0018). Grant **SENGAJA tidak** menyalakan
  `is_hrd()` → pemegangnya tetap pegawai biasa di RLS; akses lintas-divisi hanya via `service_role`
  (`loadCrossDivisionReport`, tegakkan "divisi target ≠ divisi peninjau"). Privasi **nyata**, bukan
  app-only — pola acuan untuk grant sensitif (lihat Keputusan terkunci).
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
- **Banner "Skor 360° basi"** (migrasi 0014 `reviewed_at`): deteksi penilaian diubah / koreksi relasi
  di-ACC setelah `computed_at` → ingatkan Hitung Ulang.

### Fitur pendukung (ringkas)
- Onboarding email + **sandi unik per orang**; pengingat 360° (Gmail SMTP / Resend, dorman bila env kosong).
- Akun Saya (ganti sandi mandiri, semua peran). Konfirmasi in-app `ConfirmDialog` (~8 titik).
- Kelola Pertanyaan: aspek + "Pakai Pertanyaan Periode Sebelumnya" (idempoten). Hapus Periode (cascade
  360° + KPI bulan unik; wajib ketik `HAPUS`).
- Ekspor dataset lengkap (+ **360° gabungan 1 file 2 sheet**, **Ringkasan Naratif HRD** = Aspek +
  Pertanyaan Kualitatif, dibedakan kolom `jenis`).
- Palet warna skor terpadu (`lib/score-color.ts`), indikator tenggat periode, empty-state berpandu.
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
  `0018` `employees.is_cross_reviewer` · `0019` `kpi_audit.action` (`set`/`delete`, utk Hapus KPI ber-audit).
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
- **Vitest 56 tes** (skor `lib/scoring.ts`/`lib/score360.ts` + parsing impor `lib/import/parse.ts`);
  **CI** (test+typecheck+build tiap push/PR). Rincian di **Pengujian**.
- **`npm run verify:rls`** — 21 assertion (kpi_scores + L3 tertutup untuk SPV); manual, tak di CI.
- Skrip operasional: `backup.mjs`/`restore.mjs` (dump 22 tabel), `reset-*.mjs`, `apply-migration.mjs`
  (pola `npm install --no-save pg`). `xlsx@0.20.3` (CDN, tutup advisory high). Arsip legacy `src/` dihapus.
