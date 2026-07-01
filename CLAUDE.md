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
- **Direksi** — dashboard eksekutif, ACC promosi/suksesi.

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

## Changelog (rekap perubahan)

Ringkas; detail per item ada di kode/commit. Urut tematik, bukan kronologis.

### Fitur baru
- **Peninjau Hasil Lintas Divisi** (grant `employees.is_cross_reviewer`, migrasi 0018; jalur
  `app/(app)/peninjau/`): izin SEMPIT agar pegawai (mis. divisi HRD) **membantu meringkas Hasil Akhir
  360° pegawai di SEMUA divisi KECUALI divisinya sendiri** (konflik kepentingan/privasi rekan sedivisi).
  Kewenangan: **lihat (L2 + komentar ANONIM) + tulis Ringkasan Aspek** — TANPA rilis/finalisasi/
  hitung-ulang (tetap milik HRD). **Keamanan (privasi NYATA, bukan app-only):** `is_cross_reviewer`
  **sengaja TIDAK** menyentuh `is_hrd()` → pemegang grant berposisi `employee` tetap pegawai biasa di
  level RLS (tak bisa baca L3 siapa pun, termasuk divisinya, lewat API). Akses lintas-divisi diberi
  **hanya** lewat server (`service_role`) di `loadCrossDivisionReport` yang menegakkan **"divisi target
  ≠ divisi peninjau"** + menolak direksi/eksternal; blok per-penilai bernama (L3) tetap dibuang.
  Tulis ringkasan via `saveCrossAspectSummaries` (service_role, cek divisi, tolak bila `finalized`,
  audit `crossreview.save_summary` lewat `logAuditAsService` krn pelaku non-HRD). UI: grant di Kelola
  Pegawai (`setCrossReviewer` + tombol/badge "Peninjau"); menu base "Review Lintas Divisi"
  (`canCrossReview` di `lib/auth/roles.ts`); `AspectSummaryEditor` dapat prop `saveAction` (default
  HRD `saveAspectSummaries`, jalur peninjau override). Daftar `/peninjau` (`cross-table.tsx`) +
  detail `/peninjau/[employeeId]`.
- **Tutup/Buka Form penilaian — terpisah dari `has_360`** (migrasi 0017, `periods.form_open`):
  saklar **"Tutup Form"** di Kelola Periode membekukan pengisian pegawai (tahap review) **tanpa**
  mematikan 360° di skor & **tanpa** menyembunyikan tombol Hitung Ulang. Sebelumnya satu-satunya cara
  menutup form adalah "Set Tanpa 360°" yang juga membuang 360° dari Skor Akhir & menyembunyikan
  Hitung Ulang — tak cocok untuk skenario "tutup form untuk review". Gerbang form pegawai kini
  `has_360 && form_open` (`penilaian/page.tsx` + `[targetId]`); guard tulis (`submitAssessment`/
  `addAdhocTarget`/`requestCorrection`) tolak bila `!form_open`; todo "penilaian tertunda" tak muncul
  saat form tertutup. Saklar UI di `period-actions.tsx` (`toggleFormOpen`), tampil saat aktif & 360°
  ON; audit `period.toggleForm`. `ConfirmDialog` dapat prop `confirmDisabled`.
- **Hapus Periode + seluruh datanya** (`admin/periode/`, `deletePeriod`/`periodDataCounts`):
  tombol **Hapus** per baris — periode AKTIF ditolak (Kunci & Akhiri dulu), dialog menampilkan rekap
  isi (penilaian/KPI/laporan/pemetaan) + **wajib ketik `HAPUS`** (klien + server), hanya HRD, audit
  `period.delete`. Hapus baris periods **cascade** ke seluruh turunan 360°; **KPI** (kunci per `ym`,
  tak cascade) dihapus manual **hanya untuk bulan UNIK** periode itu → KPI periode lain yang berbagi
  bulan **aman**.
- **Lampiran panduan PDF per peran di email Undangan** (`lib/email/mailer.ts` `panduanAttachment`,
  `admin/progress/actions.ts`): email onboarding melampirkan PDF sesuai peran (`public/panduan/
  panduan-{pegawai,spv,hrd,direksi}.pdf`; pemegang grant `is_hrd_admin` → panduan HRD). `sendEmail`
  dukung lampiran di kedua jalur (Gmail SMTP & Resend, via URL). Pengaman: cek keberadaan PDF (HEAD)
  dulu — bila tak ada, email tetap terkirim tanpa lampiran; cache per peran di mass. Middleware
  menjadikan `/panduan` **publik** agar provider email bisa mengunduh PDF tanpa sesi.
- **Filter periode Monitoring berlaku untuk kedua panel** (`kpi/riwayat-view.tsx` prop `byPeriod`/
  `periodParam`): dropdown periode di Rekapitulasi Kuartal kini juga menyaring **Riwayat & Audit**
  (lewat bulan periode, resolusi sama). Hanya di halaman Monitoring berdampingan; tab SPV tetap semua.
- **Konfirmasi in-app `ConfirmDialog`** (`components/confirm-dialog.tsx`): modal bergaya aplikasi
  (overlay + kartu, Esc/klik-luar = batal, `text-left` agar tak terpengaruh perataan sel tabel)
  menggantikan `window.confirm`/`prompt` browser di **~8 titik**: Kelola Periode (**Kunci & Akhiri**,
  **Aktivasi**), Kelola Pegawai (**Reset Sandi** — modal + input sandi), Kelola Pertanyaan (**hapus
  aspek/indikator**), Progress 360 (**Undangan Massal/per-orang**), Form Penilaian (**Buang Draf**).
  Reusable: terima `children` (mis. input/daftar), `tone` danger/primary, `busy`. (**Pop-up hapus
  ad-hoc + alert error SENGAJA DIBIARKAN** pakai pop-up browser — keputusan 2026-06-25, lihat
  "Keputusan terkunci" di bawah; bukan utang teknis.)
- **Review Hasil Akhir — kolom & filter "Kelengkapan 360°"** (`admin/laporan/`): kolom **"Dinilai oleh
  X/Y"** (penilai WAJIB yang sudah submit per pegawai; badge hijau+✓ bila lengkap, tampil hanya saat
  360° aktif) + filter **Semua / Lengkap dinilai (siap review) / Belum lengkap** + ringkasan **"N siap
  review"**. Bantu HRD tahu siapa yang datanya cukup untuk difinalisasi (dukung #8). Dihitung di
  `page.tsx` dari mappings (mandatory) vs assessments submitted; `report-table.tsx` filter klien.
