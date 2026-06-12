
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

> **PENTING:** Next.js **sudah** ada & **live di Vercel**. Supabase **belum** (belum ada
> auth/DB nyata) — jangan asumsikan tabel/RLS sudah aktif.

**Kondisi sekarang (`as-is`):**
- **Next.js 16 App Router** (sudah dikonversi dari Vite). React 19, Tailwind v4 (postcss),
  `motion`, `lucide-react`.
- **SPA legacy** (`src/App.tsx`, monolitik, state `useState`, data hardcoded `src/data.ts`)
  masih dirender di route `/` secara **client-only** (`app/page.tsx` → `next/dynamic`
  `ssr:false`). File legacy ditandai `@ts-nocheck` — utang migrasi, ditipekan bertahap.
- Fitur yang sudah dimigrasi punya route Next.js + Server Action sendiri:
  `app/(spv)/kpi/` (Input KPI) — referensi pola.
- Supabase helpers di `lib/supabase/` + tipe DB subset `lib/database.types.ts`.
- **Belum ada auth/DB live**: butuh `.env.local` Supabase + `supabase db push` + login.
- **Sudah live di Vercel** (auto-deploy dari `main`). Login demo: semua user password
  `Infarm@2026`; daftar kredensial di `lib/auth/demo-users.ts` (jadi sumber seed Supabase nanti).

**Target (`to-be`) — arah migrasi:**
- Migrasi ke **Next.js (App Router)** + **Supabase**.
- Pecah `App.tsx` menjadi route + Server Components/Server Actions.
- Ganti `src/data.ts` dengan tabel Supabase + Row Level Security per peran.

Saat mengerjakan fitur, konfirmasi dulu apakah menyentuh **SPA legacy** (`src/App.tsx` di
route `/`) atau bagian yang sudah dimigrasi ke route Next.js (`app/`).

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
- **Excel/CSV**: `xlsx` / `papaparse` — impor KPI massal & impor mapping 360.
- **PDF**: library PDF (mis. `@react-pdf/renderer`) — fitur "Unduh PDF" laporan.
- **Email**: Resend / Supabase — fitur "Kirim Pengingat" pengisian 360.
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

## Perintah

```bash
npm install
npm run dev        # Next.js dev :3000
npm run build      # next build (jalankan sebelum push — memvalidasi tipe & prerender)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```
