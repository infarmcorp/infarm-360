
# CLAUDE.md — Infarm 360° Performance Appraisal System

Panduan untuk Claude Code saat bekerja di repo ini.

## Apa Ini

Aplikasi web **penilaian kinerja (Performance Appraisal) 360° internal** untuk Infarm.
Bukan e-commerce — **tidak ada pembayaran, keranjang, stok, atau pengiriman barang.**

Empat peran pengguna (lihat `src/types.ts` → `UserRole`):
- **Employee** — mengisi penilaian 360 Feedback, lihat laporan hasil sendiri.
- **SPV (Supervisor)** — input KPI bulanan tim, ACC laporan tim, monitor kinerja bawahan.
- **HRD Admin** — kelola siklus periode, pertanyaan, bobot penilai, mapping (termasuk
  **sifat wajib/opsional**), flag kepatuhan + **punishment** (pengurangan poin per kuartal),
  finalisasi Final Report, dashboard. Punya **mode ganda**: bisa bertindak sebagai SPV.
- **Direksi** — dashboard eksekutif, ACC promosi/suksesi.

Acuan fungsional lengkap: `PANDUAN Infarm 360 Portal.pdf`.

## Status Saat Ini vs Target

> **PENTING:** Migrasi fungsional **selesai & live**. Next.js + **Supabase aktif** (auth nyata,
> 19 tabel, RLS penuh per peran, seed idempoten). `/` adalah gerbang auth versi Supabase;
> SPA legacy tinggal arsip di `/legacy`. Lihat `progress.md` untuk peta fitur & route.

**Kondisi sekarang (`as-is`):**
- **Next.js 16 App Router** (Turbopack, React 19, Tailwind v4, TS strict). `motion`,
  `lucide-react`, `xlsx`.
- **Supabase aktif** (ref `beajoczjpywozavatzmf`): auth `@supabase/ssr`, 19 tabel
  (`supabase/migrations/0001`–`0004`), RLS penuh per peran, seed idempoten (`scripts/seed.ts`).
- **Shell persisten** di route group `app/(app)/` — sidebar + landing per peran, sub-fitur
  sebagai tab (`?tab=`). Helper Supabase: `lib/supabase/server.ts`
  (`createClient` user-scoped/RLS vs `createAdminClient` service_role).
- **Semua fitur (P1/P2/P3) sudah dimigrasi** — siklus 360°, KPI, dashboard visual, monitor,
  rekap, suksesi, laporan rinci+PDF, progress 360, koreksi relasi, impor Excel, ad-hoc,
  audit KPI, mode ganda HRD. Referensi pola end-to-end: `app/(app)/kpi/`.
- **Pasca-migrasi (paritas legacy + peningkatan):**
  - **Kelola Pegawai** (`app/(app)/admin/pegawai/`, HRD) — CRUD akun via `service_role`
    (`admin.createUser`) + `employees`/`spv_team_members` user-scoped; email boleh placeholder,
    nonaktif = `is_active:false` + ban akun; kode pegawai bebas-skema + peringatan duplikat.
  - **Roster login dari DB** (employees aktif + email auth) — pegawai baru otomatis muncul;
    fallback `DEMO_USERS` (`app/login/page.tsx`).
  - **Dashboard**: 4 sub-tab (Kompilasi · Analisis KPI · Analisis 360 · Tabel) + **filter
    Periode/Divisi** (server `?period=&dept=`) + pencarian tabel.
  - **Performa**: `app/(app)/loading.tsx` (skeleton) + query halaman berat diparalelkan (`Promise.all`).
- **SPA legacy** (`src/App.tsx`, `@ts-nocheck`, data `src/data.ts`) tinggal **arsip di
  `/legacy`** (client-only, banner "data contoh"). Akan dihapus pra-produksi.
- **Live di Vercel** (auto-deploy dari `main`). Login demo: semua user password
  `Infarm@2026`; daftar di `lib/auth/demo-users.ts` (= sumber seed).

**Sisa pra-produksi (`to-be`):**
- Aktifkan email pengingat via **Resend** (placeholder `sendReminder`/`massReminder` di
  `app/(app)/admin/progress/actions.ts`).
- Hapus `/legacy`, `src/App.tsx`, `src/data.ts`.
- Ganti email seed `nama@infarm.test` → email asli; rotasi kredensial.

Saat mengerjakan fitur, ingat: kerjakan di route Next.js `app/(app)/` (bukan SPA legacy).

## Kekurangan, Rekomendasi & Pengembangan

Daftar hidup (perbarui saat ada perubahan). Sumber: tinjauan internal + catatan pengguna
huruf-kapital di `CARA-PENGGUNAAN.md`. Urut dari paling penting.