- **Peringatan pra-"Kunci & Akhiri Periode"** (`period-actions.tsx` `endWithGuard`): konfirmasi sebelum
  mengunci — peringatkan bila masih ada **laporan belum difinalisasi** / 360° belum lengkap / draf belum
  dikirim, + tegaskan **setelah dikunci finalisasi tak bisa tanpa aktivasi ulang**. Cegah HRD mengunci
  terlalu dini (pakai `activePeriodReadiness` yang sudah ada).
- **Toggle 360° = saklar buka/tutup form penilaian** (`has_360` jadi gerbang, bukan hanya skor):
  bila periode aktif `has_360=false` ("Set Tanpa 360°"), **form 360° disembunyikan** dari pegawai —
  `/penilaian` & `/penilaian/[targetId]` tampilkan empty-state "Penilaian 360° belum dibuka". **"Aktifkan
  360°"** = peluncuran serentak ke semua pegawai berpemetaan. Guard server di **semua aksi tulis 360°**
  (`submitAssessment`, `addAdhocTarget`, `requestCorrection`) menolak bila `has_360=false`. Memungkinkan
  alur HRD: aktivasi → Set Tanpa 360° → susun Pertanyaan/Bobot/Pemetaan (form tertutup) → **Aktifkan 360°**
  (buka) → finalisasi. Tooltip toggle di Kelola Periode menjelaskan efeknya. (`has_360` lama hanya
  memengaruhi skor/dashboard; kini juga akses form — konsisten dgn makna "Tanpa 360°".)
- **Email "Undangan & Info Akun" (onboarding)** (`admin/progress/`, `lib/email/mailer.ts`):
  tombol **"Undangan"** (per-orang) + **"Kirim Undangan Massal"** di Progress 360, **terpisah** dari
  "Kirim Pengingat". `sendOnboarding`/`massOnboarding` **men-set sandi acak unik** (`genPassword` →
  `admin.updateUserById`) lalu mengirim email (`onboardingHtml`) berisi **peran, email login, sandi,
  tombol `/login`, daftar belum dinilai, & panduan ringkas per peran** (`roleGuide`). Dipakai sekali di
  awal periode (sandi disetel ulang → kirim sebelum orang ganti sandi sendiri). **Filter TRIAL hanya
  `@gmail.com`** (`onboardingAllowed`); non-gmail dilewati **tanpa** mengubah sandi (cegah lock-out);
  set `ONBOARDING_GMAIL_ONLY=false` untuk produksi penuh. Audit `progress.onboarding`/`mass_onboarding`.
- **Penilai eksternal (vendor/freelance)** (`employees.is_external`, migrasi 0016; Kelola Pegawai
  + ~15 file): pegawai bertanda **Eksternal** hanya bertindak sebagai **penilai 360°** (relasi Cross),
  **tidak** punya KPI/Skor Akhir/laporan, dan **disembunyikan** dari semua jalur **subjek** (dashboard,
  KPI input/riwayat/rekap, monitor, laporan-tim, finalisasi laporan, kepatuhan, suksesi, notifikasi HRD)
  via `.eq('is_external', false)` pada query enumerasi `.neq('role','direksi')`. **Tak boleh jadi target**
  (berlapis): di form pemetaan daftar "Yang Dinilai" hanya internal; server `createMapping` & ad-hoc
  `addAdhocTarget` **menolak** target eksternal; impor massal & salin-pemetaan **membuang** baris target
  eksternal; kandidat Ad-Hoc dikecualikan. **Tetap muncul sebagai penilai** di Progress 360 & dropdown
  penilai pemetaan. UI: checkbox **"Penilai eksternal"** (create/update) + badge **"Eksternal"** di Kelola
  Pegawai; `is_external` dicatat di Log Aktivitas HRD. Skornya masuk ke 360° pegawai lewat bobot **Cross**
  tanpa eksternal pernah muncul di laporan/dashboard. (Keputusan: eksternal = penilai-saja, tanpa hasil.)
- **Form penilaian — auto-simpan draf + konfirmasi & layar sukses** (`penilaian/[targetId]/assess-form.tsx`):
  **auto-simpan draf** (debounce **5 detik**) tiap perubahan rating/komentar/esai → kerja tak hilang
  saat HP ter-lock/refresh; indikator status (belum disimpan / menyimpan / tersimpan / gagal) di bawah
  bar progres. **Pengaman:** tak autosave penilaian `submitted` (cegah turun status), tak buat draf
  kosong, **lockRef** mengunci autosave saat proses Kirim + `doSend` menunggu autosave in-flight agar
  status tak tertimpa. Tombol Kirim → **konfirmasi** ("Kirim penilaian untuk <Nama>?") → **layar sukses**
  (✓ + pengingat sisa penilaian wajib, tombol "Lanjut ke Penilaian Berikutnya" bila masih ada).
  Server `submitAssessment` menerima draf parsial; `key={targetId}` di `page.tsx` me-remount form bersih
  tiap ganti target.
- **Form penilaian — esai kualitatif WAJIB** (`assess-form.tsx` + `penilaian/actions.ts`): Umpan Balik
  Kualitatif yang dulu **opsional** kini **wajib semua**. Validasi klien (lompat ke tab + pesan) **dan**
  server (`submitAssessment` query `qualitative_questions` periode, tolak bila ada yang belum terjawab).
  Bar progres mencakup esai (mis. 13/13 = 10 indikator + 3 esai); label "(opsional)" → "(wajib diisi
  semua)" + tanda `*` & hint "Wajib diisi". **Keputusan terkunci** (kebijakan mutlak — jangan dilonggarkan).
- **Form penilaian — keterbacaan rating & rail responsif HP** (`assess-form.tsx`): angka rating 1–5
  diperbesar; label mungil hanya di layar lebar, di HP digantikan baris **"Pilihan Anda: N · Label"**.
  Rail aspek: **strip horizontal yang bisa di-geser di HP** (`overflow-x-auto`, tombol `w-[150px]`),
  **vertikal di `lg:`** — editor langsung tampak tanpa scroll panjang.
- **Daftar Penilaian — ringkasan wajib + info Garis Hubungan** (`penilaian/page.tsx`): kartu hijau
  **"Penilaian Wajib Anda X/Y sudah dikirim"** + bar progres (hanya sifat Wajib; detail page menghitung
  `mandatoryTotal`/`mandatoryDoneOthers`/`thisMandatory` untuk layar sukses). Banner biru menjelaskan
  kolom **Garis Hubungan** & mendorong **Minta Koreksi** (relasi → bobot Skor 360° → hasil akhir).
- **Ekspor — Umpan Balik Kualitatif 360° (esai) + kolom aspek** (`admin/ekspor/`): dataset baru
  `exportQualAnswers` (`assessment_qual_answers`→`qualitative_questions`; periode·dinilai·divisi·relasi·
  pertanyaan·jawaban, anonim penilai, jawaban kosong dilewati). Dataset kuantitatif `exportAssessments`
  ditambah kolom **aspek** (dari `indicators.aspect_id`→`culture_aspects.name`).
