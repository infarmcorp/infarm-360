# CLAUDE.md — Infarm 360° Performance Appraisal System

Panduan untuk Claude Code saat bekerja di repo ini.

> **Status terkini & catatan sesi** (potret cepat-basi: sedang dikerjakan, riwayat sesi, file
> paling relevan) → lihat **`docs/perencanaan/STATUS.md`**. Sisa pekerjaan → **[TODO.md](docs/perencanaan/TODO.md)** (aktif) &
> **[BACKLOG.md](docs/perencanaan/BACKLOG.md)** (opsional). Rincian/riwayat tiap fitur → **[CHANGELOG.md](docs/perencanaan/CHANGELOG.md)**.
> Catatan operasional trial/Q2 → **docs/perencanaan/REKOMENDASI.md**.

---

## Sedang Dikerjakan (per 2026-07-18)

**Fokus aktif:** pendalaman **analitik Monitor Kinerja & Dashboard Organisasi** (semua sudah di-push
ke `main`, commit `2b01e93`). Migrasi fungsional **selesai & live**; **tanpa migrasi DB sesi ini** —
seluruhnya lapisan penyajian dari data yang sudah dihitung. Sisa pra-produksi = **aktivasi env**
(email/sandi) + **kebersihan akun** + **backup rutin** (lihat [TODO.md](docs/perencanaan/TODO.md)).

- **Monitor Kinerja Pegawai untuk HRD (BARU):** halaman `app/(app)/admin/monitor/` (gate `canSection
  'dashboard'`) — cermin Monitor SPV untuk seluruh pegawai internal, filter periode+divisi, scorecard/
  tren/movers ikut filter, tabel 5/hal, delta divisi-vs-org. Menu di `app-shell.tsx`.
- **"Penyebab Perubahan" (Monitor) + tooltip Δ (Dashboard):** urai Δ rata-rata jadi **skor pegawai
  konsisten** vs **perubahan komposisi** (masuk/keluar) — identitas eksak. Istilah diseragamkan lintas
  halaman. Pergerakan 360° kini beserta **rincian per-aspek**.
- **Heatmap + Donut aspek/indikator per pegawai** (`extremes-heatmap.tsx`, `per-employee-heatmap.tsx`,
  `lib/aspect360.ts`): donut frekuensi **terlemah/terkuat** (4 teratas + Lainnya) **di atas** heatmap;
  **klik irisan → heatmap tersaring**. Semua peran. Palet selaras Dashboard.
- **Profil Aspek tim + pembanding "vs organisasi"** (`team-aspect.tsx`, `orgAspectAverages`): garis +
  chip Δ tim-vs-perusahaan per aspek.
- **Penataan section berhierarki** (`section-header.tsx`) di Monitor & tiap sub-tab Dashboard
  (Ringkasan → Komposisi/Distribusi → Arah → Rincian). Dashboard: **Scatter KPI×360°** + **distribusi
  per kuartal** + legenda ambang; hapus banner judul tab KPI/360; tabel 10/hal + pager.
- **Menutup seluruh audit** (kesan per peran, janggal, kurang informatif, usulan chart 1–5). Rincian →
  [CHANGELOG.md](docs/perencanaan/CHANGELOG.md); status → [STATUS.md](docs/perencanaan/STATUS.md).
- **Tersisa (butuh aksi pengguna):** **verifikasi visual di browser** (data live) untuk kedua halaman;
  **pencocokan eksak Looker** heatmap 360° Q1 (selisih ~0.04 akibat pembulatan CSV `numeric(3,2)`) —
  menunggu konfirmasi metode agregasi Looker.

**File paling relevan sesi ini:** `app/(app)/monitor/` (`page.tsx`, `monitor-trends.tsx`,
`extremes-heatmap.tsx`, `per-employee-heatmap.tsx`, `team-aspect.tsx`, `dist-bars.tsx`,
`section-header.tsx`, `completeness.tsx`), `app/(app)/admin/monitor/` (`page.tsx`, `monitor-filters.tsx`),
`app/(app)/admin/dashboard/` (`page.tsx`, `dashboard-visual.tsx`), `lib/aspect360.ts`, `lib/dashboard/aggregate.ts`.

