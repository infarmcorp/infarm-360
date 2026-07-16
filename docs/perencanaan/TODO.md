# TODO — Infarm 360° Performance Appraisal System

Pekerjaan yang **masih harus dikerjakan & dilacak statusnya** sampai tuntas — sumber tunggal
"apa yang belum beres". Status: ✅ selesai · 🔄 sebagian · ⬜ belum. Item **butuh-aksi-pengguna**
ditandai 🔑. Ide opsional/masa depan ada di **[BACKLOG.md](BACKLOG.md)**; catatan historis di
**[CHANGELOG.md](CHANGELOG.md)**; panduan durable & keputusan terkunci di **[CLAUDE.md](../../CLAUDE.md)**;
status/sesi terkini di **[STATUS.md](STATUS.md)**.

### Keamanan pra-go-live
- ✅ **Sandi awal seragam — TERATASI (2026-07-01):** **Kirim Undangan Massal sudah dijalankan** →
  tiap akun kini punya **sandi unik per orang** (otomatis di-set saat onboarding). App **sudah live &
  berjalan**. Celah impersonasi (inti integritas 360°) tertutup. (Tiap pegawai tetap bisa ganti sandi
  sendiri via Akun Saya.)
- ✅ **Self-service ganti sandi** (Akun Saya) — menutup risiko sandi bersama tanpa email.
- 🔑⏸️ **Lupa Sandi via email** (dormant) — kode siap (`app/auth/lupa-sandi`, `/auth/callback`,
  `/auth/perbarui-sandi`); aktifkan dgn email asli + SMTP/Resend + `NEXT_PUBLIC_ENABLE_PW_RESET=true`.
  **Ditunda — belum perlu** (keputusan pengguna 2026-07-16); sandi diatur HRD via Reset Sandi.
- ✅ **Email seed `nama@infarm.test` → asli — SELESAI (2026-07-16).** Semua akun placeholder sudah
  diganti ke **akun `@gmail.com`** (konfirmasi pengguna). Undangan/pengingat kini sampai ke semua.
  (Untuk produksi penuh non-gmail, set `ONBOARDING_GMAIL_ONLY=false`.)
- 🔑⬜ **Rotasi kredensial** (`SUPABASE_SERVICE_ROLE_KEY` dll) sebelum produksi — service_role menembus
  seluruh RLS; bila pernah ter-share saat dev → bocor = seluruh data terbuka.
  - ⏸️ **Ditunda (2026-07-16):** app **masih dipakai di jam kerja** → tunda rotasi ke jendela sepi
    (mis. luar jam kerja / akhir periode) agar sesi aktif tak terputus. Tetap **wajib** sebelum go-live penuh.
- 🔑🔄 **Cadangan data (backup) rutin** — **KRUSIAL & sering terlupa**. Supabase **free tier** nyaris
  tanpa backup otomatis → salah hapus/migrasi = **data satu kuartal hilang permanen**.
  - ✅ **Skrip backup+restore SELESAI & TERUJI (2026-06-25):** `scripts/backup.mjs` (non-destruktif,
    dump **22 tabel** = 20 publik + `auth.users`/`auth.identities` incl. sandi ter-hash → JSON ke
    `backups/backup-<stamp>/`) & `scripts/restore.mjs` (upsert generik: deteksi PK + jsonb + buang
    kolom generated otomatis; 1 transaksi+rollback; FK/trigger dimatikan via `session_replication_role`;
    wajib argumen folder + kata `PULIHKAN`; flag `--no-auth`). Pakai pola `npm install --no-save pg`
    → jalankan → `npm uninstall --no-save pg` (sama spt skrip reset). **Restore diuji idempoten** ke DB
    nyata: 2593 baris, jumlah baris cocok 100% (tanpa duplikat).
  - 🔑🔄 **SISA (aksi pengguna):** (a) ✅ **dijalankan** — backup terbaru dibuat via terminal
    (`scripts/backup.mjs`, konfirmasi pengguna **2026-07-16**); ulangi rutin (akhir periode + sebelum
    migrasi/reset); (b) ⬜ **salin hasil ke luar laptop** (Google Drive/eksternal) — aturan 3-2-1,
    backup di laptop saja = satu titik kegagalan; (c) ⬜ **opsional otomatis terjadwal** (Windows Task
    Scheduler / GitHub Actions cron — belum dibuat). Ekspor Dataset Excel = cadangan parsial.
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
- ✅ **Pengingat email 360° — BERJALAN LANCAR** (konfirmasi pengguna 2026-07-16). Sisa hanya opsional:
  solusi anti-spam **permanen** (domain sendiri + Resend/SPF/DKIM/DMARC) bila diinginkan.
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
- ✅ **Dashboard — kecualikan data single-axis dari 4-Box — SELESAI (2026-07-16).** Saat **360° aktif**,
  pegawai yang cuma punya **satu sumbu** (KPI saja / 360° saja) **tak lagi diklasifikasi** A/B/C (cegah
  "melompat" begitu sumbu kedua masuk) → ditaruh di bucket baru **"Data Belum Lengkap (1 Sumbu)"** (pola
  sama dgn "Belum Terbaca"); badge Player di tab Tabel jadi **—\*** (konsisten). Saat **360° nonaktif**
  perilaku **tak berubah** (KPI-only). **`playerClassOf` TIDAK disentuh** (terkunci, dipakai 12 file/58
  tes) — pengecualian dihitung di **dashboard saja** (`page.tsx` `axisIncomplete` XOR + `player=null`;
  `dashboard-visual.tsx` bucket + badge). Keputusan desain via 3 pertanyaan pengguna (semua rekomendasi
  dipilih). Build+typecheck hijau. **Verifikasi visual di browser (data live) disarankan.**
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
- ✅ **PASCA-DEPLOY fix 1000-baris (2026-07-08) — Hitung Ulang Skor 360° SUDAH DIJALANKAN**
  (konfirmasi pengguna **2026-07-16**). Fix `computeResult360` (paginasi) live + 51 skor `result_360`
  yang terlanjur salah kini ditimpa dengan yang benar. (⚠️ Tetap **JANGAN** Hitung Ulang untuk **Q1** —
  itu backfill eksternal.) Lihat Changelog "Batas 1000-baris PostgREST".
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
    draf = **kelalaian pegawai**, bukan tanggung jawab app. Lihat "Keputusan terkunci" di CLAUDE.md.
  - (Pra-go-live email/sandi/rotasi kredensial/**backup rutin**/branch-protection tetap di bagian Keamanan & item bawah.)
- 🔄 **Tes unit** — Vitest **99 tes** (logika skor + trend KPI + parsing impor Excel KPI & pemetaan
  360° + **otorisasi/guard Server Action & roles**).
- ✅ **Tes Server Action — SELESAI (2026-07-16).** 33 tes otorisasi/guard via **mock Supabase**
  (`tests/helpers/mock-supabase.ts`, antrean respons per-tabel): `setHrdAdmin`/`setCoordinator`
  (`tests/actions-pegawai.test.ts`), `saveOrFinalizeReport`/`releaseToSpv` (`tests/actions-laporan.test.ts`),
  `setSpvAcc` 3 jalur SPV/Koordinator/Direksi (`tests/actions-acc.test.ts`), + `roles.ts`
  (`tests/roles.test.ts`). Menguji: tolak sesi berakhir / non-HRD / periode nonaktif / skor null /
  laporan sudah final / pegawai berkoordinator; izinkan jalur yang benar. `finalScoreOf` asli (tak di-mock).
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