### A. Paritas legacy yang belum lengkap (dicatat pengguna)
- ~~**Form "Mulai Nilai" berbeda dari legacy.**~~ ✅ **Selesai** — `assess-form.tsx` dibangun
  ulang ke paritas legacy: **rail aspek** + editor **satu indikator** (Sebelumnya/Selanjutnya),
  **label rating** (Hampir Tidak Pernah…Selalu), **bar progres**, dan **komentar/bukti wajib
  (min. 4 char)** divalidasi klien + server (`submitAssessment`). *Belum diport* (butuh kolom
  DB baru): teks panduan rating & deskripsi kaya per-soal yang di legacy di-hardcode per indeks.
- ~~**"Batalkan Pengisian" tidak ada.**~~ ✅ **Selesai** — `assess-form.tsx` kini punya
  **Batal** (kembali tanpa simpan) & **Buang Draf** (`discardAssessment`, hapus draf +
  skor/jawaban via cascade; hanya draf, RLS milik penilai).
- *(Catatan pengguna soal Komentar Audit KPI = perilaku yang MEMANG diinginkan, bukan bug:*
  *edit skor wajib komentar; input KPI pertama boleh tanpa komentar. Pertahankan.)*

### B. Wajib sebelum go-live (keamanan & kebersihan)
- **Sandi bersama `Infarm2026`** untuk semua akun → minta tiap pegawai ganti; beri sandi
  berbeda per orang. Risiko impersonasi (inti integritas 360°).
- ~~**Self-service ganti sandi (Opsi 1) belum dibangun**~~ ✅ **Selesai** — halaman
  **Akun Saya** (`app/(app)/akun/`, semua peran): verifikasi **sandi saat ini** via
  `signInWithPassword` lalu `updateUser({password})` (Server Action `changeOwnPassword`,
  Zod, min. 8 char). Tautan di footer sidebar. Sandi tak pernah dicatat. Menutup risiko
  sandi bersama tanpa perlu email. (Tetap dorong tiap pegawai menggantinya.)
- **Lupa Sandi via email (Opsi 2) dormant** — kode siap di `app/auth/lupa-sandi`,
  `/auth/callback`, `/auth/perbarui-sandi`; aktifkan dengan email asli + Resend/SMTP +
  `NEXT_PUBLIC_ENABLE_PW_RESET=true` (lihat `progress.md`).
- **Email seed `nama@infarm.test` → email asli**; prasyarat Opsi 2 & pengingat 360°.
- **Hapus arsip legacy** `/legacy`, `src/App.tsx`, `src/data.ts` (catatan: `src/data.ts`
  masih dipakai `scripts/seed.ts` — lepaskan dulu).

### C. Fungsional bernilai tinggi (pengembangan)
- **Pengingat email 360° (Resend)** — placeholder `sendReminder`/`massReminder` di
  `app/(app)/admin/progress/actions.ts`.