---

## Apa Ini

Aplikasi web **penilaian kinerja (Performance Appraisal) 360° internal** untuk Infarm.
Bukan e-commerce — **tidak ada pembayaran, keranjang, stok, atau pengiriman barang.**

Empat peran pengguna (kolom `employees.role`; logika kewenangan di `lib/auth/roles.ts`):
- **Employee** — mengisi penilaian 360 Feedback, lihat laporan hasil sendiri.
- **SPV (Supervisor)** — input KPI bulanan tim (+ KPI dirinya sendiri), ACC laporan tim,
  monitor kinerja bawahan.
- **HRD Admin** — kelola siklus periode, pertanyaan (+ aspek), bobot penilai, mapping (termasuk
  **sifat wajib/opsional**), flag kepatuhan + **potongan keterlambatan** (−3 Skor 360°),
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

Acuan fungsional lengkap: `PANDUAN Infarm 360 Portal.pdf`. Panduan pengguna: `docs/panduan/CARA-PENGGUNAAN.md`.

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
status di **[TODO.md](docs/perencanaan/TODO.md)**.

Saat mengerjakan fitur, ingat: kerjakan di route Next.js `app/(app)/` (arsip SPA legacy `src/`
sudah dihapus).

---

## Struktur Proyek

> **TIDAK ada folder `src/`** (arsip SPA legacy sudah dihapus). Kode aplikasi ada di **`app/`**
> (App Router). Ini **bukan** e-commerce — tak ada keranjang/checkout/produk/OMS.

```
app/                          # Next.js App Router
├── layout.tsx · page.tsx     # root layout + gerbang auth (/)
├── globals.css · icon.png
├── login/                    # halaman login
├── auth/                     # alur Supabase auth
│   ├── callback/route.ts     # OAuth/redirect callback (reset sandi)
│   ├── lupa-sandi/           # form "Lupa Sandi via email"
│   ├── perbarui-sandi/       # form set sandi baru
│   └── signout/route.ts
└── (app)/                    # shell persisten (sidebar + landing per peran)
    ├── layout.tsx · app-shell.tsx · mode-actions.ts   # menu base + dual-mode HRD
    ├── penilaian/            # isi 360° Feedback (Employee)
    ├── kpi/                  # input/rekap/riwayat KPI bulanan (SPV/Koordinator)
    ├── monitor/              # monitor tren kinerja tim
    ├── laporan/             # laporan hasil (pegawai; [employeeId] detail + PDF)
    ├── laporan-tim/          # Laporan Kinerja Tim + ACC (SPV/Koordinator/Direksi)
    ├── review-hasil/         # tinjau hasil akhir
    │                         # (route /peninjau DIHAPUS 2026-07-24 — Peninjau Lintas Divisi kini =
    │                         #  grant halaman "Review Hasil Akhir" berlingkup, migrasi 0033)
    ├── suksesi/              # suksesi/promosi (Direksi)
    ├── akun/                 # Akun Saya
    └── admin/                # area HRD Admin (canAdmin)
        ├── periode/ pertanyaan/ pemetaan/ bobot/   # konfigurasi siklus
        ├── progress/ kepatuhan/                     # progress 360° + flag kepatuhan
        ├── 360/                                     # aktivasi & hitung skor 360°
        ├── laporan/ dashboard/ ekspor/             # finalisasi · dashboard talenta · ekspor
        ├── pegawai/                                 # Kelola Pegawai (CRUD via service_role)
        └── audit/                                   # Log Aktivitas HRD + Audit KPI

lib/                          # logika bersama (server-first)
├── scoring.ts · score360.ts # RUMUS SKOR TERKUNCI (diuji; jangan ubah tanpa sinkron tes)
├── trend.ts · team-metrics.ts · score-color.ts
├── report.ts                # loader laporan (raw anonim, buang L3 bernama)
├── database.types.ts        # tipe skema DB
├── auth/roles.ts            # canAdmin/canCoordinate/isHrdDept · grantedAccess (izin 3-tingkat)
├── auth/demo-users.ts       # roster login (= sumber seed)
├── supabase/                # server.ts (RLS vs service_role) · client · middleware · paginate
├── import/parse.ts          # parsing impor Excel KPI + pemetaan 360°
├── email/mailer.ts          # SMTP/Resend (dorman sampai env diset)
└── audit/log.ts             # tulis hrd_audit_log

supabase/migrations/         # 0001–0022 (skema + RLS + seed idempoten)
components/                  # UI bersama (confirm-dialog, searchable-select, dll.)
scripts/                     # seed, backup/restore, verify-rls, reset, diagnostik
tests/                       # Vitest — logika skor & otorisasi Server Action (mock Supabase)
docs/                        # panduan/ · perencanaan/ · pengujian/ · pengembangan/
```

