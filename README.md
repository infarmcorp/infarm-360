# Infarm 360° Performance Appraisal System

Aplikasi web **penilaian kinerja (Performance Appraisal) 360°** internal untuk Infarm. Mengelola siklus
penilaian per kuartal: **KPI bulanan**, **umpan balik 360°** (atasan/peer/lintas divisi/bawahan), kalkulasi
**Skor Akhir**, klasifikasi talenta (4-Box A/B/C + HRD Review), dan pelaporan bertahap dari HRD ke SPV lalu
ke pegawai. Bukan aplikasi e-commerce.

## Peran
- **Employee** — mengisi penilaian 360°, melihat laporan sendiri setelah difinalisasi.
- **SPV** — input KPI bulanan tim (+ dirinya), ACC laporan tim, monitor kinerja tim.
- **HRD Admin** — **izin** (bukan jabatan) untuk mengelola periode, pertanyaan, bobot, pemetaan, kepatuhan,
  finalisasi, dashboard. Punya mode ganda (Mode Admin ↔ mode posisi asli).
- **Direksi** — Dashboard Organisasi, Tinjauan Hasil Akhir, ACC laporan SPV & rencana suksesi.

Koordinator dan akses halaman berlingkup diberikan sebagai **izin** lewat Manajemen Akses.

## Tech stack
Next.js 16 App Router (React 19, TypeScript strict) · Tailwind CSS v4 · Supabase (PostgreSQL, Auth, Row Level
Security per peran) · Zod · xlsx · nodemailer/Resend · Vitest · GitHub Actions · Vercel.

## Menjalankan secara lokal
Prasyarat: Node.js + akses ke project Supabase **dev/staging** (jangan production — lihat
[docs/TEKNIS.md](docs/TEKNIS.md) §1).

```bash
npm install
npm run dev        # http://localhost:3000
```

Salin `.env.example` menjadi `.env.local` (jangan di-commit) dan isi minimal `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Daftar lengkap env var: [docs/TEKNIS.md](docs/TEKNIS.md) §2.

## Perintah
```bash
npm run build      # build produksi (validasi tipe & prerender)
npm run typecheck  # tsc --noEmit
npm run lint
npm test           # vitest — 307 tes: rumus skor, potongan telat, lingkup akses, guard Server Action
npm run verify:rls # verifikasi RLS per peran (butuh kredensial di .env.local)
```

## Deployment
Live di **Vercel**, auto-deploy dari `main` (preview untuk branch lain). Repo **`infarmcorp/infarm-360`**
(publik): kerja di `dev` → PR ke `main`. Backup database otomatis harian lewat GitHub Actions (terenkripsi).
**Mode Maintenance** dinyalakan dari Vercel Edge Config tanpa redeploy — [docs/TEKNIS.md](docs/TEKNIS.md) §3.3.

## Dokumentasi
| File | Isi |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Aturan tetap untuk Claude Code: arsitektur, keamanan, invariant akses & skor, design system |
| [docs/RENCANA.md](docs/RENCANA.md) | Status terkini, pekerjaan terbuka, ide opsional, catatan operasional periode |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Riwayat perubahan & alasan keputusan |
| [docs/TEKNIS.md](docs/TEKNIS.md) | Alur dev/staging, env var, aktivasi, rumus & klasifikasi, akses, migrasi, pengujian, backup |
| [docs/PANDUAN.md](docs/PANDUAN.md) | Panduan pengguna per peran, tombol, SOP HRD |

## Keamanan (inti)
Otorisasi berbasis peran ditegakkan lewat **RLS di database**, bukan hanya UI. Logika sensitif (Skor Akhir,
finalisasi, aktivasi/kunci periode, bobot) berjalan di Server Action dengan validasi Zod. Siapa menilai siapa
hanya diketahui HRD; SPV/Koordinator/Direksi hanya melihat umpan balik **anonim**. Rumus skor terkunci di
`lib/scoring.ts` & `lib/score360.ts` dan dijaga unit test.
