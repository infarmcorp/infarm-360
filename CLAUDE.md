# CLAUDE.md — Infarm 360° Performance Appraisal System

Panduan untuk Claude Code saat bekerja di repo ini.

## Sedang Dikerjakan (per 2026-06-19)

**Fokus aktif:** pengerasan pra-produksi — keamanan, pengujian, email, aksesibilitas.
Migrasi fungsional **selesai & live**; sisa sebagian besar aktivasi env + kebersihan.

- **Baru selesai (session ini & sebelumnya):**
  - **Alur visibilitas laporan bertahap** (`draft → in_review → finalized`, migrasi 0011/0012) —
    tutup kebocoran raw 360° ke SPV + tombol "Rilis ke SPV".
  - **Izin HRD Admin sebagai grant** (`is_hrd_admin`, migrasi 0013) + `canAdmin()` di ~25 file.
  - **Jaring regresi L3** — `verify:rls` kini **21 assertion** (dari 12): fixture 360° + tegakkan
    SPV ditolak baca `assessments`/AIS/AQA anggota tim, plus kontrol positif HRD/penilai/target.
  - **Heatmap "Capaian KPI / Divisi"** (dashboard tab Analisis Hasil KPI) — matriks divisi × bulan.
  - **Palet warna skor terpadu** (lib bersama `lib/score-color.ts`, commit `c0e13f2`→`9a82667`) —
    `heatColor` gradasi 4 jangkar (`≤70` merah · `80` kuning · `90` hijau · `≥97.5` biru) dipakai
    lintas bar/chip KPI & 360° di **dashboard** + bar **Perbandingan Skor Akhir** di **Monitor
    Kinerja**; kategori kinerja pakai palet diskrit; rename judul "per Divisi" / "Perkembangan KPI Bulanan".
  - **Paritas SPV ↔ HRD-mode-SPV** (Laporan Hasil Saya + Monitor menyertakan diri); audit
    kontras WCAG AA; self-service ganti sandi; email pengingat 360° (dorman); indikator tenggat.
- **Berikutnya (butuh aksi pengguna):** set env email (Gmail SMTP) → aktifkan pengingat + reset
  sandi via email; ganti email seed → asli; sandi awal beda per orang. **Komunikasikan ke HRD**
  langkah baru "Rilis ke SPV" (SPV tak lagi lihat detail tim sampai dirilis).
- **Berikutnya (bisa digarap langsung):** branch protection GitHub (PR butuh CI hijau); tes Server
  Action (finalisasi/`releaseToSpv`/`setHrdAdmin`/ACC). Lihat **TO-DO & Backlog**.

**File paling relevan:**
- Laporan & visibilitas: `lib/report.ts` (`loadReport`/`loadTeamReportForSpv`/`loadTeamReportForHrdSpv`),
  `app/(app)/laporan/`, `app/(app)/laporan-tim/`, `app/(app)/admin/laporan/actions.ts` · RLS: migrasi 0012
- Dashboard: `app/(app)/admin/dashboard/` (`page.tsx` + `dashboard-visual.tsx`)
- Skor & tes: `lib/scoring.ts`, `lib/score360.ts`, `tests/`, `scripts/verify-rls.ts`, `.github/workflows/ci.yml`
- Izin/sesi: `lib/auth/roles.ts` (`canAdmin`), `app/(app)/layout.tsx`, `app/(app)/app-shell.tsx`, `app/login/`
- Email: `lib/email/mailer.ts`, `app/(app)/admin/progress/actions.ts` · Skema/RLS: `supabase/migrations/`

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
  360° anonim, Pemetaan + **Rekap Konfigurasi Periode** (potret pengaturan HRD per kuartal).
- **Indikator tenggat periode** (sidebar): sisa hari ke `end_date` + peringatan amber ≤7 hari /
  rose saat hari-ini/lewat (`layout.tsx` `daysUntil`).
- **Empty-state berpandu** (`components/empty-state.tsx`) di halaman kunci (anti tabel kosong).
- **Impor pemetaan** — pratinjau menyebut pasangan yang dilewati + alasannya.

### Perbaikan (bug fix)
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
- 🔑⬜ **Sandi awal seragam** untuk semua akun → minta tiap pegawai ganti (via Akun Saya); HRD beri
  sandi berbeda per orang (Kelola Pegawai). Risiko impersonasi (inti integritas 360°).