> Logika sensitif WAJIB di Server Action / Route Handler + Zod (bukan client). RLS ditegakkan di DB.
> Detail per-fitur → **[CHANGELOG.md](docs/perencanaan/CHANGELOG.md)**; tombol per-halaman →
> **`docs/panduan/RINCIAN-TOMBOL.md`**.

---

## Dokumen Terpisah — TODO, Backlog, Changelog

Tiga daftar besar dulu di sini kini **dipisah** ke file sendiri agar CLAUDE.md tetap ramping
(panduan durable). Perbarui di file masing-masing:

- **[TODO.md](docs/perencanaan/TODO.md)** — pekerjaan yang **masih harus dikerjakan** & dilacak sampai tuntas
  (⬜ belum · 🔄 sebagian · ✅ selesai; 🔑 = butuh aksi pengguna). Sumber tunggal "apa yang belum beres".
- **[BACKLOG.md](docs/perencanaan/BACKLOG.md)** — ide/pengembangan **opsional** & masa depan yang belum jadi
  komitmen; dipromosikan ke TODO bila diputuskan dikerjakan.
- **[CHANGELOG.md](docs/perencanaan/CHANGELOG.md)** — catatan **historis** apa yang sudah berubah/dibangun
  (invariant lintas-fitur, alasan keputusan, daftar migrasi).

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

> **INVARIANT terkunci — Manajemen Akses / grant halaman berlingkup (`page_grants`, 2026-07-20):**
> mekanisme "SCOPE/parameter pada halaman existing" di atas diwujudkan lewat tabel **`page_grants`**
> (migrasi 0024/0025). Model **beku**: **1 grant = orang + halaman + lingkup + izin 3-tingkat**
> (Lihat / Meringkas=`can_edit` / Finalisasi=`can_finalize`, migrasi 0032; halaman 'pemantauan' selalu Lihat). Katalog
> halaman **TETAP** (`GRANTABLE_PAGES` di `lib/auth/roles.ts`) — bukan URL bebas. **Tiap halaman yang
> di-grant WAJIB mengikuti pola enforcement ini** (mudah salah = rasa aman palsu): (1) gate **SADAR-MODE**
> `isHrdFull = canSection(page) && hrdMode==='admin'`; (2) jalur grant baca via **`service_role`**
> berlingkup (helper `grantedScope`/`grantedAccess`/`deptScopeFilter`/`applyDeptScope`, diuji
> `tests/page-scope.test.ts`) karena pemegang grant non-HRD ditolak RLS; (3) `?dept=` **TAK BOLEH**
> menembus lingkup (`resolveDept` fallback aman); (4) izin tulis untuk non-HRD **DITEGAKKAN SERVER**
> (Tahap 2 AKTIF, halaman Review): `resolveReportWriteActor` cek `can_edit`/`can_finalize`+lingkup, tulis
> via `service_role` = **gembok NYATA** (Meringkas → tulis Ringkasan Aspek; Finalisasi → +finalisasi/rilis).
> ⚠️ Untuk pemegang **`is_hrd()`** pembatasan izin bersifat **TAMPILAN**, bukan RLS; gembok nyata hanya untuk
> pemegang grant **non-HRD** (bukan `is_hrd()`). **Finalisasi** kini = HRD **atau** pemegang grant tingkat
> Finalisasi berlingkup (bukan lagi HRD-only mutlak). **Peninjau Lintas Divisi** = grant Review + lingkup
> "selain divisinya" + izin Meringkas (fitur `is_cross_reviewer`/`/peninjau` dipensiunkan, migrasi 0033).
> Rincian → CHANGELOG "Manajemen Akses". **Paritas:** perubahan perilaku SPV/halaman existing wajib ikut ke jalur grant.