- **Ekspor Excel** dashboard/rekap (kini hanya PDF print) — HRD/Direksi sering butuh data mentah.
- **Ringkasan Aspek 360° otomatis (Claude API) — REKOMENDASI, belum dibangun.**
  Editor ringkasan per-aspek sudah ada (`app/(app)/laporan/aspect-summary-editor.tsx` →
  `saveAspectSummaries`, tersimpan di `final_reports.content.aspectSummaries`; HRD bebas
  menyunting lalu Simpan). Tambahkan tombol **"✨ Buat Ringkasan Otomatis"** per aspek yang
  memanggil Server Action baru → kirim **rating + komentar anonim** aspek itu (dari
  `data.byAspect`, **tanpa nama penilai**) ke Claude → isi textarea (HRD tetap edit & Simpan).
  - **Yang diperlukan:** (1) `ANTHROPIC_API_KEY` **server-only** di Vercel (jangan
    `NEXT_PUBLIC_*`, jangan di-commit); (2) `npm i @anthropic-ai/sdk`; (3) Server Action
    HRD-only (`client.messages.create`); (4) pola **dorman/flag** seperti Resend —
    `NEXT_PUBLIC_ENABLE_AI_SUMMARY=true`, tombol muncul hanya bila key terpasang.
  - **Model:** `claude-haiku-4-5` (termurah, $1/$5 per 1 jt token) cukup untuk meringkas;
    `claude-sonnet-4-6` ($3/$15) bila ingin prosa lebih halus.
  - **Dasar perhitungan biaya:** 1 komentar/jawaban ≈ **1.000 karakter ≈ 250 token**
    (±1 token tiap 4 karakter). Yang dikirim per *generate* = semua komentar/jawaban terkait +
    daftar rating + instruksi (~250 token overhead/panggilan); output ringkasan ~250–300 token.
    Kurs asumsi $1 ≈ Rp16.000. Biaya **hanya muncul saat tombol ditekan**, bukan tiap render.
  - **Skenario referensi — 1 pegawai = 10 indikator × 10 penilai (100 komentar) + 3 esai ×
    10 penilai (30 jawaban):**

    | Komponen | Token input | Token output | Haiku 4.5 | Sonnet 4.6 |
    |---|---|---|---|---|
    | Indikator (5 aspek × 2 indikator) | ~26.250 | ~1.250 | $0.033 | $0.099 |
    | Esai (3 pertanyaan) | ~7.750 | ~300 | $0.009 | $0.026 |
    | **Total / pegawai** | **~34.000** | **~1.550** | **~$0.042 (Rp670)** | **~$0.125 (Rp2.000)** |

  - **Total per kuartal (semua pegawai, skenario di atas):**

    | Jumlah pegawai | Haiku | Sonnet |
    |---|---|---|
    | 50 pegawai | ~$2.1 (~Rp34 rb) | ~$6.3 (~Rp100 rb) |
    | 100 pegawai | ~$4.2 (~Rp67 rb) | ~$12.5 (~Rp200 rb) |

  - **Skenario lebih kecil** (per aspek, 1 komentar ≈ 1.000 karakter, Haiku): aspek kecil
    (3 indikator × 6 penilai) ~$0.006, sedang (4×10) ~$0.012, besar (6×12) ~$0.020. Bila
    rata-rata esai ~2.000 karakter (bukan 1.000), komponen esai ≈ 2× — total/pegawai naik
    ke ~$0.05 Haiku (~Rp800), tetap sangat kecil.
  - **Privasi:** komentar 360° = data kinerja sensitif; dengan API teks dikirim ke Anthropic
    (sudah anonim, tanpa nama). Anthropic API menyimpan hingga 30 hari untuk operasional,
    **bukan** untuk melatih model pada data API bisnis. Perlu persetujuan kebijakan internal.
- **Deadline periode lebih tegas** — tampilkan sisa hari + auto-warning saat mendekati
  `end_date` (kini hanya kunci manual).
- **Ganti email mandiri** (opsional, lanjutan Opsi 1) — pertimbangkan verifikasi vs instan.

### D. Keandalan teknis
- ~~**Belum ada satu pun tes.**~~ 🟡 **Mulai** — **Vitest** terpasang (`npm test`).
  Unit test logika skor sudah ada (28 tes, `tests/scoring.test.ts` + `tests/score360.test.ts`):
  `lib/scoring.ts` (`finalScoreOf`, `playerClassOf`, band 9-Box/4-Box) & `lib/score360.ts`
  (`weightedScore360` 4class/2class, **kelas Bawahan**, Self dikecualikan — diekstrak dari
  `app/(app)/admin/360/actions.ts` agar murni & teruji). **Sisa:** tes integrasi RLS,
  parsing impor Excel, dan Server Action lain.
- **Verifikasi RLS menyeluruh per peran** (skrip uji terprogram) sebelum produksi.
- **Aksesibilitas & mobile** — kontras, label form, navigasi keyboard dropdown custom;
  uji tabel lebar (dashboard, pemetaan) di layar kecil.

## Keputusan Arsitektur (terkunci)

1. **Migrasi penuh ke Next.js App Router, bertahap** (bukan rewrite sekaligus, bukan
   menempel Supabase di Vite). Logika sensitif WAJIB di Server Action / Route Handler.
2. **Pola dibuktikan lewat vertical slice tipis dulu**: fitur **Input KPI bulanan (SPV)**
   = referensi end-to-end (auth → Server Action + Zod → tulis `kpi_scores` + `kpi_audit`
   → uji RLS). Fitur lain mereplikasi pola ini. Lihat `supabase/migrations/` untuk skema.
3. **Skema DB**: `supabase/migrations/0001_init.sql` (tabel) & `0002_policies.sql` (RLS).
   `result_360` & kalibrasi skor akhir hanya ditulis `service_role` dari server.

## Tech Stack (Target)

- **Framework**: Next.js 16 (App Router, terbaru — verifikasi versi pasti saat scaffold)
- **Language**: TypeScript (strict mode)
- **Frontend**: React 19, Tailwind CSS v4
- **Backend**: Next.js Server Actions + Route Handlers
- **Database & Auth**: Supabase (PostgreSQL, Auth, Storage, **RLS**, Edge Functions)
- **Validasi**: Zod (di sisi server)
- **Excel/CSV**: `xlsx` (parse di klien) — impor KPI massal & impor mapping 360.
- **PDF**: print-to-PDF (`window.print()` + CSS `@media print`) — fitur "Unduh PDF" laporan.
- **Email**: Resend — fitur "Kirim Pengingat" 360 (**belum aktif**, placeholder siap).
- **Deployment**: Vercel · **Version Control**: GitHub · **Package Manager**: npm

