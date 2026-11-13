# CLAUDE.md — Infarm 360° Performance Appraisal System

Pegangan Claude Code di repo ini: aturan tetap, invariant, pola kerja, perintah. Status, riwayat, dan
langkah operasional **tidak** ada di sini — lihat peta dokumen.

## 1. Apa ini
Aplikasi web **penilaian kinerja 360° internal** Infarm (KPI bulanan + umpan balik 360° → Skor Akhir →
klasifikasi talenta → laporan bertahap). **Bukan e-commerce** — tak ada pembayaran, keranjang, stok, pengiriman.

Peran (`employees.role`, logika di `lib/auth/roles.ts`):
- **Employee** — mengisi 360°, melihat laporan sendiri saat Final.
- **SPV** — input KPI tim + diri, ACC laporan tim, monitor tim.
- **HRD Admin** — **izin** (`is_hrd_admin`), bukan posisi. Cek via `canAdmin()`/`canSection()` atau RLS
  `is_hrd()` (= `role='hrd' OR is_hrd_admin`), **jangan** `role === 'hrd'` mentah. Mode ganda: cookie
  `hrd_mode` = `admin` | `spv` (base); **default login = base**.
- **Direksi** — Dashboard Organisasi, ACC suksesi, ACC laporan **SPV saja** (laporan non-SPV ditolak),
  Tinjauan Hasil Akhir (read-only).
- Tambahan sebagai **izin**, bukan peran baru: **Koordinator** (`is_coordinator` + `coordinator_team_members`)
  dan **grant halaman berlingkup** (`page_grants`).

Acuan fungsional: `PANDUAN Infarm 360 Portal.pdf` dan [docs/PANDUAN.md](docs/PANDUAN.md).

## 2. Peta dokumen
| File | Isi |
|---|---|
| [docs/RENCANA.md](docs/RENCANA.md) | status terkini, pekerjaan terbuka (🔑 = butuh pengguna), ide opsional, catatan operasional |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | riwayat & alasan keputusan, fitur yang dicabut |
| [docs/TEKNIS.md](docs/TEKNIS.md) | alur branch/staging/migrasi, env var, aktivasi (email, Lupa Sandi, Mode Maintenance, cron), rumus & tabel klasifikasi, model akses, daftar migrasi, pengujian, backup, PDF |
| [docs/PANDUAN.md](docs/PANDUAN.md) | panduan pengguna per peran + tombol + SOP HRD (bahasa awam) |
| `docs/pengembangan/DESAIN-MANAJEMEN-AKSES.md` | catatan keputusan izin 3 tingkat (dirujuk migrasi 0032/0033) |
| `docs/panduan/REVISI-PANDUAN-PDF.md` | arsip — teks revisi 4 PDF yang sudah dihapus (2026-11-06); panduan pindah ke Notion |
| [docs/UJI-RILIS-Q3.md](docs/UJI-RILIS-Q3.md) | sementara — daftar uji manual rilis Q3 (gelombang 1, 2, 2b); hapus setelah rilis |
| [docs/PESAN-HRD-RILIS-Q3.md](docs/PESAN-HRD-RILIS-Q3.md) | sementara — pesan siap kirim ke HRD tentang perubahan rilis Q3; hapus setelah rilis |

Selalu perbarui RENCANA/CHANGELOG saat status fitur bergeser, dan file ini hanya bila aturan berubah.