> **Keputusan terkunci — app tegakkan kebijakan, bukan tambal kelalaian (2026-06-25):** aplikasi
> menegakkan **integritas & kebijakan** (RLS, wajib-komentar/esai, gate periode/360°), **bukan**
> mengakomodasi tiap kelalaian individu. Konsekuensi: **#17 penegasan "wajib tekan Kirim"** &
> **pop-up hapus ad-hoc/alert error → ConfirmDialog TIDAK dikerjakan**. Berhenti di draf atau salah
> klik = kelalaian pegawai, ditanggung pengguna (mis. tercermin di Progress 360 / kepatuhan), bukan
> dipagari UI. Jangan usulkan fitur "pengaman keteledoran" sejenis tanpa permintaan eksplisit.
> **DIKECUALIKAN 2026-08-21 (permintaan eksplisit pengguna):** konfirmasi hapus Ad-Hoc di halaman
> Penilaian kini **modal in-app** (`app/(app)/penilaian/modal.tsx`), bukan `window.confirm/alert` —
> alasannya konsistensi design system (dialog bawaan browser lepas dari token), bukan pengaman
> keteledoran. Prinsip di atas tetap berlaku untuk kasus lain.

## Design System — Token Redesign (2026-08, ACUAN TETAP)

> **Sumber tunggal:** `app/globals.css` (blok `@theme` + utility `.data-value`). Komponen WAJIB
> pakai utilitas dari token (`bg-brand`, `text-ink-soft`, `border-line`, `rounded-panel`, dst.),
> **BUKAN hex mentah / palet default Tailwind** (`emerald-*`, `gray-*`, `rounded-lg`, `shadow-sm`).
> Diterapkan bertahap per halaman; acuan referensi end-to-end = **Kelola Siklus Periode**
> (`app/(app)/admin/periode/`) + **sidebar** (`app-shell.tsx`). Halaman baru/di-restyle ikuti pola ini.

- **Brand** hijau muted `--color-brand #33604A` (+ `brand-ink`, `brand-tint`): **HANYA** untuk
  **primary action & elemen aktif** (tombol utama, item sidebar aktif, ring fokus). Bukan hiasan.
- **Status/badge = soft-tint** (bg pucat + teks warna), **BUKAN solid fill**. Pakai `StatusChip`
  (`components/status-chip.tsx`, tone `neutral|brand|warn|danger`). Solid hanya untuk primary button.
- **Pemetaan warna semantik → token (INVARIANT konsistensi, wajib dijaga tiap restyle):** **brand** =
  primary/aktif/positif (terpilih, sukses, "Terkirim", nilai baik) · **warn** = peringatan/pending/
  obligasi ("Wajib", draf, autosave-pending, skor basi, "Lengkapi") · **danger** = error/destruktif/
  wajib-diisi (hapus, gagal, field kosong) · **neutral** = nonaktif/informasi netral. Chart 2-seri:
  seri utama = **brand**, pembanding = **warn** (mis. Laporan radar Rekan=brand vs Self=warn; hex SVG
  diselaraskan ke nilai `--color-*`). Jangan pakai palet Tailwind mentah (`emerald/indigo/amber/rose/slate`).