- **Notifikasi HRD: koreksi relasi menunggu** (`lib/todos/compute.ts`): panel "Tugas & Notifikasi"
  HRD Admin kini menghitung `relation_correction_requests` status `pending` periode aktif → item
  rose "N permohonan koreksi relasi menunggu" → `/admin/pemetaan`. (Tone `rose` sudah ada di shell.)
- **Peringatan "Skor 360° basi" di Review Hasil Akhir** (`laporan/[employeeId]/page.tsx`,
  `admin/360/actions.ts`, `admin/pemetaan/actions.ts`, migrasi 0014): bila ada perubahan **setelah**
  `result_360` terakhir dihitung — (a) **penilaian** dikirim/diubah (`assessments.submitted_at >
  computed_at`) ATAU (b) **koreksi relasi di-ACC** (`relation_correction_requests.reviewed_at >
  computed_at`, yang mengubah kelas bobot) — atau ada penilaian tapi belum pernah dihitung, halaman
  detail laporan (jalur HRD) menampilkan **banner amber** mengingatkan Hitung Ulang Skor 360° +
  simpan/finalisasi ulang. **Banner menyebut PENYEBAB spesifik** (daftar): penilaian diubah penilai,
  koreksi relasi di-ACC, atau belum pernah dihitung — agar HRD tahu konteksnya. Prasyarat: `computeResult360` kini menulis `computed_at` eksplisit tiap
  hitung ulang (UPDATE/upsert ikut memperbarui stempel, bukan hanya saat INSERT); `reviewCorrection`
  menulis `reviewed_at` saat ACC. Hanya HRD pada periode ber-360°.
- **Progress 360 — kelengkapan berbasis WAJIB saja** (`admin/progress/`): kartu **Lengkap/Belum/
  Progres** + badge per-baris + filter status kini menghitung "lengkap" = semua penilaian **mandatory**
  selesai (opsional tak menentukan). `page.tsx` tambah `mandatoryTotal`/`mandatoryDone` per penilai;
  `progress-client.tsx` `isComplete = mandatoryDone >= mandatoryTotal`, bar jadi "Menilai (wajib)",
  opsional yang belum ditandai "+N opsional belum" (tetap bisa Paksa Selesai dari Rincian). Sort by
  rasio wajib.
- **Kelola Pertanyaan — "Pakai Pertanyaan Periode Sebelumnya"** (`admin/pertanyaan/`):
  Server Action `importQuestionsFromPeriod` menyalin **aspek + indikator AKTIF + esai** dari periode
  lain ke periode aktif. **Idempoten/aman dobel**: aspek (per nama) & esai (per teks) yang sudah ada
  **dilewati**; indikator nonaktif tak ikut; skor historis tak tersentuh (baris baru). UI `copy-questions-form.tsx`
  (dropdown periode sumber + ringkasan aspek/indikator/esai + konfirmasi); `page.tsx` menghitung ringkasan
  per periode (RLS `*_read` = `using(true)` → boleh baca lintas-periode). Audit `questions.import`.
- **Izin "HRD Admin" terpisah dari posisi (`is_hrd_admin`, migrasi 0013)**: "HRD Admin" jadi
  **kapabilitas**, bukan jabatan. Pegawai `employee`/`spv` bisa **diberi izin HRD** (grant) tanpa
  kehilangan posisi/tim aslinya. Helper `canAdmin()` (`lib/auth/roles.ts`) menggantikan cek
  `role==='hrd'` mentah di ~25 file (guard admin + scope data). **Dual-mode digeneralisasi**:
  tombol **Mode Admin ↔ Mode posisi-asli** (Pegawai/SPV) tampil bila `canAdmin`; **default login =
  base** (`layout.tsx`), masuk Admin disengaja; redirect base → `/` (landing per posisi, `app/page.tsx`).
  **UI grant** di Kelola Pegawai (tombol perisai + badge "HRD", `setHrdAdmin` + audit
  `employee.grant_hrd`/`revoke_hrd`; hanya HRD Admin yang boleh, cegah eskalasi). RLS `is_hrd()`
  kini = `role='hrd' OR is_hrd_admin`. **Tahap 2 — SENGAJA DILEWATI (keputusan 2026-06-19):**
  rencana memindahkan HRD-yang-juga-SPV (`role='hrd'`→`'spv'`+grant+`spv_team_members`) **tidak
  dikerjakan**. Alasan: tim Ulfa (satu-satunya HRD-SPV saat ini) = **seluruh divisi HRD-GA**, jadi
  scope-sedivisi (tambalan HRD-mode-SPV) sudah menampilkan orang yang tepat **dan otomatis mencakup
  rekrutan baru** divisi tanpa penautan manual `spv_team_members` (lebih tepat, bukan utang teknis).
  Ulfa tetap `role='hrd'` (berfungsi penuh). Tahap 2 baru relevan bila kelak ada SPV yang **timnya ≠
  seluruh divisinya** (sebagian / lintas divisi). Jangan kerjakan tanpa kasus seperti itu.
- **Akun Saya — ganti sandi mandiri** (`app/(app)/akun/`, semua peran): verifikasi sandi saat
  ini (`signInWithPassword`) → `updateUser({password})`. Tautan di footer sidebar. Login juga
  punya petunjuk "Lupa sandi? Hubungi HRD" (atau tautan reset email bila flag aktif).
- **Email pengingat 360°** (`lib/email/mailer.ts`): 2 jalur — **Gmail SMTP** (`nodemailer`)
  ATAU **Resend** REST; prioritas SMTP, **dorman** bila env kosong. `sendReminder`/`massReminder`
  di `app/(app)/admin/progress/actions.ts` (email penilai dari auth, isi = target belum dinilai).
- **Review Hasil Akhir revamp** (`app/(app)/laporan/`): panel aksi HRD di detail (Unduh PDF ·
  Simpan Draf · Finalisasi Hasil + badge status/Skor Akhir), **radar self vs rekan** (garis
  penuh = Rekan, putus = Diri) + dua bar per aspek, **Evaluasi Aspek** (ringkasan naratif HRD
  per aspek → `final_reports.content.aspectSummaries`), **Rincian Komentar Murni** (HRD-only,
  anonim, per aspek→indikator + akumulasi rating + esai per pertanyaan; Self dikecualikan).