**Notion ikut diperbarui** (pemilik, 2026-11-12): panduan pengguna yang dibaca pegawai ada di Notion "Infarm Performance
Appraisal — Docs" (panduan per peran 2A–2F, Bab 1–11, Peta Aplikasi). Tiap perubahan yang mengubah PANDUAN.md
(perilaku, tombol, menu, teks yang terlihat pengguna) → di sesi yang sama perbarui halaman Notion terkait (bahasa awam,
susunan Notion — jangan salin PANDUAN.md mentah) dan tambah entri di database **Daily Report** (di bawah "Catatan Teknis
(internal)"). Bila tampilan berubah, tandai gambar layar yang usang di entri Daily Report (diambil ulang terpisah). Panduan
pegawai/SPV/koordinator menyebut laporan pelanggaran "hanya diakses HRD" (sesuai teks pop-up) — sengaja.
Kartu **Panduan Saya** di Akun Saya menautkan halaman Notion per peran (`lib/panduan.ts`, `guidesFor` dari izin terkini,
diuji `tests/panduan.test.ts`) — bila halaman Notion dipindah/diganti, perbarui URL-nya di sana. Hanya 2A–2F yang
di-publish ke web (Bab 1–8 & halaman induk sengaja tertutup, pemilik 2026-11-12), jadi isi 2A–2F **tidak boleh merujuk
halaman lain** ("lihat Bab 5", "sama dengan Panduan Pegawai") — tulis ulang informasinya di halaman itu.
PANDUAN/RENCANA/CHANGELOG ditulis **bahasa Indonesia awam** (tanpa RLS, nama fungsi, path, nomor migrasi).

## 3. Stack & struktur
- Next.js 16 App Router (Turbopack, React 19, TS strict), Tailwind v4, Supabase (Postgres + Auth `@supabase/ssr`
  + RLS), Zod, `xlsx` (parse di klien), `nodemailer`/Resend, `@vercel/edge-config`, `motion`, `lucide-react`,
  Vitest. Deploy Vercel (auto dari `main`, preview tiap branch). CI `.github/workflows/ci.yml` (test +
  typecheck + lint + build; lint bersih sejak 2026-10-16 — jangan tambah temuan baru). Backup harian `.github/workflows/backup.yml`. npm.
- Supabase production ref `beajoczjpywozavatzmf`; ada project staging terpisah. 31 tabel publik, migrasi
  `supabase/migrations/0001`–`0060` (0060 `ai_settings` = eksperimen dev, belum wajib di production). **Production berjalan tanpa API LLM**:
  "Ringkas otomatis"/Pengaturan AI (`lib/ai/`, `GEMINI_API_KEY`) hanya dev/staging dan mati otomatis di production; ringkasan
  HRD ditulis manual. Jangan sebut fitur AI di PANDUAN/Notion selama belum dirilis. Route `/api/cron/*` tanpa sesi (dikecualikan di `lib/supabase/middleware.ts`)
  → **wajib** cek `Bearer $CRON_SECRET` sendiri, gagal tertutup. Email Rilis terjadwal dipicu GitHub Actions
  (`release-email-cron.yml`); inti kirim email rilis satu-satunya = `lib/release-delivery.ts` (manual & jadwal).
- `app/` — `login/`, `maintenance/`, `auth/` (callback, lupa-sandi, perbarui-sandi, signout),
  `api/cron/late-penalty/` (nonaktif), `(app)/` = shell persisten (`layout.tsx`, `app-shell.tsx` menu,
  `mode-actions.ts`) dengan `penilaian/ kpi/ monitor/ laporan/ laporan-tim/ review-hasil/ suksesi/ akun/` dan
  `admin/` (`periode/ pertanyaan/ pemetaan/ bobot/ 360/ progress/ kepatuhan/ laporan/ dashboard/ monitor/
  struktur/ ekspor/ akses/ pegawai/ audit/`; gate per bagian `canSection`).
  `/` = gerbang auth → landing per peran (tak ada Beranda). **Tak ada `src/`** (SPA legacy sudah dihapus).
- `lib/` — rumus (`scoring.ts`, `score360.ts`, `late.ts`, `trend.ts`), `report.ts` (loader laporan),
  `auth/roles.ts`, `supabase/` (`server.ts`: `createClient` user/RLS vs `createAdminClient` service_role;
  `paginate`), `maintenance.ts`, `email/mailer.ts`, `audit/log.ts`, `database.types.ts`.
- `proxy.ts` (cek maintenance → session), `components/` (primitif UI), `scripts/`, `tests/`.
- Fitur memakai sub-tab `?tab=`. Tombol per halaman → PANDUAN.md.

## 4. Keputusan arsitektur terkunci
- **Selalu** taruh logika sensitif (kalkulasi Skor Akhir, finalisasi, aktivasi/kunci periode, bobot) di Server
  Action / Route Handler + validasi **Zod di server** — RLS ditegakkan di DB, bukan cek UI.
- **Pola referensi** = vertical slice Input KPI (auth → Server Action + Zod → tulis skor + audit → uji RLS).
  Fitur baru mereplikasi pola ini. `result_360` & `final_reports` skor hanya ditulis server.
- **Paritas legacy yang disengaja:** edit KPI wajib komentar; input KPI pertama boleh tanpa komentar.
- **Jangan** membuat "page-builder" untuk HRD (2026-06-30): grant hanya membuka halaman dari **katalog tetap**
  (`GRANTABLE_PAGES`). Variasi per mandat = **lingkup/parameter** pada halaman existing. Kebutuhan tampilan baru
  = pekerjaan developer (kode + RLS + uji). Reframe tiap permintaan jadi "halaman existing mana + lingkup apa".
- **Aplikasi menegakkan kebijakan, bukan menambal kelalaian** (2026-06-25): jangan usulkan pengaman keteledoran
  (mis. penegasan "wajib tekan Kirim") tanpa permintaan eksplisit. Pengecualian yang sudah diminta: konfirmasi
  hapus Ad-Hoc = modal in-app `app/(app)/penilaian/modal.tsx` (alasan konsistensi design system).
- **Progress 360** (`admin/progress`, pemantauan) dan **Flag Kepatuhan** (`admin/kepatuhan`, potongan
  keterlambatan −3) **sengaja terpisah** — bukan duplikasi, jangan digabung.
- **Kebijakan mutlak:** semua rating + evidence (≥ 20 karakter) + semua esai wajib sebelum Kirim.
- **Jangan** dorong aksesibilitas ke pembaca layar (`aria-*`/`role`/uji NVDA) tanpa diminta — basis pengguna tak
  membutuhkannya; percobaan sebelumnya di-revert. Keterbacaan (kontras, ukuran ≥ 10px) tetap dijaga.

## 5. Keamanan & privasi
- **Jangan** expose `SUPABASE_SERVICE_ROLE_KEY` ke client; hanya `NEXT_PUBLIC_*` yang boleh.
- Lapis informasi laporan (dipakai di kode & komentar): **L1** Skor Akhir · **L2** agregat (radar/aspek +
  ringkasan HRD) · **raw anonim** (`byAspect`/`essays`, komentar & rating verbatim tanpa identitas) ·
  **L3** `assessors` (umpan balik **bernama** per penilai).
- **Jangan pernah** kirim L3 ke non-HRD — **buang di server**, bukan disembunyikan di layar (`ReportDoc` komponen
  klien). Loader tim (`loadTeamReportForSpv`/`ForCoordinator`/`loadSpvReportForDireksi`/`loadTeamReportForHrdSpv`/
  `loadReportForDireksiReview`) dan jalur grant Review (`reportForGrantViewer`) membuangnya. Di layar laporan mana
  pun komentar tampil anonim (juga untuk HRD); siapa-menilai-siapa hanya di Pemetaan/Progress 360 (HRD).
- RLS raw 360° (`asmt_read`/`ais_read`/`aqa_read`, `map_read`, `corr_read`) hanya HRD (+ penilai atas miliknya);
  tanpa `is_my_member`, tanpa cabang target/Direksi. Paparan raw anonim ke SPV/Koordinator/Direksi =
  **app-level** via `service_role`, hanya saat laporan `in_review`/`finalized`. ⚠️ Risiko de-anonimisasi pada
  kelas penilai kecil; mudah dibalik. **Pengecualian tanpa gerbang status (disengaja):**
  - Grant "Review & Finalisasi" melihat raw anonim **sejak draf** — tugasnya membantu menyusun ringkasan aspek.
    L3 tetap dilarang.
  - Tinjauan Hasil Akhir Direksi (`/review-hasil`, `loadReportForDireksiReview`): semua pegawai, semua status
    termasuk draf, read-only; L3 dibuang.
  - Monitor boleh menampilkan skor 360° **berjalan** sebelum laporan dirilis. Setelah dirilis/Final, angkanya
    harus sama dengan laporan.
- Lingkup raw SPV = seluruh pegawai **sedivisi** (`inSpvDivisionScope`) — hanya untuk detail laporan; KPI/Monitor/
  ACC/RLS `is_my_member` tetap `spv_team_members`. Laporan **diri sendiri tanpa raw** (`withoutRaw`) kecuali HRD
  Mode Admin & Direksi. Anggota tim koordinator wajib sedivisi.
- **RISIKO YANG DITERIMA SECARA SADAR (pemilik, 2026-10-16) — laporan diri sendiri pemegang izin HRD:** HRD Mode
  Admin melihat komentar mentah anonim di laporannya sendiri **dan** boleh meringkas, merilis, serta memfinalisasi
  laporannya sendiri (`resolveReportWriter` jalur HRD tanpa cek diri sendiri). Alasan: tidak ada orang lain yang
  mengurus laporan HRD admin. **Jangan tandai lagi sebagai temuan audit** dan jangan tambahkan penolakan tanpa
  permintaan. Yang tetap berlaku: L3 (nama penilai) dibuang di server untuk tampilan HRD (`withoutNamedFeedback`);
  pemegang grant Review non-HRD tetap ditolak untuk laporannya sendiri; ACC laporan sendiri tetap ditolak (0049).
  Aturan database yang melarang membaca penilaian atas diri sendiri **tidak** dibuat (keputusan yang sama).
- Employee hanya membaca laporannya saat `finalized` (dimuat via service_role). Direksi read-only + ACC.
- **Laporkan Pelanggaran** (dulu "Catatan di Luar Pemetaan"; tabel `outside_mapping_notes`, 0054 + 0058, keputusan
  pemilik 2026-11-03 & 2026-11-10) — rincian TEKNIS.md §5.4:
  - **Anonim secara skema:** tabel **tanpa** kolom penulis (id/email/hash/token) dan **tanpa** waktu kirim; jangan
    tambahkan. `incident_date` = tanggal **kejadian** isian pelapor (bukan waktu kirim). Identitas pengirim di
    `submitOutsideNote` hanya untuk validasi — **jangan** tulis ke tabel, audit log, `console`, pesan error, atau
    notifikasi. Urutan tampil = tanggal kejadian terbaru lalu abjad isi (`sortViolations`), bukan id/urutan masuk.
    Tanpa riwayat untuk pengirim; tak bisa diubah/dihapus pegawai. Kode laporan / Cek Status **belum** dibangun.
  - **Baca hanya HRD Mode Admin** berbagian Review & Finalisasi **dan Direksi** (`violationPageAllowed`; Direksi = semua
    laporan, hanya baca, tanpa ekspor — pemilik 2026-11-11), termasuk laporan tentang dirinya sendiri (tetap anonim),
    lewat `loadViolationReports` di dua jalur saja: halaman **Laporan Pelanggaran** (`admin/pelanggaran`) dan ekspor **Bahan Laporan per Pegawai** lembar 4 (cookie `hrd_mode='admin'`; kolom =
    periode/pegawai/divisi/tanggal kejadian/kategori/laporan/catatan, tanpa pelapor/relasi/waktu kirim). Sejak 0058
    laporan **tidak** lagi tampil di rincian komentar laporan; `loadReport` & loader lain tak memuatnya. Akses DB
    hanya service_role (RLS tanpa policy).
  - **Bukan Ad-Hoc:** tak menyentuh `mappings`/`assessments`/skor; tak masuk Skor 360°, Skor Akhir, Progress,
    Kepatuhan, potongan telat, tugas. Hanya `outside-note-actions.ts` & `lib/outside-notes.ts` yang menyebut
    tabelnya (dikunci `tests/outside-notes.test.ts`). Pengirim eksternal ditolak (sementara).
- **Rencana Pengembangan** (0055, TEKNIS.md §5.5): melekat ke periode **laporan** (terbuka bila laporan Final & HRD
  belum menutup; periode aktif tak berpengaruh). Atasan = `resolveSupervisor` (koordinator → SPV → Direksi untuk SPV/
  pemimpin tim → HRD cadangan; atasan **nonaktif** dilewati di `loadSupervisorResolver`); SPV dari pegawai
  berkoordinator hanya melihat. Rencana milik pegawai nonaktif = lihat saja (`planById` menolak semua aksi tulis). Persetujuan HRD hanya
  **posisi** `role='hrd'` di Mode Admin (`canHrdSign`, pengecualian sadar dari aturan `is_hrd()`); boleh atas rencana
  sendiri setelah atasan. **Tak ada Buka Kembali** (pemilik 2026-11-03): pemilik hanya bisa Tarik Kembali selama
  Menunggu Atasan; sesudah atasan menyetujui rencana terkunci. **Pemisahan mode ketat** (`inAdminView`): Mode Admin =
  wewenang HRD saja (bukan pemilik rencana / atasan SPV); Mode SPV = wewenang posisi asli. Tulis hanya `pengembangan/actions.ts` (service_role); isi berubah hanya di Draf/Perlu Perbaikan sehingga
  persetujuan selalu atas isi yang sama. Tidak menyentuh skor/`final_reports`. Batas disepakati = informasi saja.
  Catatan sesi 1-on-1 / tinjauan HRD (0056) hanya setelah Disepakati; aplikasi **hanya mencatat** — jangan tambahkan
  hitungan atau penanda terlambat tanpa permintaan. Ekspor rencana bernama (`exportDevPlans`, Mode Admin saja).
  Pengaman DB 0057: prioritas hanya berubah di Draf/Perlu Perbaikan (trigger, juga untuk service_role), simpan lewat
  `dev_plan_replace_items` (atomik), kolom `periods.dev_plan_*` hanya diubah server — jangan tulis langsung dari app.
- **KPI hanya lewat Server Action** (`kpi_write` RLS dicabut): lingkup `assertKpiScope` (HRD = divisinya sendiri
  + diri, apa pun modenya · SPV tim+diri · Koordinator tim), tulis atomik `kpi_save_with_audit`/`kpi_delete_with_audit`. Audit KPI tak boleh
  diubah/dihapus dari client.
- Periode terkunci & form tertutup ditolak server (`assessment_writable`, trigger). Kirim ulang hanya sampai
  deadline (`assessment_locked_after_deadline`).
- `?next=` login/callback lewat `safeNext` (cegah open redirect).
- **Cek sesi hemat log** (2026-11-05, TEKNIS.md §5.0): proxy = `getClaims()` (gerbang + refresh); halaman & Server
  Action **tetap** `getUser()` sebelum membaca data — jangan diganti. Tautan menu/tab/daftar baru pakai
  `prefetch={false}` (tiap prefetch = 1 cek sesi). Route publik baru hanya lewat `isPublicPath` + tes.
- Repo **publik**: jangan commit data pegawai, backup mentah, email, kredensial, atau CSV `BACKFILL-*`.

## 6. Invariant akses
- **Paritas SPV ↔ HRD Mode-SPV (wajib):** tiap perubahan perilaku SPV (lingkup tim, menu Supervisor, RLS/scope
  KPI, Laporan Kinerja Tim, Monitor, aturan ACC) **harus** berlaku identik untuk HRD Mode-SPV. Titik sentuh:
  `app-shell.tsx` (menu base), `kpi/` (`riwayat-view`/`rekap-view`/`InputTab`), `monitor/`, `laporan-tim/`,
  `laporan/[employeeId]` (jalur `asSpv` + `loadTeamReportForHrdSpv`). Jangan tinggalkan cabang `role==='hrd'`.
  Paritas yang sama berlaku ke jalur grant halaman.
- Pegawai berkoordinator: ACC & input KPI oleh **koordinator**; SPV/HRD Mode-SPV hanya lihat status.
  Koordinator dinonaktifkan → baris `coordinator_team_members`-nya dihapus (anggota kembali ke SPV; pemilik 2026-11-09).
- Aktif/nonaktif pegawai (`setEmployeeActive`) hanya mengubah pemetaan periode yang **belum berakhir** per tanggal aksi;
  aktif kembali tidak menghidupkan pasangan hasil permohonan hapus yang disetujui (`lib/employee-activation.ts`).
- **ACC (`setSpvAcc`) lingkupnya ditegakkan server** lalu ditulis via service_role (RLS tak cukup: `hrd_can('laporan')`
  lolos untuk laporan siapa pun): tak ada yang meng-ACC laporannya sendiri (+ trigger 0049); SPV = `spv_team_members`;
  HRD posisi = sedivisi (bukan Direksi/eksternal), juga HRD tanpa bagian Laporan (paritas). Log ACC dicatat app.
- **Riwayat laporan = bukti** (2026-10-16): perubahan ACC/status/Skor Akhir `final_reports` dicatat trigger DB ke
  `final_report_history` (0052) — jangan tulis tabel itu dari app; jalur baru yang menulis `final_reports` otomatis tercatat.
- Izin HRD Admin (`is_hrd_admin`) hanya boleh diberikan ke pegawai divisi **HRD-GA** (`isHrdDept`); pencabutan
  selalu boleh. Ubah izin & akun HRD/Direksi
  hanya HRD penuh (`isFullHrd`); tak ada yang mengubah izin dirinya (`employees_guard_privileges`).
- `hrd_sections` (Atur Akses): menu + **tulis** dibatasi (`canSection`, DB `hrd_can`); **baca** tetap `is_hrd()`.
- **Grant halaman (`page_grants`) — model beku:** 1 grant = orang + halaman + lingkup (multi) + izin 3 tingkat
  (Lihat / Meringkas=`can_edit` / Finalisasi=`can_finalize`; halaman pemantauan selalu Lihat). Tiap halaman yang
  di-grant **wajib**: (1) gate sadar-mode `isHrdFull = canSection(page) && hrdMode==='admin'`; (2) baca jalur grant
  via service_role berlingkup (`grantedScope`/`grantedAccess`/`deptScopeFilter`/`applyDeptScope`/
  `employeeInScopes`, diuji `tests/page-scope.test.ts`); (3) `?dept=` tak boleh menembus lingkup (`resolveDept`);
  (4) tulis non-HRD ditegakkan server (`resolveReportWriteActor`) via service_role. Untuk pemegang `is_hrd()`
  batas izin = tampilan saja. Rincian → TEKNIS.md §5.
- Finalisasi = HRD **atau** grant Review tingkat Finalisasi berlingkup. Peninjau Lintas Divisi = grant Review +
  `other_divisions` + Meringkas (`is_cross_reviewer`/`/peninjau` sudah dipensiunkan; jangan hidupkan lagi).

## 7. Aturan skor (terkunci — `lib/scoring.ts`, `lib/score360.ts`, `lib/late.ts`)
Kode BR-xx = nomor aturan bisnis dari HRD (keputusan 2026-10-01).
- **Selalu** pakai helper, **jangan** hitung Skor Akhir/rerata KPI manual di halaman: `finalScoreOf(kpi, s360,
  has360)` (tanpa KPI → 360° saja; 2 desimal = `numeric(5,2)`), `kpiAvgOf` (presisi penuh, bulatkan di akhir),
  `roundScore`/`fmt2` (bukan `toFixed`), klasifikasi atas nilai terbulat. Angka tampil = `displayedFinalOf`
  (Final → `final_reports.final_score`; selain itu hidup). Selisih hanya di Review & Finalisasi (`hasScoreDrift` ≥ 0.01).
- Skor Akhir = blend KPI + 360 **tanpa** pengurang lain. Fitur Punishment manual **dihapus** (2026-10-01); tabel
  `compliance_penalties` dorman — jangan dibaca/ditulis.
- **Selalu** lewat `schemeFor`/`effectiveModel` sebelum `weightedScore360` — jangan suapkan model DB langsung.
  BR-10: model 2 kelas pada periode ≥ `AUTO_WEIGHT_FROM` (2026-07-01) = bobot otomatis 40/60 · 60/40 · 100%;
  4 kelas & bobot khusus pegawai apa adanya; Q1–Q2 bobot tersimpan. Self selalu dikecualikan.
- Skor 360° resmi `result_360.score` = `score_raw` − `late_penalty` (flat −3, min 0; kewajiban = Wajib + AJUAN
  sejak `AJUAN_PENALTY_FROM`; nilai bisa ditetapkan HRD `late_penalty_waivers.points`). `first_submitted_at`/
  `forced_by_hrd` diisi **trigger DB** — jangan tulis/andalkan dari app. Potongan diterapkan otomatis saat HRD
  membuka Kepatuhan/Review & sebelum `computeFinal`; cron nonaktif (`vercel.json` sengaja tak ada).
- **Jangan** ganti filter `status='submitted'` menjadi "bukan draft" — `invalidated` (penilaian dibatalkan) =
  arsip, tak pernah masuk skor, kewajiban rater gugur. Penilaian Terkirim tak boleh dihapus.
- BR-07 status (`progressStatusOf`), BR-09 "No Score" (`NO_SCORE_LABEL`), BR-11 `playerClassOf` → `HRD_REVIEW`
  bila satu sumbu kosong (termasuk kuartal tanpa 360°). 4-Box = KPI × 360° ambang 80, **tanpa D**.
- 9-Box dihapus dari UI, tetapi **jangan** hapus `talentBoxOf`/`kpiBandOf`/`s360BandOf` (terkunci & diuji).
- Klasifikasi Dashboard dikunci ke satu kuartal lewat filter periode (KPI, 360°, Skor Akhir dari periode yang sama). Standar KPI (`kpi_standard`) dan
  semua dashboard = pelaporan, bukan ambang rumus.
- Direksi = subjek 360° terbatas: tampil di Review & Ekspor (Skor Akhir = 360°); `.neq('role','direksi')` di
  Dashboard/4-Box/KPI/monitor (termasuk Monitor HRD)/laporan-tim **sengaja dipertahankan**. **Kepatuhan menyertakan
  Direksi** (pemilik 2026-11-09): potongan telat −3 Direksi sebagai penilai harus terlihat & bisa diubah HRD.
- **Laporan Final terkunci** (keputusan 2026-10-12, `lib/final-lock.ts`): angka laporan Final tak boleh berubah
  kecuali HRD menekan **Buka Kembali (ke Draf)** dulu. Jalur satu pegawai → tolak (`finalLockError`; KPI per bulan
  lintas periode → `finalLockErrorForMonths`); proses massal (Hitung Ulang, `refreshLatePenalties`) → lewati pegawai
  Final & laporkan jumlahnya; pengaturan seluruh periode (bobot, pertanyaan, `has_360`, hapus periode) → tolak bila
  ada laporan Final (`periodLockError`). Gagal membaca status = tolak. Jalur baru yang mengubah angka WAJIB lewat sini.
- Periode terkunci **boleh dibuka kembali** (laporan Final aman; selisih ditandai). Karena itu pengaman Q1 wajib
  di server: `lib/backfill-guard.ts` (`backfillLockReason`, **gagal tertutup**) menolak Hitung Ulang & potongan telat
  periode hasil impor (`score360.backfill`) — jangan
  Hitung Ulang Q1 2026.
- `lib/score360.ts` diekstrak dari `app/(app)/admin/360/actions.ts` — jaga sinkron.
- **Mengubah rumus atau ambang** = ubah kode + tes + tabel TEKNIS.md §4 sekaligus.

## 8. Design System Infarm (acuan tetap — seluruh aplikasi sejak 2026-11-04)
Pemilik memilih Design System Infarm (artifact "Infarm" dari Infarm-Web) untuk **semua** halaman, login, dan komponen
bersama (2026-11-03/04). Aturan token & "kartu flat tanpa bayangan / font sistem" yang lama tidak berlaku lagi.
- **Token** di `app/globals.css` (`@theme`) — **selalu** pakai utilitas token: `surface`, `ink`/`ink-soft`/`ink-faint`,
  `line`/`line-soft`/`line-strong`, `brand`/`brand-tint`/`brand-ink`, `warn`/`warn-tint`/`warn-ink`,
  `danger-tint`/`danger-ink`, `neutral-tint`, `infarm-surface`/`infarm-light`/`infarm-soil`/`infarm-cream`/`infarm-dark`,
  `rounded-card` (16px) / `rounded-control` / `rounded-xl`, `shadow-card`. **Jangan** hex mentah di kelas, palet
  Tailwind default (`gray-*`, `emerald-*`, `rose-*`, `amber-*`, `indigo-*`, `blue-*`, …), `rounded-2xl`, `shadow-xs`.
  **Tanpa biru/ungu**, **tanpa emoji** di UI (ikon = `lucide-react`). Teks ≥ 10px, kontras AA (`ink-faint` hanya dekorasi).
- **Primitif** `components/infarm-ui.tsx` (tanpa hook; aman server/klien): `CARD` (putih, garis tepi + bayangan tipis),
  `PageTitle`, `CardTitle` (ikon lucide 16px), `SectionHeader` (garis aksen + pemisah), `Note` (penjelas kecil netral;
  `tone="warn"`), `StatCard(s)` (tone `brand|danger|warn|soil|neutral`; hanya angka utama berlatar hijau), `FIELD`/
  `FIELD_LABEL`/`TABLE_HEAD`/`pillCls`, palet `CAT_COLOR` (≥90 cokelat `#6b4e3d` · 80–89 hijau · 70–79 kuning · <70 merah),
  `PLAYER_TONE` (4-Box), `TREND_CHIP`. Heatmap = `heatColorInfarm` (= `heatColor`, ujung biru → cokelat). Komponen bersama
  (`Button`, `Panel`, `StatusChip`, `ConfirmDialog`, `EmptyState`, `SearchableSelect`, `table-controls`, `TabNav`, …) sudah
  bergaya ini; `ConfirmDialog`/`EmptyState` mengubah string emoji di prop `icon` menjadi ikon lucide (`components/emoji-icon.tsx`)
  — pemanggil baru sebaiknya langsung memberi elemen ikon. **Jangan** ubah `PLAYER_BOXES`/`TREND_META`/`heatColor` di `lib/`.
- **Kanvas** `<main>` = `INFARM_PAGE` (`app/infarm-fonts.ts`) + `px-5 py-7 lg:px-7` — impor HANYA dari `page.tsx`
  (next/font tak berjalan di Vitest). Laporan cetak: `print:bg-white`, kartu `print:shadow-none`, pertahankan `.no-print`.
- **Font** `next/font/local` + woff2 di `app/fonts/` (jangan `next/font/google`: build Turbopack Vercel gagal) = Geist teks ·
  Geist Mono semua angka/data/ID · Montserrat h1–h4 (Geist Mono untuk semua teks dicoba & ditolak). Aturan `.infarm-ds`
  wajib di `@layer base` agar utilitas bisa menimpanya. Sidebar (di luar `.infarm-ds`) tetap font sistem.
- **Bagian harus jelas terpisah** (pengguna 2026-11-04 — versi pertama "menyaru"): `SectionHeader`, kartu metrik terpisah
  berikon, judul kartu berikon, kartu bergaris tepi + bayangan, catatan kecil & netral. Jangan gabungkan metrik ke satu
  blok berwarna.
- **Skala RAPAT** (pengguna 2026-11-04 — skala besar 30/18/14 + kontrol 44px ditolak: "besar-besar", kurang rapi):
  h1 22 · angka utama ringkasan 20 · angka kartu 18 · judul kartu 16 bold · isi 13 · keterangan 12 · label bagian 12
  kapital · kontrol/tombol tinggi 36px · kartu p-4 · sidebar 12px. Filter tunggal = label sejajar ("Periode: [ ]") tanpa
  kartu. Seri chart: utama `#00843b` · pembanding `#f08c00` (mis. radar Self — oranye, keputusan pengguna) · ketiga
  `#3b4a2e` putus-putus.
- Pemetaan semantik (invariant): **brand** = primary/aktif/positif ("Terkirim", Final) · **warn** = peringatan/pending/
  obligasi ("Wajib", draf, skor basi) · **danger** = error/destruktif/terlambat · **neutral** = nonaktif/info. Solid hanya
  tombol utama; status = chip soft-tint `rounded-full`. Satu tombol utama per baris tabel; aksi lain → `OverflowMenu`.
- **Sub-tab = tab map** (pemilik 2026-11-06, `components/tab-nav.tsx`: `TabBar` + `Tab`/`TabButton` + `TabPanel`): tab aktif
  putih menyatu dengan lembar isi. Kapsul (`pillCls`) khusus pilihan/filter di dalam satu tampilan, supaya sub-tab tak terbaca
  sebagai filter. Halaman baru yang punya sub-tab wajib memakai komponen ini.
- **Sidebar** (`app-shell.tsx`, pemilik 2026-11-04): bilah atas + kepala sidebar hijau `brand` (teks putih, satu pita
  setinggi 56px), **seluruh** badan sidebar putih (kartu periode tetap krem) + tepi kanan `border-line-strong` dan bayangan
  tipis ke kanan — agar sidebar jelas terpisah dari lembar kerja `infarm-surface` (pemilik 2026-11-05: blok status berwarna
  lembar kerja membuat sidebar menyaru; jangan pakai `infarm-surface` sebagai latar blok sidebar, hanya untuk hover). Bisa ditutup di desktop (tombol ☰ di bilah atas; cookie
  `sidebar_collapsed` dibaca `layout.tsx` agar tak berkedip). Saat ditutup: jejak grup › halaman + ▾ halaman segrup + pil
  periode/Tugas/mode. Isi `menuFor` (menu, urutan, gate akses) tidak berubah; HP tetap laci.
- ⚠️ `laporan-tim/team-table.tsx` & `scorecards.tsx` dipakai bersama Monitor; `admin/laporan/report-table.tsx` dipakai juga
  Tinjauan Hasil Akhir (Direksi) — mengubahnya mengubah halaman lain.
- **Tinjau laporan dua kolom** (2026-11-12, `laporan/report-split.tsx` `ReportSplit`): detail laporan untuk HRD Mode Admin &
  pemegang akses Review di layar ≥ xl = kiri dokumen + editor ringkasan, kanan Rincian Komentar Murni (sticky, gulir
  sendiri). Layar kecil & cetak tetap bertumpuk. Radar aspek dua kolom lewat container query kartu (`@2xl`), bukan lebar layar.
- **Tabel berpager wajib stabil** (2026-10-15): `table-fixed` + `<colgroup>` (`colPercents`), kelas `table-1line`
  (isi sel 1 baris, keputusan pengguna), dan tabel + pager dibungkus `StableHeight` (`components/table-controls.tsx`)
  — ukuran tak boleh bergeser saat paging/filter/tab. Daftar yang barisnya bisa dibuka-tutup (Progress 360) dikecualikan.
- Label di dalam SVG chart (radar `report-doc`, grafik Monitor) boleh < 10px agar grafik tak berdesakan.

## 9. Konvensi & pengujian
- TS strict; hindari `any`. Komentar & label UI bahasa Indonesia mengikuti istilah PANDUAN ("Mulai Nilai",
  "Final Report", "Garis Hubungan").
- **Istilah UI baku** (audit kalimat pemilik, 2026-11-13): Tinjauan & Finalisasi · Dasbor · Progres Umpan Balik 360° ·
  Pemantauan & Audit KPI · Pengisian KPI · persetujuan/Setujui (bukan ACC) · tenggat (bukan deadline) · formulir · nilai
  (bukan rating) · berkas · templat · peta panas · Rerata · atur ulang sandi · sesi empat mata · Rekan/Lintas Divisi/Diri
  Sendiri (label saja — **nilai data** relasi `Peer`/`Cross`/`Self` di DB, enum Zod, impor Excel, dan rumus tetap). Pesan
  ke pengguna tidak menyebut nomor migrasi/nama tabel ("Hubungi admin aplikasi"). Istilah yang ditetapkan HRD (status
  BR-07, No Score, HRD Review, nama kelas 4-Box termasuk "B-Culture", kategori/RTL lama) **tidak** diubah tanpa HRD.
- Tipe skema di `lib/database.types.ts`; tipe per-fitur inline/di lib terkait — jangan duplikasi.
- **Lint React hooks:** jangan definisikan komponen di dalam komponen (pakai tingkat modul atau fungsi render
  biasa); jangan `setState` di effect untuk "reset saat nilai berubah" — lakukan di handler atau pola "bandingkan
  nilai sebelumnya saat render". Effect yang memang sinkron dengan sistem luar (localStorage, timer simpan otomatis)
  boleh, dengan `eslint-disable-next-line` + alasan.
- **Aksi dari tombol wajib lewat `callAction`** (`lib/call-action.ts`, 2026-10-16): Server Action yang gagal terkirim
  (koneksi, sesi habis, deploy saat halaman terbuka) tak boleh membuat tombol diam — tampilkan pesan gagal. Penjaga
  global `components/action-guard.tsx` (banner versi baru + peringatan aksi gagal) hanya jaring pengaman.
- **Selalu** paginasi (`.range()` / `fetchAllPaged`/`fetchAllByIds`, chunk id ~150) untuk query yang bisa
  > 1000 baris — PostgREST memotong diam-diam (bug 2026-07-08: 51/52 Skor 360° salah).
- **Jangan** `npm audit fix --force` (menurunkan Next 16 → 9). `xlsx@0.20.3` dari CDN SheetJS.
- Rumus menentukan keputusan SDM nyata dan salahnya tak memunculkan error → `npm test` wajib hijau saat kode
  disentuh (±1200 tes / 71 file). Server Action diuji dengan mock `tests/helpers/mock-supabase.ts`.
- `npm run verify:rls` (85 pemeriksaan, fixture `RLSTEST-*` self-cleaning) manual pra-rilis & tiap ubah RLS.
- Migrasi baru: idempoten, nomor urut, terapkan ke staging dulu; urutan rilis → TEKNIS.md §1. Kode yang memanggil
  fungsi database baru WAJIB punya cadangan cara lama bila fungsinya belum ada (`rpcMissing`, `lib/supabase/rpc.ts`),
  dan `scripts/check-migrations.sql` diperbarui.
- **Aturan merge (pemilik, 2026-10-14):**
  - **`dev` (diubah pemilik, 2026-10-16):** Claude Code **boleh commit & push langsung ke `dev`** setelah
    `npm test`, `npm run typecheck`, dan `npm run build` hijau di lokal. Branch + PR ke `dev` tetap boleh bila
    perubahannya besar/berisiko atau pemilik memintanya.
  - **`main`:** Claude Code **TIDAK BOLEH** merge PR atau push langsung ke `main`. `dev` → `main` hanya lewat PR
    saat rilis yang **disetujui pemilik**; merge dilakukan pemilik.
  - PR yang membawa migrasi **wajib** mencantumkan nomor migrasinya dan bahwa migrasi itu harus dijalankan di
    **staging & production** sebelum fiturnya dipakai.
  - **Sinkron `main` → `dev` (pemilik, 2026-10-16):** setiap kali ada PR masuk `main` (rilis, fitur yang dirilis
    lebih awal, atau perbaikan mendesak), **segera** buat PR "sinkron main → dev" agar kedua branch tak bercabang.
  - **Satu fitur dibuat SEKALI.** Tidak ada lagi branch versi `-main` terpisah (dulu fitur yang sama dibuat dua
    kali → 4 bentrokan saat rilis Q3). Fitur yang dirilis lebih awal: satu branch, PR ke `main`, lalu sinkron ke `dev`.
  - `main` **dilindungi** di GitHub (sejak 2026-10-16): semua perubahan lewat PR yang lulus pemeriksaan otomatis.

## 10. Perintah
```bash
npm install
npm run dev        # Next.js dev :3000
npm run build      # validasi tipe & prerender — jalankan sebelum push
npm run typecheck  # tsc --noEmit
npm run lint       # eslint . (flat config) — wajib 0 error (ikut CI sejak 2026-10-16)
npm test           # vitest run
npm run test:watch
npm run verify:rls # butuh anon + service role key di .env.local
```