- ✅ **Self-service ganti sandi** (Akun Saya) — menutup risiko sandi bersama tanpa email.
- 🔑⬜ **Lupa Sandi via email** (dormant) — kode siap (`app/auth/lupa-sandi`, `/auth/callback`,
  `/auth/perbarui-sandi`); aktifkan dgn email asli + SMTP/Resend + `NEXT_PUBLIC_ENABLE_PW_RESET=true`.
- 🔑⬜ **Email seed `nama@infarm.test` → asli** (10 akun) — prasyarat pengingat 360° + reset sandi.
- 🔑⬜ **Rotasi kredensial** (`SUPABASE_SERVICE_ROLE_KEY` dll) sebelum produksi.
- ✅ **Hapus arsip legacy** `/legacy` + `src/` — selesai (seed dilepas ke `scripts/seed-data.ts`).
- ✅ **Audit npm — `xlsx` (high)** — **SELESAI**. Di-upgrade ke `xlsx@0.20.3` dari CDN resmi
  SheetJS (`package.json` → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`); advisory
  prototype-pollution + ReDoS tertutup, API/kode impor tak berubah, `build`+`test` hijau.
  Catatan tetap berlaku: `npm audit fix --force` **DILARANG** (menurunkan Next 16→9). Sisa
  advisory `postcss` (moderate) transitif dari Next → biarkan, beres saat Next update.

### Fungsional bernilai tinggi
- 🔑🔄 **Pengingat email 360°** — terbangun, **DORMAN** (aktif bila env email diset).
- ✅ **Ekspor Excel** dashboard/rekap.
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

> Catatan paritas legacy yang **memang diinginkan** (bukan bug): edit skor KPI wajib komentar;
> input KPI pertama boleh tanpa komentar. Pertahankan.

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
- **Klasifikasi talenta Dashboard** (9-Box KPI×360 & 4-Box A/B/C/D Player) **dikunci ke satu
  kuartal** lewat `getTalentQuarterKey()` (filter satu kuartal → kuartal itu; "Semua" →
  `activeQuarterKey`) agar KPI, 360°, dan Skor Akhir dari periode sama. Wajib hormati flag
  `quarters[qKey].has360` (`isTalent360Active`): kuartal tanpa 360° → 9-Box tidak diplot &
  kolom tabel `N/A`, dan kategori A Player nonaktif (Skor Akhir = 100% KPI). Helper inti:
  `getTalentMatrix`, `getPlayerMatrix`, `getEmpTalentBox`, `getEmpPlayerBox`.

## Pengujian (Vitest — logika skor & parsing impor) + Verifikasi RLS

> **Kenapa ada:** rumus skor (Skor Akhir, 9-Box, A/B/C/D, bobot 360°) menentukan keputusan
> SDM nyata (promosi, punishment, kategori talenta). Kesalahan rumus **tidak memunculkan
> error** — aplikasi tetap jalan, angkanya saja yang salah ("salah diam-diam"). Tes mengunci
> rumus: bila ada perubahan tak sengaja, `npm test` langsung **gagal merah** sebelum sampai
> ke pengguna. **Bukan** aktivitas kuartalan — dijalankan saat **kode disentuh**.

- **Jalankan:** `npm test` (sekali) atau `npm run test:watch` (mode pantau).
- **Cakupan (55 tes):**
  - `tests/scoring.test.ts` → `lib/scoring.ts`: `finalScoreOf` (blend 50/50, KPI-only, s360
    null, punishment, floor 0), `playerClassOf` (A hanya bila 360 aktif & final≥90 & kpi≥90 &
    360≥80; ambang B/C/D), `kpiBandOf`/`s360BandOf`, `talentBoxOf` (9 kotak).
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

### 4-Box — A/B/C/D Player (`playerClassOf`)
Dievaluasi **berurutan** (cek A dulu; kalau gagal jatuh ke ambang Skor Akhir saja):

| Kelas | Syarat |
|-------|--------|
| **A Player** | **butuh 360° aktif & ada** `DAN` `Skor Akhir ≥ 90` `DAN` `KPI ≥ 90` `DAN` `360° ≥ 80` |
| **B Player** | `Skor Akhir ≥ 80` (dan bukan A) |
| **C Player** | `Skor Akhir ≥ 70` |
| **D Player** | `Skor Akhir < 70` |

- **A Player hanya mungkin bila 360° aktif** (`has360=true` & `s360≠null`). Di kuartal tanpa
  360°, Skor Akhir = 100% KPI dan kelas tertinggi yang bisa dicapai adalah **B** (≥80).
- Hanya **A** memakai syarat majemuk (final + KPI + 360 sekaligus); **B/C/D** murni dari Skor Akhir.

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
