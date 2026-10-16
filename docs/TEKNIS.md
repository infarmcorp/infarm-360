# TEKNIS — Infarm 360° Performance Appraisal System

Dokumen teknis untuk developer dan pengelola app: alur kerja, env var, aktivasi, rumus, akses,
migrasi, pengujian, backup. Aturan tetap untuk Claude Code ada di [CLAUDE.md](../CLAUDE.md).
Status & pekerjaan terbuka di [RENCANA.md](RENCANA.md). Riwayat di [CHANGELOG.md](CHANGELOG.md).

## Daftar isi
1. [Alur kerja: branch, staging, migrasi](#1-alur-kerja-branch-staging-migrasi)
2. [Environment variable](#2-environment-variable)
3. [Aktivasi fitur dorman & Mode Maintenance](#3-aktivasi-fitur-dorman--mode-maintenance)
4. [Rumus skor & klasifikasi](#4-rumus-skor--klasifikasi)
5. [Manajemen Akses — model & penegakan](#5-manajemen-akses--model--penegakan)
6. [Daftar migrasi 0001–0052](#6-daftar-migrasi-00010052)
7. [Pengujian](#7-pengujian)
8. [Backup & restore](#8-backup--restore)
9. [PDF panduan in-app](#9-pdf-panduan-in-app)
10. [Skrip operasional](#10-skrip-operasional)

---

## 1. Alur kerja: branch, staging, migrasi

**Kenapa dipisah.** Production berisi data pegawai **nyata**. Pengembangan langsung ke production
berisiko mengubah skema, menjalankan reset ke data nyata, atau menampilkan fitur setengah jadi.

### Branch
- **`main`** = production. Vercel auto-deploy `main` → domain production. **Jangan push langsung ke `main`.**
- **`dev`** = branch kerja. Vercel membuat **Preview deployment** untuk tiap push ke branch non-`main`
  (termasuk `dev` dan turunan seperti `dev/nama-fitur`).
- Alur: kerja di `dev` (atau feature branch dari `dev`) → push → cek URL Preview → **PR `dev` → `main`**
  → review → merge → Vercel deploy production. Selalu lewat PR, walau kecil — PR adalah titik terakhir
  memastikan CI (test + typecheck + build, `.github/workflows/ci.yml`) hijau.
- Repo `infarmcorp/infarm-360` **publik**. Jangan pernah commit data pegawai, backup mentah, atau `.env*`.

### Dua environment Supabase
| | Production | Dev/Staging |
|---|---|---|
| Project ref | `beajoczjpywozavatzmf` | project terpisah, **akun Supabase berbeda** (free tier: 2 project per akun) |
| Data | nyata | data uji, boleh direset |
| Dipakai oleh | Vercel scope **Production** | `.env.local` developer + Vercel scope **Preview** |
| Migrasi | manual, setelah teruji di dev | tempat pertama menguji migrasi |

**Setup project dev (sekali):** buat project dengan akun kedua → catat `Project URL`, `anon key`,
`service_role key` (Settings → API) dan connection string `SUPABASE_DB_URL` (Settings → Database) →
isi `.env.local` dari template `.env.example` (jangan commit) → terapkan semua migrasi → `npm install && npm run dev`.

### Menerapkan migrasi
Repo **tidak** memakai `supabase db push` secara baku (CLI sempat tak cocok di platform pengembang).
Sumber tunggal: `supabase/migrations/*.sql` (bernomor urut, idempoten).

- **Jalur A (bila Supabase CLI jalan):** `supabase init` → `supabase link --project-ref <dev-ref>` →
  `supabase db push` (cek `supabase db diff` dulu bila ragu).
- **Jalur B (terbukti jalan):**
  ```bash
  npm install --no-save pg
  node scripts/apply-migration.mjs supabase/migrations/0001_init.sql
  # ...lanjutkan berurutan sampai file terbaru...
  npm uninstall --no-save pg
  ```
  Membaca `SUPABASE_DB_URL` dari `.env.local` — pastikan menunjuk ke DB yang dimaksud.
- Cek migrasi mana yang sudah terpasang di sebuah DB: jalankan `scripts/check-migrations.sql` di SQL Editor.

**Menambah migrasi:** buat `supabase/migrations/00XX_nama.sql` (lanjutkan nomor) → terapkan ke dev →
uji → setelah PR di-merge, terapkan **file yang sama** ke production secara manual (tak ada auto-migrate di CI).
Perubahan yang dibuat di dashboard/Studio dev **wajib** dituliskan jadi file `.sql` (pola idempoten:
`drop ... if exists` / `create or replace`) dan dijalankan ulang dari nol di dev sebelum merge — production
harus dibangun dari file yang sama persis.

**Kode vs skema = dua rel.** `git merge` membawa file migrasi, bukan eksekusinya.
```
Di dev: ubah kode + tulis 00XX.sql → jalankan ke DB dev → uji di Preview → PR dev→main
Di main: file 00XX.sql ikut → JALANKAN ke DB production (manual) → Vercel auto-deploy kode
```
- **Aditif** (tambah kolom/tabel/policy): migrasi production **dulu**, baru merge kode.
- **Destruktif** (hapus/rename/ubah tipe): expand-then-contract — kode kompatibel lama+baru → migrasi → bersihkan.
- **Pengecualian tercatat:** 0041 → 0042 harus **deploy kode dulu** baru migrasi (kode lama bergantung
  pada izin yang dicabut). 0045 diterapkan **setelah** 0044. 0011 terpisah dari 0012.
- Dua branch membuat nomor sama → rename salah satu sebelum merge.

### Env var per scope di Vercel
Untuk `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: entri
**Production** = project production; tambahkan entri scope **Preview** = project dev → redeploy `dev` →
verifikasi Preview menampilkan data dev (bukan nama pegawai nyata).

### Checklist sebelum merge `dev` → `main`
- [ ] `npm run build`, `npm test`, `npm run typecheck` hijau.
- [ ] Migrasi baru sudah diuji di dev.
- [ ] Fitur dicoba di URL Preview (bukan hanya localhost).
- [ ] `git status` bebas file `.env*`.
- [ ] Setelah merge: terapkan migrasi ke production, verifikasi cepat (smoke test §7.3).
- [ ] Migrasi berisiko saat pegawai sedang mengisi → nyalakan **Mode Maintenance** dulu (§3.3), verifikasi lewat `/?bypass=<kode>`, matikan.
- [ ] Perbarui [RENCANA.md](RENCANA.md), [CHANGELOG.md](CHANGELOG.md), dan CLAUDE.md bila menyentuh aturan.

---

## 2. Environment variable

Semua di Vercel Dashboard (jangan commit). Hanya `NEXT_PUBLIC_*` yang boleh sampai ke browser.

| Variabel | Sisi | Fungsi |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | publik | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publik | anon key (tunduk RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | menembus RLS — **jangan pernah** ke client |
| `SUPABASE_DB_URL` | lokal / secret GitHub | connection string untuk `scripts/*` (migrasi, backup). Untuk GitHub Actions pakai **Session pooler** (runner tanpa IPv6) |
| `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | server | Gmail SMTP (App Password, butuh 2FA). `SMTP_FROM` opsional, mis. `Infarm 360 <email>` |
| `SMTP_HOST` · `SMTP_PORT` | server, opsional | default `smtp.gmail.com` · `465` |
| `RESEND_API_KEY` · `RESEND_FROM` | server | jalur Resend (butuh domain). Dipakai bila SMTP tak diset |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | publik, opsional | override basis tautan "Buka Portal" di email. Prioritas: env ini → `VERCEL_PROJECT_PRODUCTION_URL` → host request |
| `NEXT_PUBLIC_ENABLE_PW_RESET` | publik | `'true'` = tampilkan "Lupa sandi?" (dibakukan saat build → redeploy) |
| `ONBOARDING_GMAIL_ONLY` | server | `'false'` = undangan ke semua domain. Default: hanya `@gmail.com` (alamat lain dilewati **tanpa** mengubah sandi) |
| `EDGE_CONFIG` | server | diisi **otomatis** saat Edge Config di-Connect; tempat saklar `maintenance` |
| `MAINTENANCE_BYPASS_TOKEN` | server, opsional | kode ≥ 16 karakter untuk developer masuk saat maintenance. Kosong/pendek = tak ada yang lolos |
| `CRON_SECRET` | server | autentikasi Vercel Cron ke `/api/cron/late-penalty`. **Cron dinonaktifkan** — tak dibutuhkan sampai diaktifkan (§3.4) |
| `VERCEL_ENV` · `VERCEL_PROJECT_PRODUCTION_URL` | otomatis Vercel | `VERCEL_ENV=production` = satu-satunya kondisi maintenance ditegakkan |
| `BACKUP_PASSPHRASE` | secret GitHub | kata sandi enkripsi backup harian (§8.2) |
| `ALLOW_PROD`, `VU`, dll. | skrip uji beban | lihat §7.5 |

---

## 3. Aktivasi fitur dorman & Mode Maintenance

### 3.1 Email pengingat & undangan (aktif via Gmail SMTP)
Pengirim = akun Gmail sendiri, limit ~500/hari (cukup ~100 pegawai).
1. Aktifkan 2-Step Verification → https://myaccount.google.com/security
2. Buat App Password (16 karakter) → https://myaccount.google.com/apppasswords
3. Set `SMTP_USER`, `SMTP_PASS`, (opsional) `SMTP_FROM` di Vercel → Redeploy.

**Email Rilis Laporan** (Review & Finalisasi) memakai jalur yang sama: template `lib/email/release-template.ts`,
aksi `app/(app)/admin/laporan/release-email-actions.ts` (HRD Mode Admin; penerima = laporan Final + Folder
Laporan terisi + email akun; per gelombang 20; log `laporan.release_email` dengan `meta.sent_ids`). Gambar
pendamping per periode di bucket `email-assets` (migrasi 0051) disisipkan inline lewat CID. Unggahan lewat
Server Action → `experimental.serverActions.bodySizeLimit = 3mb` di `next.config.ts`.

Kode: `lib/email/mailer.ts` (prioritas SMTP > Resend; dorman bila keduanya kosong). Email selalu
**multipart** (HTML + teks dari `htmlToText`) untuk menurunkan skor spam. Solusi spam permanen: domain
sendiri → verifikasi di Resend (SPF/DKIM/DMARC) → `RESEND_API_KEY` + `RESEND_FROM`. Tanpa domain, Resend
hanya mengirim ke email pemilik akun.

### 3.2 Lupa Sandi via email (dorman)
Aktifkan **hanya bila** Reset Sandi oleh HRD mulai merepotkan. Email reset dikirim **Supabase Auth**
(`resetPasswordForEmail`), **bukan** `lib/email/mailer.ts` — `SMTP_*` di Vercel tak dipakai di sini.
Prasyarat: tiap pegawai punya email asli (sudah, sejak 2026-07-16).
1. **Supabase → Authentication → SMTP Settings:** Custom SMTP Gmail (host `smtp.gmail.com`, port `465`,
   user = alamat Gmail, password = App Password). Tanpa ini Supabase hanya mengirim ke anggota tim project
   dan dibatasi beberapa email per jam.
2. **Supabase → Authentication → URL Configuration:** Site URL = domain produksi; Redirect URL `https://<domain>/auth/callback`.
3. **Vercel** (bukan Supabase): `NEXT_PUBLIC_ENABLE_PW_RESET=true` → **Redeploy**.

Uji: "Lupa sandi?" → email akun uji → buka tautan → set sandi baru → login.
Kode: `app/auth/lupa-sandi`, `app/auth/callback`, `app/auth/perbarui-sandi`.

### 3.3 Mode Maintenance
Saat aktif, **semua** route production me-rewrite ke `/maintenance` (status 503 + `Retry-After`); `/api/*`
dapat 503 JSON. Satu-satunya pengecualian = developer lewat tautan rahasia (HRD pun terkunci). Saklar =
item **`maintenance`** di **Vercel Edge Config** → nyala/mati seketika, **tanpa redeploy**. Dicek paling
awal di `proxy.ts` (`lib/maintenance.ts`), **sebelum menyentuh Supabase**, jadi tetap jalan walau DB mati.
Hanya `VERCEL_ENV=production` — Preview `dev` & lokal tak pernah terkunci (Edge Config dibaca bersama
production & Preview). Edge Config gagal dibaca / belum di-Connect → dianggap **mati**. Bypass: banding
waktu-konstan, cookie httpOnly 12 jam. Diuji `tests/maintenance.test.ts`.

**A. Rilis kode (sekali):** PR `dev` → `main` → merge (cek isi PDF panduan yang ikut) → tunggu deploy.

**B. Persiapan Edge Config (sekali, setelah A):**
1. Vercel → project → **Storage** → **Create Database** → **Edge Config** → nama mis. `infarm-maintenance` → **Create**.
2. **Connect** ke project (minimal **Production**). Env `EDGE_CONFIG` otomatis ditambahkan.
3. Store → **Items** → isi `{ "maintenance": false, "maintenance_until": "" }` → **Save**.
4. **Settings → Environment Variables** → `MAINTENANCE_BYPASS_TOKEN` (scope Production) = kode acak ≥ 16 karakter. Simpan untuk developer saja.
5. **Redeploy** production sekali. Selanjutnya tak perlu redeploy.

**C. Uji coba pertama (di luar jam pengisian):**
1. Items → `"maintenance": true` → Save.
2. Jendela incognito → domain app harus tampil "Sedang Maintenance" (coba juga `/login`, `/penilaian`).
3. Browser biasa → `https://<domain>/?bypass=<kode>` → app normal (diminta login).
4. URL Preview `dev` → tetap normal.
5. `"maintenance": false` → Save → incognito dimuat ulang → app terbuka.
   Tak sesuai? Cek `EDGE_CONFIG` ada di scope Production, nilai `true` tanpa tanda kutip, Redeploy B.5 sudah.

**D. Saat maintenance:**
1. **Nyalakan:** Items → `"maintenance": true` (opsional `"maintenance_until": "pukul 15.00 WIB"`, tampil
   sebagai "Perkiraan selesai") → Save. ⚠️ Harus boolean `true` **tanpa kutip** — `"true"` (teks) dianggap mati.
2. **Developer masuk:** `https://<domain>/?bypass=<kode>` sekali → cookie 12 jam (tetap harus login).
3. **Matikan:** `"maintenance": false` → Save. Pengguna di `/maintenance` otomatis diarahkan ke `/`.
4. (Opsional) `/?bypass=off` hapus cookie. Kode bocor → ganti `MAINTENANCE_BYPASS_TOKEN` + Redeploy.

### 3.4 Cron potongan keterlambatan (DINONAKTIFKAN)
Route `app/api/cron/late-penalty/route.ts` memanggil `refreshLatePenalties` (hanya memperbarui
`result_360` yang sudah ada, tak menghitung dari nol). `vercel.json` **sengaja tidak ada** sejak 2026-09-29.
Gantinya: potongan diterapkan otomatis saat HRD membuka Flag Kepatuhan / Review & Finalisasi dan sebelum
`computeFinal` (simpan/rilis/finalisasi); cadangan tombol "Terapkan Potongan ke Skor 360°".
**Aktifkan lagi:** buat ulang `vercel.json` berisi cron `late-penalty` + set `CRON_SECRET`.

---

## 4. Rumus skor & klasifikasi

Sumber kebenaran: `lib/scoring.ts`, `lib/score360.ts`, `lib/late.ts`, `lib/trend.ts` (terkunci, diuji).
Bagian ini hanya menjabarkan. **Ubah ambang di kode → sinkronkan tabel ini + tes.** HRD hanya mengubah
*input* (KPI, bobot %, 360° aktif/nonaktif, potongan); cara blend & ambang ada di kode.

### 4.1 KPI
- `kpiAvgOf` = rerata bulan **terisi** (presisi penuh; bulatkan hanya di akhir). Bulan kosong tidak
  dihitung; **0 = nilai sungguhan**.
- **Trend KPI** (`trendOf`, input 3 bulan pertama `period_months` terurut, null = belum diisi):
  0 bulan terisi → `empty` · 1 → `unread` ("Belum terbaca") · 2 → `stable` (selisih ≤ 2) / `up` / `down`
  · 3 → `stable` (tiap selisih ≤ 2) / `up` / `down` / `volatile` (Fluktuatif hanya di sini).
  Pegawai `unread` dikecualikan dari rerata/distribusi/ranking KPI di Dashboard, Monitor, Laporan Kinerja Tim,
  termasuk tren tahunan & mode "semua kuartal" (`lib/dashboard/aggregate.ts`). Baris tetap tampil; 360° tetap dihitung.

### 4.2 Skor 360°
- Rating 1–5 per indikator → skala 0–100. **Self selalu dikecualikan** (dan Self Assessment nonaktif sejak Q3 2026).
- `weightedScore360` + `schemeFor`/`effectiveModel` — **jangan** menyuapkan model DB langsung.
  - **4 kelas** (Atasan/Peer/Cross/Bawahan): bobot % HRD, dinormalisasi ke kelas yang ada.
  - **2 kelas** (Atasan/Internal; Internal = rerata semua skor Peer+Cross+Bawahan): periode Q1–Q2 pakai bobot tersimpan.
  - **2 kelas otomatis (BR-10)** untuk periode mulai ≥ `AUTO_WEIGHT_FROM` (2026-07-01): dari jumlah penilai
    Internal **per orang** yang mengirim → Atasan + ≥ 2 Internal = **40/60** · Atasan + 1 Internal = **60/40**
    · satu sisi saja = **100%**. Contoh: Atasan 80, Peer 85, Cross 90 → 0,4×80 + 0,6×87,5 = **84,5**.
  - **Bobot khusus per pegawai** (`employee_weight_overrides`) berlaku apa adanya di semua perhitungan
    per pegawai. Agregat aspek org/divisi tetap skema periode.
  - Total bobot (tanpa Self) **wajib 100** (server, UI, dan invarian DB).
- `round2` → 2 desimal (`result_360.score` = `numeric(5,2)`).
- **Tak ada penilaian terkirim yang bisa dihitung** pada periode ber-360° → `NO_SCORE_LABEL` "No Score" (BR-09), bukan 0.
- Hanya `assessments.status='submitted'` yang dihitung (`invalidated` = arsip, tak pernah masuk skor).

### 4.3 Potongan keterlambatan menilai
`result_360.score` = `score_raw` − `late_penalty` (min 0). `latePenaltyOf`: flat **−3 sekali per periode**
bila penilai punya ≥ 1 kewajiban **belum selesai saat deadline** (terkirim sesudah deadline **atau** tak pernah
dikirim). Kewajiban = pemetaan **Wajib** + **AJUAN** (Opsional hasil `relation_correction_requests`
kind='add' approved), Ajuan hanya periode ≥ `AJUAN_PENALTY_FROM` (2026-07-01).
Tidak dihitung: Opsional biasa, Ad-Hoc lama, Paksa Selesai (`forced_by_hrd`), pemetaan dibuat sesudah
deadline, penilaian `invalidated`. Penilai tanpa Skor 360° sendiri → potongan gugur. HRD bisa menetapkan nilai
(`late_penalty_waivers.points`; 0 = dikecualikan; alasan ≥ 3 karakter).
`first_submitted_at` & `forced_by_hrd` diisi **trigger DB** (`assessments_stamp_submit`) — jangan tulis dari app.
Tepat waktu/terlambat (`progressStatusOf`, BR-07): Belum Mulai · Sedang Diisi · Selesai – Tepat Waktu ·
Selesai – Terlambat (+ "Dibatalkan – Tidak Valid"); Paksa Selesai & periode tanpa deadline = tepat waktu.

### 4.4 Skor Akhir — `finalScoreOf(kpi, s360, has360)`
| Kondisi | Skor Akhir |
|---|---|
| KPI & 360° ada (360° aktif) | `KPI × 0,5 + 360° × 0,5` |
| KPI ada, 360° nonaktif/kosong | `KPI` |
| KPI kosong, 360° ada (mis. Direksi) | `360°` |
| keduanya kosong | `null` |

Dibulatkan 2 desimal (`roundScore`, juga untuk tampilan via `fmt2` — bukan `toFixed`). Tidak ada pengurang
lain (Punishment manual dihapus). **Angka tampil** = `displayedFinalOf`: laporan final → `final_reports.final_score`
tersimpan; selain itu angka hidup. Selisih hanya ditampilkan di Review & Finalisasi (`hasScoreDrift`, ≥ 0.01).
Mode Dashboard "semua kuartal" = rerata Skor Akhir **per kuartal**.

### 4.5 Klasifikasi talenta
Input dikunci ke **satu kuartal** lewat filter periode Dashboard (KPI, 360°, Skor Akhir dari periode yang sama); klasifikasi atas nilai **terbulat**.

**4-Box — `playerClassOf(kpi, s360)`** (KPI × 360° langsung, ambang 80, **bukan** Skor Akhir, **tanpa D**):

| Kelas | Syarat |
|---|---|
| `null` | KPI **dan** 360° kosong |
| `A` | KPI ≥ 80 **dan** 360° ≥ 80 |
| `B_CULTURE` | KPI < 80 **dan** 360° ≥ 80 |
| `B_KPI` | KPI ≥ 80 **dan** 360° < 80 |
| `C` | keduanya < 80 |
| `HRD_REVIEW` (BR-11) | tepat **satu** sumbu kosong |

Kuartal tanpa 360° (`has_360=false`, pemanggil mengirim s360 `null`) → semua pegawai ber-KPI = **HRD Review**.

**9-Box — `talentBoxOf`, `kpiBandOf`, `s360BandOf`** (rumus tetap ada & diuji; **tidak ditampilkan** di dashboard).
Batas atas inklusif ke pita lebih tinggi. Butuh KPI & 360° keduanya ada.

| Band | KPI | 360° |
|---|---|---|
| hi | ≥ 90 | ≥ 80 |
| mid | 80 – 89,99 | 70 – 79,99 |
| lo | < 80 | < 70 |

| KPI ↓ \ 360° → | hi | mid | lo |
|---|---|---|---|
| hi | Star Talent | High Performer | Expert / Lone Wolf |
| mid | High Potential | Core Contributor | Needs Align |
| lo | Rough Diamond | Inconsistent Player | Underperformer |

**Kategori kinerja** (`perfCategoryOf`, juga palet diskrit dashboard): ≥ 90 Melampaui Ekspektasi (biru) ·
80–89,99 Memenuhi (hijau) · 70–79,99 Perlu Peningkatan (kuning) · < 70 Di Bawah (merah).
**Standar KPI** per periode (`periods.kpi_standard`, default 80) hanya untuk kartu "KPI Di Atas Standar" — bukan ambang rumus.
Kandidat suksesi = Skor Akhir ≥ 90.

---

## 5. Manajemen Akses — model & penegakan

Konsol `/admin/akses` (gate `isFullHrd` — HRD tak-terbatas saja). Prinsip: **augment, bukan replace** —
akses bawaan peran tetap; grant hanya menambah atau mencabut. Katalog **tetap** (bukan page-builder).

### 5.1 Lapisan izin
| Lapisan | Data | Sifat |
|---|---|---|
| Izin HRD Admin | `employees.is_hrd_admin` → `is_hrd()` = `role='hrd' OR is_hrd_admin` | penuh; hanya divisi HRD (`isHrdDept`: dept diawali "HRD"); pencabutan boleh untuk siapa pun |
| Batas rekan HRD ("Atur Akses") | `employees.hrd_sections text[]` (NULL = penuh), helper `canSection`, katalog `HRD_SECTIONS` | menu + **tulis** ditegakkan DB `hrd_can(bagian)` & Server Action; **baca** tetap `is_hrd()` penuh. Tak bisa ke akun sendiri |
| Koordinator | `employees.is_coordinator` + `coordinator_team_members` | grant non-RLS; baca/tulis via `service_role` berlingkup tim; anggota tim **wajib sedivisi** (`setCoordinatorTeam`) |
| Grant halaman berlingkup | `page_grants` | 1 grant = orang + halaman + lingkup + izin |

Mengubah izin (HRD Admin, bagian HRD, Koordinator + tim) & akun HRD/Direksi (ubah, nonaktifkan, reset sandi)
hanya HRD berakses penuh; tak ada yang bisa mengubah izin dirinya sendiri (trigger `employees_guard_privileges`).

### 5.2 `page_grants`
- Kolom: `employee_id`, `section`, `scope` (lama, = `scopes[0]`, tetap ditulis sinkron), `scopes text[]`,
  `can_edit`, `can_finalize`, unique(employee_id, section).
- Katalog `GRANTABLE_PAGES` (`lib/auth/roles.ts`): `monitor`, `review`, Dashboard Organisasi, Struktur
  Organisasi, Progress 360, Flag Kepatuhan, Monitoring & Audit KPI. Jenis (`GRANTABLE_PAGE_KIND`):
  `pemantauan` (selalu Lihat; `can_edit` dinormalkan false) · `administrator` (saat ini hanya `review`).
- **Lingkup** (multi, digabung OR, `employeeInScopes(scopes, ownDept, ownId, emp, teamIds)`):
  `all` · `own_division` · `other_divisions` · `self` · `coordinator_team` (fail-closed tanpa `teamIds`;
  helper divisi `deptScopeFilter`/`allowedDeptsFor(Multi)`/`isDeptInScope` → `op:'none'` untuk self/team).
  Pola: ambil semua pegawai lalu saring di JS (~100 pegawai); query berat hanya untuk id yang lolos.
- **Izin 3 tingkat** (halaman administrator): Lihat = (edit false) · Meringkas = (edit true, finalize false)
  · Finalisasi = (edit true, finalize true). Backfill: `can_finalize = can_edit` untuk baris lama.
- **Grant per peran** (`setPageGrantForRole`) = materialisasi ke anggota **saat ini** (pegawai baru tak
  otomatis); konfirmasi saat memberi izin edit/finalisasi ke peran luas. Kartu "Pegawai Baru"
  (`joined_on` ≤ 30 hari & `access_reviewed_at` null, `markAccessReviewed`).
- **Peninjau Lintas Divisi** = grant `review` + lingkup `other_divisions` + Meringkas (`is_cross_reviewer`
  & `/peninjau` dipensiunkan; kolom dibiarkan vestigial).

### 5.3 Pola penegakan wajib (tiap halaman yang di-grant)
1. Gate **sadar-mode**: `isHrdFull = canSection(page) && hrdMode==='admin'`.
2. Jalur grant membaca via **`service_role`** berlingkup (`grantedScope`/`grantedAccess`/`deptScopeFilter`/
   `applyDeptScope`, diuji `tests/page-scope.test.ts`) — pemegang non-HRD ditolak RLS.
3. `?dept=` tak boleh menembus lingkup (`resolveDept` fallback aman; filter Divisi menyaring **di dalam** lingkup).
4. Tulis non-HRD ditegakkan server: `resolveReportWriteActor` (`admin/laporan/actions.ts`) cek
   `can_edit`/`can_finalize` + lingkup, tulis via `service_role`. Meringkas → `saveAspectSummaries`/
   `saveQualSummaries`; Finalisasi → + `saveOrFinalizeReport(true)`, `releaseToSpv`, kembalikan ke draf,
   `bulkFinalizeAccepted`. Pemegang grant tak bisa mengubah/memfinalisasi **laporannya sendiri**.
5. Untuk pemegang `is_hrd()` pembatasan izin = **tampilan**; gembok nyata hanya untuk non-HRD.
6. Progress 360 & Flag Kepatuhan untuk non-HRD: hanya **jumlah**; nama target dibuang di server.
7. Data sensitif (laporan/dashboard/ekspor/raw 360°) tidak boleh hanya disembunyikan di menu — wajib
   penyaringan server/RLS. Konfigurasi (pertanyaan/bobot/periode/pemetaan) cukup `canSection`.

---

## 6. Daftar migrasi 0001–0052

Status penerapan per DB → `scripts/check-migrations.sql`.

| No | Isi |
|---|---|
| 0001 | skema awal (tabel) |
| 0002 | RLS per peran |
| 0003 | `compliance_penalties` (Punishment kepatuhan) — **dorman** sejak fitur dihapus (0 baris di prod) |
| 0004 | sifat Wajib/Opsional pada `mappings` |
| 0005 | `hrd_audit_log` (append-only) |
| 0006 | `indicators.description` / `rating_guide` |
| 0007 | 10 indeks FK |
| 0008 | `is_spv()` + SPV tulis KPI diri sendiri |
| 0009 | SPV baca laporan diri (termasuk draf) |
| 0010 | `periods.kpi_standard` (pelaporan) |
| 0011 | enum `report_status` + `in_review` (terapkan terpisah dari 0012) |
| 0012 | cabut `is_my_member` dari `asmt/ais/aqa_read` (tutup L3 ke SPV) |
| 0013 | `is_hrd_admin` + `is_hrd()` |
| 0014 | `relation_correction_requests.reviewed_at` (deteksi skor basi) |
| 0015 | `mappings.is_adhoc` |
| 0016 | `employees.is_external` |
| 0017 | `periods.form_open` |
| 0018 | `employees.is_cross_reviewer` (kini vestigial) |
| 0019 | `kpi_audit.action` (`set`/`delete`) |
| 0020 | `employees.joined_on` / `left_on` |
| 0021 | `employees.is_coordinator` + `coordinator_team_members` |
| 0022 | `assessment_indicator_scores.rating` → numeric(3,2) |
| 0023 | `employees.hrd_sections` |
| 0024 | tabel `page_grants` + RLS self-read |
| 0025 | `page_grants.can_edit` |
| 0026 | `rating` → numeric(8,6) (backfill Looker Q1) |
| 0027 | lingkup `self` |
| 0028 | `page_grants.scopes text[]` (multi-lingkup) |
| 0029 | lingkup `coordinator_team` |
| 0030 | `employees.access_reviewed_at` |
| 0031 | `employee_weight_overrides` |
| 0032 | `page_grants.can_finalize` (izin 3 tingkat) |
| 0033 | migrasi data: pensiun `is_cross_reviewer` → grant Review Meringkas |
| 0034 | `employees.nickname` |
| 0035 | `periods.mapping_published` (fase tinjau pemetaan) |
| 0036 | `periods.assessment_deadline`, `assessments.first_submitted_at`/`forced_by_hrd` + trigger, `result_360.score_raw`/`late_penalty`, `late_penalty_waivers` |
| 0037 · 0038 · 0039 | Exposure Check + N/A (0037), alasan exposure (0038), alasan N/A (0039) — fitur **dicabut**, kolom dorman |
| 0040 | `indicators.rating_key_points` (BARS) |
| 0041 | pengetatan RLS: `asmt_write` wajib pemetaan aktif; trigger `assessments_keep_submitted`, `final_reports_guard_non_hrd`; `kpi_write` hanya bulan periode aktif; cabut cabang target di raw read |
| 0042 | anonimitas: raw read & `map_read`/`corr_read` hanya HRD (+ penilai); cabut `kpi_write`/`kpiaudit_insert` → fungsi atomik `kpi_save_with_audit`/`kpi_delete_with_audit` (service_role; kode punya fallback) |
| 0043 | `late_penalty_waivers.points` |
| 0044 | Exposure Check dicabut total (trigger `trg_assessments_block_exposure`) |
| 0045 | tutup celah server: `assessments_guard_submit`, `assessment_writable`, validasi permohonan, `hrd_can(bagian)`, `employees_guard_privileges`, log ACC via trigger, invarian bobot = 100 & Self, dll. ("maks. satu periode aktif" sengaja **tidak** jadi constraint) |
| 0046 | `assessment_status` + `invalidated` (+ `invalidated_at/by`, `invalid_reason`), trigger `assessments_guard_invalidation` |
| 0047 | `assessment_locked_after_deadline` + trigger `assessments_guard_deadline_lock` |
| 0048 | fungsi `period_activate` & `period_delete` (Aktifkan/Hapus Periode dalam satu transaksi; service_role saja; app jatuh ke cara lama bila belum diterapkan) |
| 0049 | trigger `trg_final_reports_block_self_acc` (tolak menyalakan ACC atas laporan milik pengguna yang login) |
| 0050 | tabel `employee_report_folders` (Folder Laporan Drive per pegawai; baca `is_hrd()`, tulis `hrd_can('pegawai')`; pegawai membaca miliknya via service_role di Laporan Hasil Saya hanya bila punya laporan Final; app menampilkan "belum aktif"/"PDF belum tersedia" bila tabel belum ada) |
| 0051 | bucket Storage `email-assets` (publik baca, 2 MB, JPG/PNG/WebP) untuk gambar Email Rilis Laporan per periode (`release/<period_id>/<kunci>.<ext>`); tulis/hapus hanya Server Action via service_role; tanpa bucket, dialog menampilkan "penyimpanan gambar belum aktif" dan email terkirim tanpa gambar |
| 0052 | tabel `final_report_history` + trigger `trg_final_reports_history` (after insert/update `final_reports`): catat tiap perubahan `spv_acc`/`status`/`final_score` (lama→baru, waktu, `auth.uid()`; NULL untuk service_role → app melengkapi dari `hrd_audit_log` ±15 detik, `lib/report-history.ts`); baca `is_hrd()`, tanpa policy tulis (append-only); snapshot awal saat migrasi. Dipakai panel Riwayat Laporan & tooltip ACC; tanpa tabel → panel "belum aktif" |

---

## 7. Pengujian

### 7.1 Vitest (`npm test`, `npm run test:watch`)
Kenapa: kesalahan rumus tidak memunculkan error ("salah diam-diam"). Tes mengunci rumus; dijalankan
saat kode disentuh, bukan per kuartal. **307 tes / 18 file** (per 2026-10-12). CI menjalankan test +
typecheck + build tiap push/PR.
- Rumus: `scoring`, `score360`, `late`, `trend`, `rated-completeness` (`ratedCompletion` = "Dinilai oleh", selaras Progress 360).
- Impor Excel: `import` (`parseKpiRows`/`isValidKpiRow`/`parseMappingRows`/`classifyMappingRows` + round-trip `xlsx`).
- Akses & keamanan: `roles`, `page-scope`, `report-scope` (`inSpvDivisionScope`/`withoutRaw`), `safe-next`, `maintenance`.
- Server Action (mock Supabase `tests/helpers/mock-supabase.ts`, antrean respons per tabel, tanpa DB):
  `actions-pegawai`, `actions-laporan`, `actions-acc`, `actions-bobot`, `actions-kpi`, `actions-penilaian`, `actions-permohonan`.

### 7.2 Verifikasi RLS (`npm run verify:rls`)
Skrip integrasi `scripts/verify-rls.ts` (bukan unit test): membuat fixture `RLSTEST-*` via service_role,
login per peran (anon key), menguji `kpi_scores` (SPV → tim+diri, Employee → diri, HRD/Direksi → semua;
tulis lintas-SPV ditolak; SPV tulis diri diizinkan) dan raw 360° (SPV ditolak; HRD, penilai, target sesuai
aturan), plus celah 0045 (HRD terbatas, isi penilaian saat form ditutup, permohonan palsu, bobot ≠ 100,
respons suksesi draf, log ACC). **56 pemeriksaan.** Menghapus seluruh fixture di `finally`; tulis memakai
`UPDATE score=score`. Butuh anon + service role key di `.env.local`. Manual pra-rilis, tak di CI.
Ulangi tiap ada migrasi/perubahan RLS.

### 7.3 Smoke test pasca-deploy (~5–10 menit, URL production, akun nyata, HP + laptop)
Satu ❌ di bagian KRITIS → jangan umumkan deploy; rollback/perbaiki.
- **A. Otomatis:** CI hijau untuk commit itu; halaman utama terbuka tanpa 500.
- **B. KRITIS — auth:** HRD login → landing benar, toggle mode cocok dengan isi halaman · SPV → Laporan
  Kinerja Tim → detail 1 anggota → **tak ada nama penilai** · Employee → Laporan Hasil Saya sesuai status ·
  Direksi → ada "Daftar Penilaian Saya" & "Laporan Hasil Saya", tak ada Monitor/Rekap · Employee buka
  `/admin/dashboard` → ditolak.
- **C. KRITIS — alur inti:** Daftar Penilaian tampil + kartu "Penilaian Wajib" + banner Garis Hubungan ·
  Mulai Nilai → isi 1 indikator → ~5 detik "Tersimpan otomatis" → refresh tetap ada · indikator terakhir →
  "Ke Umpan Balik Kualitatif" · esai kosong → Kirim ditolak & lompat ke Kualitatif · lengkap → konfirmasi →
  layar sukses + sisa · SPV input KPI 1 anggota; edit minta komentar · Akun Saya ganti sandi.
- **D. PENTING — angka & tampilan:** Dashboard filter Periode/Divisi/Tahun jalan; heatmap, donut, trendline
  ter-render · Skor Akhir 1 pegawai masuk akal (blend 50/50; potongan sudah di 360°) · logo tampil.
- **E. PENTING — admin:** detail laporan: Simpan Draf / Rilis ke SPV / Finalisasi merespons · ekspor 1 dataset terbuka.

### 7.4 Checklist uji manual menyeluruh
Uji per peran; HRD dua mode. Tiap perubahan perilaku SPV → ulangi untuk HRD Mode-SPV (paritas).
- **Pra-uji:** `npm install`, `build`, `typecheck`, `npm test` (307), `verify:rls` (56), ada periode aktif + data uji.
- **Auth:** login benar/salah; route terproteksi → `/login`; sesi habis di `/admin/*` lalu login → `/`
  (mode base, bukan Admin); "Hubungi HRD" / tautan reset bila flag; logout; Akun Saya (sandi lama salah
  ditolak, min 8); Mode Maintenance & bypass (§3.3 C).
- **Employee:** menu Daftar Penilaian Saya, Laporan Hasil Saya, Akun Saya; tak bisa `/admin/*`, `/kpi`,
  `/monitor`, `/laporan-tim`; laporan hanya saat Final, agregat tanpa komentar mentah.
- **SPV:** menu Input KPI Anggota, Laporan Kinerja Tim, Monitor Kinerja, + menu pegawai; lingkup KPI = tim
  + diri (tanpa pegawai berkoordinator); detail tim terkunci sampai Rilis; setelah rilis: agregat + raw
  **anonim** (lingkup sedivisi), **tak pernah** nama penilai; laporan diri hanya via Laporan Hasil Saya,
  tanpa raw; tak ada baris "Anda" di Laporan Kinerja Tim; ACC hanya setelah rilis, pegawai berkoordinator → read-only.
- **HRD Mode Admin:** default login = base; toggle tampil; akses semua halaman admin; raw anonim + panel
  finalisasi; `/monitor` (SPV) ditolak — gunakan Monitor Kinerja Pegawai.
- **HRD Mode-SPV:** menu = SPV; lingkup sedivisi HRD (termasuk diri); `/kpi` & `/monitor` lingkup SPV;
  detail laporan tanpa nama penilai, gating sama; toggle & isi halaman konsisten.
- **Direksi:** Dashboard Organisasi, Promosi & Suksesi, Laporan Kinerja Tim (laporan SPV saja), Tinjauan
  Hasil Akhir, Log Aktivitas, menu pegawai; tak ada Rekap/Monitor (kecuali di-grant); tak bisa ubah KPI.
- **Siklus 360°:** daftar + Sifat + 4 status; rail & BARS; evidence < 20 ditolak; semua esai wajib; tanpa
  N/A; tanpa Self; draf tersimpan & dilanjutkan; terkirim → Kirim Ulang (tanpa Simpan Draf) sampai deadline,
  sesudahnya **Lihat**; Minta Koreksi / Ajukan Hapus / Ajukan Penilaian → tab Permohonan HRD; Ad-Hoc
  instan ditolak; periode terkunci / form ditutup → server menolak.
- **KPI:** input + diri; pertama tanpa komentar, edit wajib komentar; 0–100; hapus wajib alasan; audit
  append-only; SPV tak bisa tulis KPI SPV lain; KPI pegawai eksternal ditolak; impor Excel (alias kolom,
  uppercase kode, skor kosong dilewati, invalid ditolak, pratinjau).
- **Laporan:** panel aksi per status; radar (Self hanya data lama); ringkasan aspek & kualitatif auto-simpan;
  raw anonim tabel Rating|Komentar; Rilis → Ditinjau; Finalisasi non-blok ACC; ACC gugur saat kembali draf /
  rilis ulang beda skor; PDF rapi.
- **Dashboard:** filter Periode/Divisi/Tahun; KPI tertinggi/terendah, "KPI Di Atas Standar (≥N)" ikut
  `kpi_standard`; heatmap divisi×bulan; donut & palet diskrit; trendline; 4-Box + HRD Review; "No Score";
  "Belum terbaca" dikecualikan.
- **Admin:** periode (buat, aktivasi + peringatan, deadline, umumkan pemetaan, tutup/buka form, kunci,
  buka kembali, hapus ketik `HAPUS`); pertanyaan (salin, BARS key point, hapus hanya bila belum dipakai);
  bobot (total 100, 2 kelas otomatis terkunci, bobot khusus); pemetaan (selalu Wajib, Self ditolak, impor
  pratinjau, hapus hanya Belum Mulai/Draft + alasan, Periksa Validitas); kepatuhan (−3 otomatis, Ubah/0,
  Kembalikan otomatis); Hitung Ulang (hanya di Review & Finalisasi; Q1 ditolak); progress (dua progres,
  panel Ajuan, pengingat, undangan + konfirmasi, Paksa Selesai); Manajemen Akses (grant HRD hanya divisi
  HRD, lingkup & izin, peran, cabut massal, Pegawai Baru); Kelola Pegawai (CRUD, reset sandi, nonaktif →
  pemetaan nonaktif).
- **Ekspor:** 6 kartu terunduh & valid; data 360° anonim.
- **Keamanan:** `SUPABASE_SERVICE_ROLE_KEY` tak ada di bundle; route admin ditolak server untuk non-HRD.
- **Lintas:** logo; indikator tenggat sidebar (kuning ≤ 7 hari, merah hari-H/lewat); empty-state; tabel
  `overflow-x-auto` di HP; dropdown ↑/↓/Enter/Esc; teks ≥ 10px kontras cukup.

### 7.5 Uji beban k6 (`scripts/loadtest/`)
Mengukur apakah Supabase free tier sanggup "100 orang submit serempak". Skrip meniru `submitAssessment`
lewat REST: login → upsert header → batch skor indikator → batch esai; tiap VU = penilai unik.
- ⚠️ **Jangan ke production** (menulis data, butuh periode aktif). `provision.mjs` menolak ref production
  kecuali `ALLOW_PROD=1`. Pakai project staging dengan **semua** migrasi terpasang dan `.env.loadtest`
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` staging).
  Tanpa `.env.loadtest` skrip jatuh ke `.env.local` (production → ditolak).
- Pasang k6 (binary, bukan npm): `winget install k6` / `choco install k6`; cek `k6 version`.
- Langkah:
  ```bash
  node scripts/loadtest/provision.mjs          # default 100 penilai; VU=200 node ... untuk lebih
  k6 run scripts/loadtest/submit.js            # 100 VU, 1 menit
  k6 run -e VUS=100 -e DURATION=2m scripts/loadtest/submit.js
  k6 run -e RAMP=1 -e VUS=100 scripts/loadtest/submit.js   # BURST (naik 10 dtk, tahan 30, turun)
  node scripts/loadtest/teardown.mjs           # WAJIB: hapus fixture LOADTEST-*
  ```
- Lulus: `submit_full_ms` p95 < 3000 ms · `submit_errors` < 1% · `http_req_failed` < 1% (threshold di `submit.js`).
  Banyak 429/503 → rate-limit free tier, pertimbangkan Supabase Pro. p95 > 5 dtk tapi error rendah → lambat
  saat puncak; Pro membantu atau imbau pengisian bertahap. Token tiap VU di-cache; 401 → login ulang.

---

## 8. Backup & restore

Supabase free tier nyaris tanpa backup otomatis. Backup **akhir tiap periode** (setelah finalisasi,
sebelum Kunci & Akhiri), **sebelum** migrasi/reset/perubahan besar, dan boleh mingguan.

### 8.1 Backup manual
```powershell
npm install --no-save pg
node scripts/backup.mjs
npm uninstall --no-save pg
```
Hanya membaca DB. Hasil `backups/backup-<tanggal-jam>/`: `_manifest.json` (tanggal + jumlah baris),
`<tabel>.json` (semua tabel publik — dibaca dari `information_schema` agar tabel baru tak terlewat),
`auth.users.json` (sandi ter-hash), `auth.identities.json`. Tiap run = salinan **lengkap** yang berdiri
sendiri. `backups/` di-gitignore. Ukuran ~1–8 MB. ⚠️ **Salin ke luar laptop** (Drive/eksternal, aturan 3-2-1).
`pg` sengaja dipasang sementara (bukan dependensi tetap).

### 8.2 Backup otomatis harian (GitHub Actions)
`.github/workflows/backup.yml` menjalankan `scripts/backup.mjs` tiap hari **02:00 WIB** (atau manual:
Actions → Backup Database → Run workflow). Hasil **dienkripsi AES-256** sebelum diunggah (repo publik →
artifact bisa diunduh orang lain), disimpan **30 hari**. `pg` dipasang di folder terpisah (bug npm "edgesOut").
Secret (Settings → Secrets and variables → Actions):
- `SUPABASE_DB_URL` — connection string **Session pooler** (Project Settings → Database → Connect).
- `BACKUP_PASSPHRASE` — kata sandi panjang & acak; simpan juga di tempat aman HRD/IT (tanpanya backup tak bisa dibuka).

Jangan pernah mengubah workflow agar mengunggah `backups/` mentah. Arsip jangka panjang: unduh `.enc` akhir
tiap kuartal ke Drive tim.

**Membuka:** Actions → Backup Database → pilih run → unduh artifact (zip berisi `backup-<tanggal>.tar.gz.enc`) → ekstrak →
```bash
BACKUP_PASSPHRASE='<kata sandi>' openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in backup-<tanggal>.tar.gz.enc -out backup.tar.gz -pass env:BACKUP_PASSPHRASE
mkdir -p backups && tar --force-local -xzf backup.tar.gz -C backups
```
lalu restore (§8.4).

### 8.3 Membaca backup di Excel
`node scripts/backup-to-excel.mjs backups/backup-<tanggal-jam>` → `.xlsx` (1 sheet per tabel + RINGKASAN;
`auth.*` dikecualikan). **Hanya untuk dibaca — tak bisa di-restore.** Analisis rutin → menu Ekspor Dataset.

### 8.4 Restore (hanya saat data hilang/rusak)
```powershell
npm install --no-save pg
node scripts/restore.mjs backups/backup-<tanggal-jam> PULIHKAN
npm uninstall --no-save pg
```
Kata `PULIHKAN` wajib. Satu transaksi (gagal → rollback total). FK/trigger dimatikan via
`session_replication_role`. `--no-auth` = tanpa akun login. Restore = **upsert** (deteksi PK, jsonb, buang
kolom generated): baris diubah → dikembalikan · baris dihapus → muncul lagi · baris baru sesudah backup → **tetap ada**.
Diuji idempoten ke DB nyata (2026-06-25, jumlah baris cocok 100%).

### 8.5 Pilihan keandalan
App di Vercel (serverless, tanpa disk permanen) → "simpan ke file lokal" tidak bisa menghimpun data
banyak perangkat; DB terpusat wajib. Urutan: free tier + backup rutin di luar laptop (sekarang) → Supabase
Pro (~$25/bln, backup bawaan, tanpa auto-pause; opsional) → self-host Postgres (beban operasional besar).
Ekspor Dataset Excel = cadangan parsial, bukan pengganti dump.

---

## 9. PDF panduan in-app

Folder `public/panduan/` — dipakai sebagai lampiran email Undangan dan unduhan "Panduan Pengguna" di
Akun Saya. Pemetaan peran → file di `lib/panduan.ts` (sumber tunggal; nama tampil di `PANDUAN_PDF`).

| Penerima | File (nama WAJIB persis) |
|---|---|
| Pegawai tanpa grant Koordinator | `panduan-pegawai.pdf` |
| SPV **dan** pemegang grant Koordinator | `panduan-spv-koor.pdf` |
| HRD Admin (role `hrd` atau `is_hrd_admin`) | `panduan-hrd.pdf` |
| Direksi | `panduan-direksi.pdf` |

- File belum ada → email tetap terkirim tanpa lampiran.
- Isi `public/` dapat diunduh siapa pun yang tahu tautannya → jangan taruh dokumen rahasia (atau `.md`) di sana.
- **Memperbarui:** sunting dokumen sumber Word (tidak disimpan di repo; ada di penyimpanan tim HRD) → ekspor
  PDF dengan nama persis → timpa → naikkan `PANDUAN_VERSION` & `PANDUAN_UPDATED_LABEL` (badge "BARU" di Akun
  Saya) → commit & deploy → cek unduhan tiap peran. Daftar revisi isi yang tertunda:
  [panduan/REVISI-PANDUAN-PDF.md](panduan/REVISI-PANDUAN-PDF.md).

---

## 10. Skrip operasional

| Skrip | Fungsi |
|---|---|
| `seed.ts` / `seed-data.ts` | seed idempoten (roster = `lib/auth/demo-users.ts`) |
| `apply-migration.mjs` | terapkan satu file migrasi (`SUPABASE_DB_URL`) |
| `check-migrations.sql` | cek migrasi 0001–0052 yang terpasang di sebuah DB |
| `backup.mjs` · `restore.mjs` · `backup-to-excel.mjs` | §8 |
| `verify-rls.ts` | §7.2 |
| `import-360-backfill.mjs` | impor skor 360° eksternal (dry-run default; `--apply`, `--create-missing`, `--period=`); CSV `BACKFILL-*.csv` di-gitignore |
| `reset-data` / `reset-full` / `reset-mappings` / `reset-people` (`.mjs`/`.sql`), `delete-people.mjs` | kosongkan data hasil · sisakan hanya pegawai · kosongkan pemetaan · hapus data 360°/KPI orang tertentu · hapus orang permanen — **berbahaya**; skrip reset mem-backup dulu |
| `check-unread.mjs`, `check-single-axis.mjs`, `readiness-check.mjs` | diagnostik read-only (KPI belum terbaca · data satu sumbu · kesiapan 360° periode aktif) |
| `clone-anon-to-staging.ts` | isi staging dengan replika production yang disamarkan (`npx tsx`) |
| `setup-coordinators.mjs`, `fix-period-start-year.mjs` | perbaikan data sekali pakai (riwayat) |
| `loadtest/` | §7.5 |

Pola skrip yang butuh `pg`: `npm install --no-save pg` → jalankan → `npm uninstall --no-save pg`.
**Periode Q1 2026** berisi skor 360° hasil impor Looker (penilaian sintetis, tanpa skema bobot):
`computeResult360` menolak & `reconcileTarget360` melewatinya (`lib/backfill-guard.ts`, dikenali dari
`hrd_audit_log.action='score360.backfill'`). Jangan Hitung Ulang Q1.