- **Alur visibilitas laporan bertahap** (`draft → in_review → finalized`, migrasi 0011/0012):
  aplikasi **hanya mengatur visibilitas + ACC** (diskusi HRD–SPV terjadi di luar app). Tiga lapis
  informasi — **L1** Skor Akhir (angka), **L2** detail agregat (radar/aspek + ringkasan aspek HRD,
  anonim), **L3** komentar mentah per penilai. Aturan: **SPV** lihat **L1 sejak `draft`**; **L2 hanya
  setelah HRD menekan "Rilis ke SPV" (`in_review`)** atau final; **L3 tidak pernah ke SPV**. **Pegawai**
  hanya saat `finalized`. Tombol HRD baru **"Rilis ke SPV"** (`releaseToSpv`, audit `report.release_spv`),
  badge status `Ditinjau SPV`. **ACC SPV non-blok** — HRD bebas finalisasi tanpa menunggu ACC (anti-macet
  bila SPV cuti/lambat). Detail SPV dirender via `loadTeamReportForSpv` (server `service_role`, buang L3);
  tautan detail di Laporan Kinerja Tim **terkunci** sampai dirilis. Laporan **diri sendiri** (SPV=pegawai)
  ikut aturan pegawai (hanya `finalized`).
- **Progress 360 — dua progres per baris** (paritas legacy): "Menilai orang lain" + "Dinilai
  oleh X/Y orang".
- **Kelola Pertanyaan — Tambah/Kelola Aspek** + panduan rating/deskripsi per indikator
  (migrasi 0006).
- **SPV input KPI dirinya sendiri** (selain anggota tim) — migrasi 0008.
- **Laporan Kinerja Tim — baris SPV sendiri + pencarian** (`app/(app)/laporan-tim/`): SPV kini
  muncul sebagai baris sendiri (badge "Anda") menampilkan Skor Akhir & Status **meski laporan
  masih draf** (lewat migrasi 0009); ACC sendiri sengaja dinonaktifkan (integritas). Tabel
  dipindah ke komponen client `team-table.tsx` dengan kotak **pencarian nama/divisi** instan.
  **HRD mode-SPV**: lingkup baris kini = **pegawai sedivisi HRD** (incl. dirinya), selaras
  kebijakan Input KPI — bukan `spv_team_members` yang kosong untuk HRD (`is_hrd` baca/ACC penuh).
- **Standar/Target KPI per kuartal** (`periods.kpi_standard`, migrasi 0010): HRD set angka target
  per periode di **Kelola Siklus Periode** (editor inline `kpi-standard-editor.tsx` + field di
  form buat-periode). Dashboard tab **Analisis Hasil KPI** memakai nilai ini untuk kartu **"KPI
  Di Atas Standar (≥N)"** (filter + label dinamis). **Murni metrik pelaporan** — TIDAK menyentuh
  rumus skor di `lib/scoring.ts`. Ganti standar tiap kuartal tanpa deploy.
- **Dashboard — filter Tahun** (`admin/dashboard/dashboard-filters.tsx`): dropdown Tahun di samping
  Periode & Divisi (kini grid 3 kolom). **Murni filter bantu klien** yang mempersempit daftar
  periode (mis. hanya kuartal 2026); tahun diturunkan dari `periods.start_date` (tahun periode
  terpilih = nilai dropdown — tanpa searchParam baru). Ganti tahun → lompat ke periode **aktif**
  tahun itu (atau teratas). Lingkup chart per-periode tetap satu periode (server via `?period=`).
- **Dashboard — tren tahunan (trendline) KPI & 360°** (`admin/dashboard/`): dua grafik garis
  org-level **lintas periode dalam tahun terpilih** (`TrendLine` SVG di `dashboard-visual.tsx`).
  Tab **Analisis Hasil KPI** → "Tren KPI Bulanan {tahun} (Jan–Des)"; tab **Analisis 360 Feedback**
  → "Tren 360° per Kuartal {tahun}" (hanya kuartal ber-360°). Masing-masing + kartu **rerata
  tahun**. Server `page.tsx` query lintas-periode: KPI rentang `${year}-01..-12` (`yearMonthly`),
  360° `result_360` per periode tahun itu (`year360`), keduanya di-scope `empIds` (**ikut filter
  divisi**). Domain-y trendline adaptif; titik berwarna `heatColor`. **Murni pelaporan** (tak
  menyentuh `lib/scoring.ts`).
- **Dashboard — heatmap "Capaian KPI / Divisi" + pie kategori KPI** (tab Analisis Hasil KPI,
  `admin/dashboard/`): heatmap tabel matriks **divisi × bulan** dengan sel berwarna (lihat **palet
  skor terpadu** di bawah, `heatColor`/`KpiHeatmap` di `dashboard-visual.tsx`). Server `page.tsx`
  agregasi rerata KPI per `(dept, ym)` dari `kpi_scores` yang **sudah di-scope** lingkup
  periode+filter divisi (tanpa query baru) → props `deptMonthly`/`months`. Di sampingnya **donut
  "Distribusi Kategori KPI"** (`KpiCategoryPie`) — komposisi pegawai per kelas capaian **KPI**
  (rerata `rows.kpiAvg`, bukan Skor Akhir): ≥90 Melampaui (biru `#183c6c`) · 80–89 Memenuhi (hijau
  `#388e3c`) · 70–79 Perlu Peningkatan (kuning `#ffc107`) · <70 Di Bawah (merah `#b71c1c`). Keduanya
  bersebelahan (`lg:grid-cols-3`: heatmap `col-span-2`, pie 1 kolom). Ikut filter periode/divisi;
  sel kosong "—". **Murni pelaporan** (tak menyentuh `lib/scoring.ts`).
- **Logo merek (`public/logo.png`)** — lambang "i" lama diganti logo Infarm asli via komponen
  `components/brand-logo.tsx` (`<img src="/logo.png">`, object-contain). Dipakai di sidebar
  (`app-shell.tsx`, diperbesar dgn margin negatif agar tinggi header tetap) & header mobile.