## Deployment (Vercel)

- Preview deploy otomatis dari setiap PR; production dari branch `main`.
- Environment variables di Vercel dashboard (jangan di-commit):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only
RESEND_API_KEY                 # server-only (jika email reminder dipakai)
```

## Security Rules

- **Jangan expose** `SUPABASE_SERVICE_ROLE_KEY` di frontend.
  Hanya `NEXT_PUBLIC_*` yang boleh sampai ke client.
- **Otorisasi berbasis peran adalah inti keamanan aplikasi ini.** Tegakkan dengan
  **Supabase Row Level Security (RLS)** di level database, bukan hanya cek di UI:
  - Employee hanya boleh baca/tulis penilaian & laporan miliknya.
  - SPV hanya boleh akses KPI/laporan bawahannya.
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
- Domain types ada di `src/types.ts` — perluas di sana, jangan duplikasi.
- **Skor Akhir (SPA legacy)** = blend KPI+360 **dikurangi** punishment kepatuhan per kuartal
  (`compliancePenalties[quarterKey][empId]`, min 0). Ada beberapa fungsi skor akhir terpisah
  (komponen-level + lokal Monitor Kinerja); kalau mengubah rumus, sinkronkan semuanya.
- **Klasifikasi talenta Dashboard** (9-Box KPI×360 & 4-Box A/B/C/D Player) **dikunci ke satu
  kuartal** lewat `getTalentQuarterKey()` (filter satu kuartal → kuartal itu; "Semua" →
  `activeQuarterKey`) agar KPI, 360°, dan Skor Akhir dari periode sama. Wajib hormati flag
  `quarters[qKey].has360` (`isTalent360Active`): kuartal tanpa 360° → 9-Box tidak diplot &
  kolom tabel `N/A`, dan kategori A Player nonaktif (Skor Akhir = 100% KPI). Helper inti:
  `getTalentMatrix`, `getPlayerMatrix`, `getEmpTalentBox`, `getEmpPlayerBox`.

## Pengujian (Vitest) — logika skor

> **Kenapa ada:** rumus skor (Skor Akhir, 9-Box, A/B/C/D, bobot 360°) menentukan keputusan
> SDM nyata (promosi, punishment, kategori talenta). Kesalahan rumus **tidak memunculkan
> error** — aplikasi tetap jalan, angkanya saja yang salah ("salah diam-diam"). Tes mengunci
> rumus: bila ada perubahan tak sengaja, `npm test` langsung **gagal merah** sebelum sampai
> ke pengguna. Tes ini **bukan** aktivitas kuartalan — dijalankan saat **kode disentuh**.

- **Jalankan:** `npm test` (sekali) atau `npm run test:watch` (mode pantau).
- **Cakupan (28 tes):**
  - `tests/scoring.test.ts` → `lib/scoring.ts`: `finalScoreOf` (blend 50/50, KPI-only, s360
    null, punishment, floor 0), `playerClassOf` (A hanya bila 360 aktif & final≥90 & kpi≥90 &
    360≥80; ambang B/C/D), `kpiBandOf`/`s360BandOf` (ambang band), `talentBoxOf` (9 kotak).
  - `tests/score360.test.ts` → `lib/score360.ts`: `weightedScore360` model **4class** (semua
    kelas, normalisasi bobot saat kelas kosong, **kelas Bawahan**, **Self dikecualikan**) &
    **2class** (Internal = rerata semua skor Peer+Cross+Bawahan, fallback satu sisi).
- **Rumus inti ada di KODE, bukan UI.** Yang bisa diubah HRD lewat aplikasi = *input* (bobot
  %, 360° aktif/nonaktif, KPI, punishment). Cara blend (50/50) & ambang (≥90 dst.) terkunci di
  `lib/scoring.ts` / `lib/score360.ts` — hanya berubah lewat edit kode + deploy.
- **Kalau sengaja mengubah rumus:** perbarui juga tes terkait (kunci jawaban) agar lolos.
  `lib/score360.ts` diekstrak dari `app/(app)/admin/360/actions.ts` — jaga keduanya sinkron.
- **CI (`.github/workflows/ci.yml`)** menjalankan `npm test` + typecheck + build **otomatis
  tiap push ke `main` & tiap PR**. Status ✓/✗ muncul di tab **Actions** GitHub.

## Perintah

```bash
npm install
npm run dev        # Next.js dev :3000
npm run build      # next build (jalankan sebelum push — memvalidasi tipe & prerender)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm test           # vitest run — unit test logika skor (lib/scoring.ts, lib/score360.ts)
npm run test:watch # vitest mode pantau (re-run saat file berubah)
```