- **Border & radius:** border tipis netral `--color-line #E4E6E2`; radius `--radius-panel 10px`
  (kartu/panel) & `--radius-control 7px` (input/tombol). **Tanpa shadow** kecuali elemen mengambang
  (dropdown/modal/overflow-menu).
- **Kartu = `Panel`** (`components/panel.tsx`) — flat (border, no shadow); **kurangi nested card**
  (card hanya untuk container modul utama, bukan tiap grup info).
- **Font:** sans-serif (Inter) untuk teks; **monospace (IBM Plex Mono) untuk SEMUA angka/data/ID**
  via utility **`.data-value`** (alias `.mono`, + `tabular-nums`). Jangan pakai `.data-value` untuk kalimat.
- **Tombol = `Button`** (`components/button.tsx`, variant `primary|ghost|danger`); aksi
  sekunder/destruktif di tabel → **`OverflowMenu` (⋯)**, sisakan **satu** primary action visible per row.
- **Microcopy panjang** (penjelasan alur) jadi footnote/tooltip kecil, **bukan** teks besar permanen.
- **Kanvas** halaman = `bg-bg` (tinted) + padding tipis (`px-5 py-7`), **tanpa** wrapper putih besar.

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
CRON_SECRET                    # server-only — autentikasi Vercel Cron ke /api/cron/late-penalty (BR-08); cron DINONAKTIFKAN SEMENTARA (vercel.json sengaja tak ada, 2026-09-29) — tak dibutuhkan sampai diaktifkan lagi
```

## Security Rules

- **Jangan expose** `SUPABASE_SERVICE_ROLE_KEY` di frontend.
  Hanya `NEXT_PUBLIC_*` yang boleh sampai ke client.
- **Otorisasi berbasis peran adalah inti keamanan aplikasi ini.** Tegakkan dengan
  **Supabase Row Level Security (RLS)** di level database, bukan hanya cek di UI:
  - Employee hanya boleh baca/tulis penilaian & laporan miliknya (laporan: hanya saat `finalized`).
  - SPV hanya boleh akses KPI/laporan bawahannya. **Umpan balik 360° BERNAMA (identitas per penilai,
    L3 `assessors`) TIDAK PERNAH boleh dibaca SPV** — RLS `asmt_read`/`ais_read`/`aqa_read` sengaja
    **tanpa** `is_my_member` (migrasi 0012), jadi SPV tak bisa membaca tabel mentah 360° via API.
    Detail SPV (radar/aspek + ringkasan HRD **+ umpan balik mentah ANONIM byAspect/essays**) dihitung
    server via `service_role` (`loadTeamReportForSpv`), hanya saat laporan `in_review`/`finalized`.
    > **DIUBAH 2026-07-15 (permintaan pengguna):** SPV/Koordinator/Direksi kini **boleh** melihat umpan
    > balik **mentah ANONIM** (`byAspect`/`essays` — komentar & rating verbatim **tanpa identitas
    > penilai**) untuk pegawai yang ditinjaunya. Yang tetap DILARANG = blok per-penilai **BERNAMA** (L3
    > `assessors`), tetap dibuang di semua loader tim. RLS **tidak berubah** (raw tetap tertutup via API;
    > paparan anonim murni app-level via `service_role`). ⚠️ **Risiko de-anonimisasi** pada kelas penilai
    > kecil (mis. hanya 1–2 Peer/Cross) — komentar "anonim" bisa tertebak; mudah dibalik (app-level,
    > tanpa migrasi). Pola sama dgn Review Hasil Akhir Direksi & Peninjau yang sudah lebih dulu begini.
    > **2026-10-07:** lingkup raw SPV = seluruh pegawai **sedivisi**; **laporan diri sendiri TANPA raw**
    > (`withoutRaw`) kecuali HRD Mode Admin & Direksi; anggota tim koordinator wajib sedivisi.
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
- **Skor Akhir** = blend KPI+360 (tanpa pengurangan lain). **Fitur Punishment manual DIHAPUS (2026-10-01,
  keputusan HRD)** — satu-satunya sanksi = potongan keterlambatan −3 yang sudah ada di Skor 360°; tabel
  `compliance_penalties` dibiarkan dorman (0 baris di prod, tak dibaca/ditulis app). Rumus
  murni terkunci di `lib/scoring.ts` & `lib/score360.ts` (lihat Pengujian); kalau mengubah,
  sinkronkan semua tempat + perbarui tesnya.
  > **SATU rumus untuk SEMUA halaman (2026-09-29, keputusan HRD):** `finalScoreOf` (tanpa KPI → 360°
  > saja, mis. Direksi; dibulatkan 2 desimal = `numeric(5,2)`), rerata KPI via `kpiAvgOf` (presisi
  > penuh — bulatkan hanya di akhir), klasifikasi atas nilai TERBULAT (`roundScore`). Angka yang
  > DITAMPILKAN = `displayedFinalOf`: laporan **final** → `final_reports.final_score` tersimpan (yang
  > dilihat pegawai), selain itu angka hidup. Hanya Review Hasil Akhir menampilkan selisihnya
  > (`hasScoreDrift`, ≥0.01). Mode Dashboard "semua kuartal" = rata-rata
  > Skor Akhir PER KUARTAL. **Jangan** hitung Skor Akhir/rerata KPI manual di halaman — pakai helper ini.
- **Bobot 360° 2 kelas OTOMATIS (BR-10, Q3 2026 dst. — keputusan HRD 2026-10-01):** periode mulai ≥
  `AUTO_WEIGHT_FROM` (2026-07-01) yang memakai model **2 kelas** → bobot dari jumlah penilai Internal
  (per ORANG yang mengirim): Atasan + ≥2 Internal = 40/60 · Atasan + 1 Internal = 60/40 · satu sisi saja = 100%.
  Isian % HRD diabaikan (dikunci di halaman Bobot). **4 kelas tak berubah**; **bobot khusus per pegawai tetap
  berlaku apa adanya**; Q1–Q2 tetap bobot tersimpan. Semua pemanggil WAJIB lewat `schemeFor`/`effectiveModel`
  (`lib/score360.ts`) — jangan suapkan model DB langsung ke `weightedScore360`.
- **Penilaian DIBATALKAN validitasnya** (`assessments.status='invalidated'`, migrasi 0046) = arsip: tak pernah masuk
  skor (filter `status='submitted'` di semua hitungan — jangan ganti filter itu jadi "bukan draft"), kewajiban rater
  gugur (tuntas di Progress/Kepatuhan/pengingat, tak kena potongan telat). Penilaian **Terkirim tak boleh dihapus**
  (Pemetaan → "Periksa Validitas"); hapus pemetaan hanya Belum Mulai/Draft + alasan wajib.
- **Skor 360° resmi** (`result_360.score`) = `score_raw` (rumus `weightedScore360`) **dikurangi potongan
  keterlambatan menilai** (flat −3 bila ≥1 kewajiban "belum selesai saat deadline" — mencakup
  terkirim-telat MAUPUN tak pernah dikirim sama sekali; kewajiban = pemetaan **Wajib** + **AJUAN**
  (Opsional hasil permohonan pegawai yang disetujui HRD, dikenali dari `relation_correction_requests`
  kind='add' approved; ditampilkan terpisah di Kepatuhan; **berlaku untuk periode mulai 2026-07-01 / Q3
  2026 dst.** — `AJUAN_PENALTY_FROM`; Ad-Hoc Mandiri lama tak terdampak); min 0; migrasi 0036, rumus `lib/late.ts` +
  `tests/late.test.ts`). HRD bisa **mengubah nilai potongan** per pegawai (`late_penalty_waivers.points`,
  migrasi 0043; 0 = dikecualikan; alasan wajib). Waktu kirim pertama (`first_submitted_at`) diisi **trigger DB**,
  bukan klien — jangan tulis/andalkan nilai dari app. Route cron tersedia di
  `app/api/cron/late-penalty/route.ts` (panggil `refreshLatePenalties`, hanya memperbarui
  `result_360` yang **sudah ada**, tak menghitung dari nol) tapi **DINONAKTIFKAN SEMENTARA**
  (2026-09-29, permintaan pengguna) — `vercel.json` **sengaja tidak ada** jadi tak terjadwal;
  sebagai gantinya potongan **diterapkan OTOMATIS** (2026-09-29) saat HRD membuka Flag Kepatuhan /
  Review Hasil Akhir, dan sebelum tiap simpan/rilis/finalisasi laporan (`computeFinal`) — hasil final
  tak pernah memakai potongan basi. Cadangan: tombol "Terapkan Potongan ke Skor 360°" di Kepatuhan. Untuk aktifkan lagi: buat ulang `vercel.json` berisi cron `late-penalty` + set
  `CRON_SECRET`.
- **Klasifikasi talenta Dashboard** (4-Box A/B-Culture/B-KPI/C — **tanpa D**) **dikunci ke satu
  kuartal** lewat filter periode agar KPI, 360°, dan Skor Akhir dari periode sama. KPI **atau** 360°
  kosong (termasuk kuartal tanpa 360°) → **HRD Review** (BR-11), tak diklasifikasi otomatis. 4-Box berbasis
  **KPI × 360° langsung** (ambang 80), bukan Skor Akhir — lihat **Klasifikasi Talenta** di bawah.
  > **Matriks 9-Box DIHAPUS dari tampilan dashboard (2026-06-30)** atas permintaan — matriks tab
  > Kompilasi + kolom tabel dibuang. **Rumus `talentBoxOf`/`kpiBandOf`/`s360BandOf` di `lib/scoring.ts`
  > TETAP ADA & teruji** (jangan dihapus — bagian terkunci, mungkin dipakai ekspor/internal nanti);
  > hanya UI dashboard yang dilepas.

## Pengujian (Vitest — logika skor & parsing impor) + Verifikasi RLS

> **Kenapa ada:** rumus skor (Skor Akhir, 9-Box, A/B/C/D, bobot 360°) menentukan keputusan
> SDM nyata (promosi, potongan keterlambatan, kategori talenta). Kesalahan rumus **tidak memunculkan
> error** — aplikasi tetap jalan, angkanya saja yang salah ("salah diam-diam"). Tes mengunci
> rumus: bila ada perubahan tak sengaja, `npm test` langsung **gagal merah** sebelum sampai
> ke pengguna. **Bukan** aktivitas kuartalan — dijalankan saat **kode disentuh**.

- **Jalankan:** `npm test` (sekali) atau `npm run test:watch` (mode pantau).
- **Cakupan (99 tes):**
  - `tests/scoring.test.ts` → `lib/scoring.ts`: `finalScoreOf` (blend 50/50, KPI-only, 360°-only,
    pembulatan 2 desimal), `roundScore`/`kpiAvgOf`/`displayedFinalOf`, `playerClassOf` (KPI×360° ambang 80 → A / B-Culture / B-KPI / C,
    null bila keduanya kosong, satu sumbu kosong → HRD_REVIEW; **tanpa D**), `kpiBandOf`/`s360BandOf`, `talentBoxOf` (9 kotak).
  - `tests/score360.test.ts` → `lib/score360.ts`: `weightedScore360` **4class** (semua kelas,
    normalisasi bobot, **kelas Bawahan**, **Self dikecualikan**) & **2class** (Internal = rerata
    semua skor Peer+Cross+Bawahan, fallback satu sisi) & **2class_auto** (BR-10: bobot otomatis 40/60 · 60/40
    menurut jumlah penilai internal, `effectiveModel`/`schemeFor`); `round2` (2 desimal).
  - `tests/trend.test.ts` → `lib/trend.ts`: `trendOf` berdasar JUMLAH bulan terisi (kosong = KPI belum
    ditetapkan; **0 = nilai sungguhan**): 0 → empty · 1 → unread ("Belum terbaca") · 2 → stable/up/down
    dari dua bulan itu (toleransi ±2) · 3 → stable/up/down/volatile (Fluktuatif hanya bila 3 bulan).
  - `tests/import.test.ts` → `lib/import/parse.ts`: parsing impor Excel **KPI** (`parseKpiRows`,
    `isValidKpiRow`: alias kolom, normalisasi kode uppercase, skor kosong→tak valid, batas 0–100)
    & **pemetaan 360°** (`parseMappingRows`, `classifyMappingRows`: ok/invalid/self/dup, alias,
    penomoran baris) + 1 uji round-trip lewat `xlsx` asli (paritas jalur klien).
  - **Server Action (otorisasi/guard, mock Supabase)** — `tests/helpers/mock-supabase.ts` (klien
    tiruan chainable, antrean respons per-tabel FIFO; TANPA DB nyata): `tests/actions-pegawai.test.ts`
    (`setHrdAdmin`/`setCoordinator` — tolak non-HRD, kebijakan divisi HRD, validasi UUID),
    `tests/actions-laporan.test.ts` (`saveOrFinalizeReport`/`releaseToSpv` — tolak non-HRD/periode
    nonaktif/skor null, tolak turunkan laporan final; `finalScoreOf` asli), `tests/actions-acc.test.ts`
    (`setSpvAcc` 3 jalur SPV/Koordinator/Direksi — carve-out koordinator, gating rilis, batas kewenangan),
    `tests/roles.test.ts` (`canAdmin`/`canCoordinate`/`isHrdDept`).
- **Rumus inti ada di KODE, bukan UI.** Yang bisa diubah HRD lewat aplikasi = *input* (bobot %,
  360° aktif/nonaktif, KPI, potongan keterlambatan). Cara blend & ambang terkunci di kode.
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
data nyata, uji tulis pakai `UPDATE score=score` (idempoten). Total **56 pemeriksaan** (termasuk celah
0045: HRD terbatas, isi penilaian saat form ditutup, permohonan palsu, bobot ≠ 100, respons suksesi draf, log ACC). Butuh
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
Signature: `playerClassOf(kpi: number|null, s360: number|null): PlayerClass|null` (`PlayerClass` termasuk `'HRD_REVIEW'`).

| Kelas (`key`) | Syarat |
|-------|--------|
| `null` (tak terklasifikasi) | KPI **dan** 360° keduanya kosong |
| **A Player** (`A`) | `KPI ≥ 80` **DAN** `360° ≥ 80` |
| **B Player (High Culture)** (`B_CULTURE`) | `KPI < 80` **DAN** `360° ≥ 80` |
| **B Player (High KPI)** (`B_KPI`) | `KPI ≥ 80` **DAN** `360° < 80` |
| **C Player** (`C`) | keduanya `< 80` |
| **HRD Review** (`HRD_REVIEW`) | tepat **satu** sumbu kosong (KPI **atau** 360°) |

- **BR-11 (Q3 2026, keputusan HRD 2026-10-01):** nilai hilang **TIDAK** lagi dianggap di bawah 80 →
  `HRD_REVIEW` (bukan kotak 4-Box; Dashboard menaruhnya di bucket "HRD Review").
- **Tanpa 360°** (`has360=false` → s360 null; pemanggil melewatkan `has_360 ? s360 : null`) → semua
  pegawai ber-KPI berstatus **HRD Review**.
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

## Changelog

Changelog dipindah ke **[CHANGELOG.md](docs/perencanaan/CHANGELOG.md)** — catatan historis perubahan (invariant
lintas-fitur, alasan keputusan, daftar migrasi). Status/sesi terkini → `docs/perencanaan/STATUS.md`.