- **Palet warna skor terpadu** (`lib/score-color.ts`, commit `c0e13f2` lalu `9a82667`):
  satu skala warna konsisten untuk semua visual berbasis skor, **diekstrak ke modul bersama**
  (`heatColor` + `HEAT_LEGEND_GRADIENT`) agar dipakai dashboard **dan** Monitor Kinerja tanpa
  duplikasi/drift. **`heatColor(v)`** = **gradasi mulus interpolasi RGB** antar 4 jangkar — `≤70
  #b71c1c` (merah) · `80 #ffc107` (kuning) · `90 #388e3c` (hijau) · `≥97.5 #183c6c` (biru tua); di
  luar rentang di-clamp; **teks per-luminance** (gelap di sel terang spt. kuning, putih di sel pekat)
  → terbaca, selaras audit kontras WCAG. Dipakai bar+chip di **dashboard** (`dashboard-visual.tsx`,
  impor dari lib): **heatmap** Capaian KPI/Divisi, **Rerata KPI Bulanan per Divisi**, **Perkembangan
  KPI Bulanan**, **Skor KPI Rata-rata per Divisi**, **Evaluasi Budaya 360°** (tab Kompilasi & Analisis
  360); dan di **Monitor Kinerja** (`monitor/monitor-chart.tsx`) — bar **"Perbandingan Skor Akhir
  Antar-Pegawai"** (SPV & HRD mode-SPV). **Distribusi Kategori Kinerja** & **Rencana Tindak Lanjut**
  pakai **palet diskrit** (tanpa gradasi) dari jangkar yang sama: ≥90 biru · 80–89 hijau · 70–79
  kuning · <70 merah (tier teratas digeser hijau→biru agar konsisten). Rename judul: "per
  Departemen"→**"per Divisi"**; "Perkembangan KPI Bulanan Organisasi"→**"Perkembangan KPI Bulanan"**.
  **Murni visual** (className/style) — logika & rumus skor tak tersentuh.
- **Dashboard — kartu KPI tertinggi/terendah berlabel nama** (`admin/dashboard/dashboard-visual.tsx`):
  kartu "Skor KPI Tertinggi" kini menampilkan **nama pegawai**, + kartu baru **"Skor KPI Terendah"**
  (nama + skor). `Stat` diperluas prop `sub`.
- **Ekspor Dataset** (`/admin/ekspor`): dataset Pegawai, KPI, Audit KPI, Punishment, Rekap,
  360° kuantitatif anonim (+ kolom **aspek budaya**), **Umpan Balik Kualitatif 360° (esai, anonim)**,
  Pemetaan + **Rekap Konfigurasi Periode** (potret pengaturan HRD per kuartal). Penilaian 360°
  Detail kini menyertakan kolom `aspek` (dari `indicators.aspect_id`→`culture_aspects.name`);
  dataset esai baru = `assessment_qual_answers`→`qualitative_questions` (`exportQualAnswers`,
  kolom periode·dinilai·divisi·relasi·pertanyaan·jawaban, jawaban kosong dilewati).
  **Ekspor 360° gabungan (2026-07-01, commit `85408ad`):** tombol **"Ekspor 360° Lengkap"**
  (`downloadCombined360`) menggabungkan **kuantitatif + kualitatif jadi 1 file** dua sheet
  ("Kuantitatif" + "Kualitatif", via `XLSX.utils.book_append_sheet`) — tak perlu 2× ekspor terpisah
  (dataset per-jenis lama tetap ada). **Ekspor Ringkasan Aspek Naratif (HRD)** (`exportAspectSummaries`)
  = dump `final_reports.content.aspectSummaries`, satu baris per (pegawai × aspek), kolom
  periode·kode·nama·divisi·status_laporan·aspek·ringkasan.
- **Indikator tenggat periode** (sidebar): sisa hari ke `end_date` + peringatan amber ≤7 hari /
  rose saat hari-ini/lewat (`layout.tsx` `daysUntil`).
- **Empty-state berpandu** (`components/empty-state.tsx`) di halaman kunci (anti tabel kosong).
- **Impor pemetaan** — pratinjau menyebut pasangan yang dilewati + alasannya.

### Perbaikan (bug fix)
- **Pegawai non-aktif tercatat ulang lewat Impor Pemetaan + tetap terkirim email** (commit `a756cf5`):
  roster pratinjau impor & dropdown pemetaan dulu tanpa filter `is_active` → nama nonaktif bisa diinput
  lagi via Excel (`is_active:true` di insert). Kini **diblokir berlapis**: roster/dropdown `.eq('is_active',
  true)` (`pemetaan/page.tsx`); `createMapping` tolak assessor/target nonaktif; `createMappingsBulk` &
  `copyMappingsFromPeriod` **buang** baris ber-pihak nonaktif. **Email:** `sendOnboarding` diberi guard
  tolak bila `!is_active`; `massReminder`/`massOnboarding` sudah tak menyertakan nonaktif → **pegawai
  nonaktif tak menerima undangan/pengingat**.
- **Pegawai non-aktif ikut terflag/terhitung sebagai subjek** (~10 file): query enumerasi subjek
  dulu hanya `.neq('role','direksi').eq('is_external', false)` tanpa `is_active` → pegawai nonaktif
  tetap muncul di Kepatuhan (terflag "telat"/"belum self"), Dashboard, Rekap, Monitor, Laporan Tim,
  Review Hasil Akhir, Suksesi, kandidat Ad-Hoc, & lingkup Input KPI. Kini **semua situs pola subjek
  ditambah `.eq('is_active', true)`** (konsisten dgn cara externals dikecualikan). **TIDAK** disentuh:
  Ekspor (dump penuh), `bobot` (peta nama lookup — agar nama subjek lama tetap tampil), readiness
  (sudah ada is_active).
- **`result_360` basi setelah hapus pemetaan bila penilaian sudah hilang lebih dulu**
  (`admin/pemetaan/actions.ts` `deleteMapping`): rekonsiliasi skor (buang/hitung-ulang) dulu bersarang
  di `if (asmts.length)` → terlewat bila penilaian target sudah dihapus (mis. via skrip reset),
  menyisakan skor 360° basi tanpa banner. Kini rekonsiliasi **selalu** jalan tiap pemetaan dihapus:
  0 penilaian submitted → buang `result_360`; masih ada → `computeResult360()`.
- **Dashboard — Papan Pertimbangan Suksesi & Promosi dihapus** (`admin/dashboard/`): panel + query
  `succession_plans` + variabel terkait dibuang dari tab Kompilasi (atas permintaan). Menu Promosi &
  Suksesi terpisah tetap utuh.
- **Filter Tahun dashboard salah kelompok karena tanggal mulai di ujung tahun** (data + saran kode):
  periode Q1 2026 tersimpan `start_date` 31 Des → dibaca tahun 2025 oleh `slice(0,4)`. Diperbaiki via
  skrip `scripts/fix-period-start-year.mjs` (set ke 2026-01-01). Akar: human-error input tanggal
  (jalur form bersih, tak menggeser). Skrip operasional baru: `reset-people.mjs` (reset data 360°/KPI
  per pegawai, akun+pemetaan dipertahankan) & `readiness-check.mjs` (cek kesiapan periode, read-only).
- **Form penilaian — kebocoran state antar-target** (`penilaian/[targetId]/page.tsx`): `<AssessForm>`
  dirender **tanpa `key`** → berpindah dari `/penilaian/A` ke `/penilaian/B` (navigasi klien tanpa
  reload) membuat React mempertahankan state komponen (activeGroup/activeId/rating/komentar) target
  sebelumnya → form B bisa terbuka di tab "Umpan Balik Kualitatif" atau menampilkan isian target A.
  Diperbaiki dgn `key={targetId}` → form **remount bersih** tiap ganti target. Relevan untuk alur
  menilai banyak orang berurutan. (Catatan: glitch "klik Q2 → kualitatif" **berbeda** — disimpulkan
  karena indikator periode belum lengkap saat tes; tak terulang dgn data penuh.)
- **SPV tak bisa tinjau detail laporan dirinya sebelum Final** (`laporan-tim/page.tsx`, `lib/report.ts`):
  laporan diri-sendiri dulu hanya terbuka saat `finalized` (aturan pegawai). Kini disamakan dgn anggota
  tim — detail agregat dapat dibuka sejak `in_review` (`canOpenDetail` & `loadTeamReportForSpv`/
  `loadTeamReportForHrdSpv` ubah gate diri `finalized`→`in_review||finalized`). **ACC diri tetap
  nonaktif**; "Laporan Hasil Saya" pegawai tetap final-only; L3 tetap tak pernah ke SPV.
- **Rilis/Finalisasi bisa jalan dgn ringkasan aspek belum disimpan** (Opsi A — guard konfirmasi):
  `saveAspectSummaries` & panel aksi terpisah → HRD bisa Rilis tanpa menyimpan ringkasan terbaru.
  Tambah `summary-dirty.tsx` (Context berbagi status dirty antara `aspect-summary-editor.tsx` &
  `report-actions.tsx`); tombol **Rilis ke SPV**/**Finalisasi** kini memunculkan **konfirmasi**
  ("Batal — simpan dulu" / "Lanjut tanpa ringkasan") bila ada ringkasan belum disimpan. Jalur HRD
  detail dibungkus `SummaryDirtyProvider`.
- **Edit KPI bulan sama tersimpan tanpa Komentar Audit** (`kpi/actions.ts`): aturan paritas legacy
  "input KPI pertama boleh tanpa komentar; **edit wajib komentar**" hanya ada di label kolom, tak
  ditegakkan server — `saveKpiScores` langsung upsert. Akibatnya input KPI **kedua di bulan sama**
  (= edit capaian) tersimpan tanpa komentar. Kini server cek per pegawai: bila skor bulan itu **sudah
  ada** & komentar kosong → **ditolak** dengan pesan menyebut nama pegawai. Berlaku otomatis untuk SPV
  **dan** HRD mode-SPV (satu action). Jalur Impor Excel tak terpengaruh (note default "Impor Excel").
- **Laporan pegawai (final) tampil "raw"** (`laporan/page.tsx`): halaman Laporan Hasil Saya
  merender `<ReportDoc anonymize />` **tanpa** `hideAssessorComments`, jadi pegawai melihat
  **komentar mentah per penilai (lapis 3)** meski nama disamarkan. Kini pegawai hanya melihat
  **agregat L1+L2** (skor + radar/aspek + **Ringkasan Aspek HRD** via `AspectSummaryView`); lapis 3
  **dibuang dari payload** (`{...data, assessors:[], byAspect:[], essays:[]}`) agar tak terserialisasi
  ke browser — konsisten dgn jalur SPV `loadTeamReportForSpv`.
- **ACC Laporan Tim bisa diklik saat masih `draft`** (`laporan-tim/`): tombol "Beri ACC" tampil
  selama laporan ada, tanpa cek status — SPV bisa meng-ACC sebelum HRD "Rilis ke SPV". Kini ACC
  hanya terbuka saat status `in_review`/`finalized` (badge "menunggu rilis HRD" saat draf), ditegakkan
  **klien + server** (`team-table.tsx` `canAcc`, `acc-button.tsx`, guard status di `actions.ts setSpvAcc`).
- **Ringkasan aspek 360° HRD hilang setelah relogin / tak tampil ke SPV** (`laporan/aspect-summary-editor.tsx`,
  `admin/laporan/actions.ts`): editor "Simpan Ringkasan" **terpisah** dari panel "Rilis ke SPV"/
  "Finalisasi", jadi HRD mengetik ringkasan lalu klik Rilis (tanpa Simpan) → teks hanya di state lokal,
  tak pernah tersimpan; `router.refresh` tak mereset textarea → tampak "tersimpan" padahal hilang saat
  relogin, dan SPV tak melihatnya. Kini editor punya **indikator "belum disimpan"** (banner amber +
  tombol berubah warna) yang menegaskan Rilis/Finalisasi **tidak** menyimpan ringkasan, **router.refresh
  setelah simpan** (tampilan = isi DB), dan `saveAspectSummaries` kini `.select()` saat update → update
  **0-baris** (RLS tolak diam-diam) dilaporkan sebagai gagal, bukan sukses palsu. (Persistensi DB sendiri
  sudah benar; ini jebakan UX + pengerasan.)
- **Form 360° — "Selanjutnya" dari indikator terakhir mentok** (`penilaian/[targetId]/assess-form.tsx`):
  tombol dulu `disabled` di indikator kuantitatif terakhir → tak bisa lanjut ke **Umpan Balik
  Kualitatif** (grup `QUAL` terpisah, hanya via rail). Kini `goNext()` melompat ke kualitatif dari
  indikator terakhir (label jadi "Ke Umpan Balik Kualitatif"); panel kualitatif diberi tombol
  "Sebelumnya" → kembali ke indikator terakhir (simetri).
- **Default `hrd_mode` tak konsisten → halaman Admin saat toggle SPV** (paritas): cookie `hrd_mode`
  **absen** (terjadi tepat setelah login yang mereset ke base) harus berarti **base/SPV**, tapi
  `kpi/page.tsx`, `monitor/page.tsx`, & `laporan/[employeeId]/page.tsx` keliru memperlakukannya
  sebagai **admin** (`=== 'spv' ? 'spv' : 'admin'`). Akibatnya toggle tampil SPV (dari `layout.tsx`
  yang sudah benar) tapi `/kpi` menampilkan "Monitoring & Audit KPI **seluruh pegawai**", `/monitor`
  keliru menolak, & detail laporan tampil raw admin. **Diseragamkan** ke `=== 'admin' ? 'admin' : 'spv'`
  (laporan: `value !== 'admin'`) — konsisten dgn `layout.tsx`/`app/page.tsx`.
- **Login: `next` rute admin bikin landing tak sinkron** (`app/login/login-form.tsx`): saat sesi
  habis di `/admin/*`, middleware menyimpan `?next=/admin/...`; login mereset mode ke base lalu
  mendarat di rute admin → halaman Admin tapi toggle SPV. Kini `next` yang menuju `/admin/*`
  dilewatkan ke `/` (gerbang memilih landing sesuai posisi-asli); rute non-admin tetap dihormati.
- **Paritas SPV ↔ HRD-mode-SPV** (2 celah kecil): (A) menu **"Laporan Hasil Saya"** kini tampil
  untuk **semua mode-base non-direksi** (termasuk HRD-mode-SPV), bukan hanya `employee`/`spv`
  (`app-shell.tsx`); (B) **Monitor Kinerja** kini **menyertakan diri SPV** (selaras Input KPI/
  Riwayat/Rekap/Laporan-Tim yang sudah memuat diri) — sebelumnya hanya lingkup HRD-mode-SPV
  (divisi) yang memuat diri (`monitor/page.tsx`). Lingkup data tim-vs-divisi tetap by-design.
- **Kebocoran umpan balik 360° mentah ke SPV** (migrasi 0012 + `app/(app)/laporan/`): sebelumnya
  SPV bisa membuka detail laporan anggota tim dan melihat **komentar per penilai BESERTA NAMA** sejak
  draf — bahkan **lebih dalam** dari HRD (yang justru hanya melihat versi anonim karena toggle
  `hideAssessorComments` keliru di-kunci ke `isHrd`). Kini SPV **tak pernah** melihat lapis 3 (RLS
  dicabut + jalur SPV diganti `loadTeamReportForSpv` yang membuang `assessors`/`byAspect`/`essays`).
- **HRD mode-SPV ikut dibatasi setara SPV** (lanjutan): halaman detail laporan dulu mem-branch hanya
  per `role`, jadi HRD dalam **mode-SPV** tetap melihat raw 360° (anonim) + panel HRD. Kini halaman
  membaca cookie `hrd_mode`; mode-SPV memakai `loadTeamReportForHrdSpv` (lingkup sedivisi, gating
  status, **buang lapis 3**) → tampilan setara SPV. Raw & finalisasi hanya di **mode admin**.
- **SPV sendiri muncul di Riwayat & Audit + Rekapitulasi Kuartal** (`app/(app)/kpi/riwayat-view.tsx`,
  `rekap-view.tsx`): cabang SPV kini menyertakan `userId` (`[userId, ...team]`) — selaras tab Input
  KPI (migrasi 0008). Sebelumnya hanya `spv_team_members`, jadi KPI diri sendiri tak terlihat di dua
  sub-tab itu. RLS baca-diri (`kpi/kpiaudit/r360/penalty`) sudah mengizinkan `employee_id = auth.uid()`.
- **Menu HRD mode-SPV = SPV biasa** (Input KPI Anggota · Laporan Kinerja Tim · Monitor); hapus
  item "Rekapitulasi Kuartal" terpisah yang dobel dengan tab.
- **Menu "Daftar Penilaian Saya" & "Laporan Hasil Saya" dikembalikan untuk Direksi** (`app-shell.tsx`):
  regresi dari commit grant HRD (Tahap 1) yang menambah filter `role !== 'direksi'` tanpa diminta —
  sebelumnya Direksi memang punya kedua menu. Syarat kini cukup `!adminView` (tampil semua peran di
  mode base; sembunyi hanya di Mode Admin). Guard server `/penilaian` & `/laporan` tak berubah (tanpa
  batasan peran; tampilkan data sendiri / empty-state) → aman untuk Direksi.
- **Rekapitulasi Kuartal dihapus untuk Direksi** (menu + blokir akses `/kpi`).
- **Monitor Kinerja dihapus untuk Direksi** (menu Eksekutif + blokir akses `/monitor` di server;
  pola sama dgn Rekapitulasi Kuartal).
- **Monitor Kinerja dihapus untuk HRD Admin (Mode Admin)** (`app-shell.tsx` seksi Pemantauan +
  blokir server `/monitor`): kini halaman hanya untuk **tampilan Supervisor** — guard pakai
  `supervisorView = !adminView && (role==='spv' || role==='hrd')`. **Paritas tetap utuh**: SPV biasa
  & **HRD dalam Mode SPV** tetap punya Monitor (lingkup tim/divisi); hanya Mode Admin yang kehilangan.
- **Konsistensi mobile**: tabel lebar dibungkus `overflow-x-auto` + `min-w`.
- **Aksesibilitas**: `SearchableSelect` keyboard-nav (↑/↓/Enter/Esc) + ARIA; tombol menu mobile
  `aria-label`/`aria-expanded`.
- **Keterbacaan teks (kontras + ukuran)**: `text-gray-400`→`text-gray-500` (lulus WCAG AA) &
  teks <10px→`text-[10px]` di seluruh `app/`+`components/`; SVG chart, em-dash/bullet, & badge
  berlatar warna dikecualikan. Murni visual untuk **semua** pengguna awas (lihat Backlog).

### Skema DB (migrasi)
- `0005_hrd_audit_log` — tabel jejak audit HRD (append-only).
- `0006_indicator_guide` — `indicators.description` + `indicators.rating_guide` (jsonb).
- `0007_indexes` — 10 indeks pelengkap pada kolom FK (future-proofing).
- `0008_spv_self_kpi` — helper `is_spv()` + perluas RLS `kpi_write`/`kpiaudit_insert` agar SPV
  boleh tulis KPI **dirinya sendiri** (least-privilege; bukan seluruh divisi).
- `0009_spv_self_report_read` — RLS `fr_read` ditambah kondisi `is_spv() AND employee_id =
  auth.uid()` → SPV kini bisa **membaca laporan dirinya sendiri termasuk yang masih draf**
  (pemantauan). Izin **tulis/ACC tidak berubah** (`fr_spv_acc` tetap `is_my_member`, mengecualikan
  diri sendiri). Diterapkan & diverifikasi langsung ke DB (Supabase CLI tak punya binary platform).
- `0010_period_kpi_standard` — `periods.kpi_standard smallint NOT NULL default 80` (+ check 0–100):
  target KPI per kuartal untuk metrik dashboard "% di atas standar". **Murni pelaporan**, bukan
  ambang rumus skor (jangan disuntikkan ke `lib/scoring.ts`). Diterapkan & diverifikasi ke DB.
- `0011_report_in_review` — `ALTER TYPE report_status ADD VALUE 'in_review'` (aditif). Status
  baru di antara `draft` & `finalized` untuk tahap **HRD merilis ke SPV**. ⚠️ Harus diterapkan
  **terpisah** dari 0012 (nilai enum baru tak boleh dipakai di transaksi yang sama saat dibuat).
- `0012_report_visibility_rls` — **cabut `is_my_member(target_id)`** dari `asmt_read`/`ais_read`/
  `aqa_read`. **Menutup kebocoran**: sebelumnya SPV bisa baca umpan balik 360° **mentah anggota tim
  hingga komentar BERNAMA** sejak draf. Kini SPV **tak pernah** baca tabel mentah; detail agregat
  untuk SPV dihitung server via `service_role` (`loadTeamReportForSpv`) — hanya saat `in_review`/
  `finalized`. Diterapkan & diverifikasi (`pg_policies` bersih dari `is_my_member`; `verify:rls` 21/21,
  termasuk 3 assertion baru: SPV ditolak baca `assessments`/AIS/AQA anggota tim).
- `0013_hrd_admin_grant` — `employees.is_hrd_admin boolean NOT NULL default false` + redefinisi
  `is_hrd()` → `role='hrd' OR is_hrd_admin`. Memisahkan **izin** HRD dari **posisi** `role`. Aditif
  & backward-compatible (default false → HRD lama tetap via `role='hrd'`). Diterapkan & diverifikasi
  (kolom ada, `is_hrd()` hormati grant, `verify:rls` 21/21).
- `0014_correction_reviewed_at` — `relation_correction_requests.reviewed_at timestamptz` (nullable):
  stempel waktu HRD MENYETUJUI/menolak koreksi relasi (beda dari `created_at` = saat diajukan). Dipakai
  deteksi "Skor 360° basi" (koreksi di-ACC setelah hitung ulang → kelas bobot berubah). Aditif &
  backward-compatible (baris lama NULL → tak memicu peringatan). Diterapkan & diverifikasi (kolom ada).
- `0015_mapping_is_adhoc` — `mappings.is_adhoc boolean NOT NULL default false`: penanda eksplisit
  pemetaan **Ad-Hoc** (ditambah mandiri penilai) agar bisa **dihapus** tanpa rancu penugasan HRD.
  Backfill: baris `mandatory=false AND relation='Cross'` lama → `is_adhoc=true` (sejak "semua wajib",
  satu-satunya sumber non-mandatory adalah Ad-Hoc). Aditif & backward-compatible. Diterapkan & diverifikasi.
- `0016_employee_is_external` — `employees.is_external boolean NOT NULL default false`: penanda
  **pegawai eksternal** (vendor/freelance) yang **hanya menilai** (relasi Cross), tanpa KPI/Skor Akhir/
  laporan & disembunyikan dari jalur subjek. Aditif & backward-compatible (default false → semua pegawai
  lama = internal). Diterapkan ke DB produksi & diverifikasi (kolom ada).
- `0017_period_form_open` — `periods.form_open boolean NOT NULL default true`: **memisahkan**
  "form penilaian terbuka untuk pegawai" dari `has_360` ("360° dihitung ke skor"). Memungkinkan HRD
  **menutup form** (membekukan pengisian untuk review/finalisasi) **tanpa** mematikan 360° & **tanpa**
  menyembunyikan tombol Hitung Ulang. Gerbang form pegawai = `has_360 && form_open`; guard tulis
  (`submitAssessment`/`addAdhocTarget`/`requestCorrection`) menolak bila `!form_open`. Saklar UI
  **"Tutup/Buka Form"** di Kelola Periode (terpisah dari "Set Tanpa 360°"); audit `period.toggleForm`.
  Aditif & backward-compatible (default true → perilaku lama). Diterapkan ke DB produksi & diverifikasi.
- `0018_employee_cross_reviewer` — `employees.is_cross_reviewer boolean NOT NULL default false`: grant
  **Peninjau Hasil Lintas Divisi**. **SENGAJA TIDAK** menyentuh `is_hrd()` (= `role='hrd' OR
  is_hrd_admin`) → pemegang grant tetap pegawai biasa di level RLS; akses lintas-divisi diberi hanya
  lewat server (`service_role`) di jalur `/peninjau` yang menegakkan "divisi target ≠ divisi peninjau".
  Jadi batas privasi NYATA (bukan app-only). Aditif & backward-compatible (default false). Diterapkan
  ke DB produksi.
- `final_reports.content` (jsonb, kolom lama) dipakai untuk `aspectSummaries` (tanpa migrasi baru).

### Infra / Testing / CI
- **Vitest** (`npm test`) + **55 tes** (logika skor + parsing impor Excel); rumus 360° diekstrak
  ke `lib/score360.ts`. Rincian di bagian **Pengujian**.
- **GitHub Actions** (`.github/workflows/ci.yml`): test + typecheck + build tiap push/PR.
- **Skrip reset** (`scripts/reset-*.{sql,mjs}`): backup→kosongkan, 3 tingkat granularitas
  (transaksional / sisakan pegawai / pemetaan saja). `backups/` gitignored.
- **Skrip terapkan migrasi** (`scripts/apply-migration.mjs`): jalankan satu file SQL migrasi ke
  DB via `pg` + `SUPABASE_DB_URL` (dalam transaksi, auto-rollback bila gagal). Dipakai karena
  **Supabase CLI tak punya binary** untuk platform ini (Windows). `pg` dipasang sementara
  (`npm install --no-save pg`) lalu dilepas — bukan dependensi tetap project.
- **Upgrade `xlsx` → 0.20.3 (CDN SheetJS resmi)** — menutup advisory **high** (prototype-pollution
  + ReDoS) yang tak ada fix-nya di registry npm. `package.json` menunjuk tarball CDN; API & kode
  impor tak berubah. `npm audit fix --force` tetap **DILARANG** (menurunkan Next 16→9).
- **Hapus arsip SPA legacy** — route `/legacy` + seluruh `src/` (`App.tsx`/`data.ts`/`types.ts`)
  dihapus. Data benih seed dipindah ke **`scripts/seed-data.ts`** (mandiri, tipe inline) agar
  `scripts/seed.ts` tak lagi bergantung `src/`. Build/typecheck/test hijau tanpa `src/`.
- **Ekstrak parsing impor → `lib/import/parse.ts`** (murni, teruji): `parseKpiRows`/`isValidKpiRow`
  & `parseMappingRows`/`classifyMappingRows`. `kpi-form.tsx` + `mapping-import.tsx` kini memakainya
  (logika `pick`/validasi/klasifikasi tak lagi inline). +27 tes (`tests/import.test.ts`). **Perbaikan
  kecil**: skor KPI kosong kini **dilewati** (dulu diimpor sebagai 0).
- **Verifikasi RLS** — `scripts/verify-rls.ts` (`npm run verify:rls`): fixture user uji mandiri +
  login per peran, **21 assertion** (`kpi_scores` baca/tulis **+ umpan balik 360° mentah lapis 3**:
  SPV ditolak baca `assessments`/AIS/AQA anggota tim [0012] + kontrol positif HRD/penilai/target);
  self-cleaning, aman ke data nyata. (Lihat Pengujian.)

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
