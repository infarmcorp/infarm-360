# Infarm 360° Performance Appraisal System

Aplikasi web **penilaian kinerja (Performance Appraisal) 360°** internal untuk Infarm.
Mengelola siklus penilaian per kuartal: **KPI bulanan**, **umpan balik 360°** (atasan/peer/cross/
bawahan), kalkulasi **Skor Akhir**, klasifikasi talenta (9-Box & A/B/C/D), serta pelaporan
bertahap dari HRD ke SPV lalu ke pegawai.

> Bukan aplikasi e-commerce — tidak ada pembayaran, keranjang, stok, atau pengiriman.

## Peran pengguna

- **Employee** — mengisi penilaian 360°, melihat laporan hasil sendiri (setelah difinalisasi).
- **SPV** — input KPI bulanan tim (+ dirinya), ACC laporan tim, monitor kinerja bawahan.
- **HRD Admin** — kelola periode, pertanyaan, bobot, pemetaan, kepatuhan (potongan keterlambatan), finalisasi
  laporan, dashboard. Merupakan **izin** (`is_hrd_admin`), bukan jabatan — bisa diberikan ke
  Employee/SPV; punya **mode ganda** (Mode Admin ↔ Mode posisi-asli).
- **Direksi** — dashboard eksekutif, ACC promosi/suksesi.

## Tech stack

- **Next.js 16** App Router (Turbopack, React 19, TypeScript strict)
- **Tailwind CSS v4**
- **Supabase** (PostgreSQL, Auth via `@supabase/ssr`, **Row Level Security** per peran)
- **Zod** (validasi server), **xlsx** (impor/ekspor Excel), **nodemailer/Resend** (email)
- **Vitest** (unit test logika skor) · **GitHub Actions** (CI) · **Vercel** (deploy)

## Menjalankan secara lokal

**Prasyarat:** Node.js + akses ke project Supabase.

```bash
npm install
npm run dev        # Next.js dev di http://localhost:3000
```

Buat `.env.local` (jangan di-commit):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # server-only, JANGAN diekspos ke client
# Opsional — email pengingat/undangan:
SMTP_USER=...                        # Gmail (jalur SMTP)
SMTP_PASS=...                        # App Password Gmail (butuh 2FA)
SMTP_FROM="Infarm 360 <email>"       # opsional
```

## Perintah

```bash
npm run dev        # dev server
npm run build      # build produksi (validasi tipe & prerender)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm test           # vitest — unit test lib/scoring.ts & lib/score360.ts
npm run verify:rls # verifikasi RLS per peran (butuh kredensial di .env.local)
```

## Deployment

Live di **Vercel**, auto-deploy dari branch `main` (preview otomatis tiap PR). Environment
variables diatur di dashboard Vercel.

## Dokumentasi

| Berkas | Isi |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Panduan teknis internal (durable): arsitektur, keputusan terkunci, skema DB/migrasi, aturan keamanan, klasifikasi talenta. |
| **[docs/perencanaan/](docs/perencanaan/)** | **Perencanaan & pelacakan kerja:** |
| [TODO.md](docs/perencanaan/TODO.md) | Pekerjaan yang masih harus dikerjakan & dilacak sampai tuntas (🔑 = butuh aksi pengguna). |
| [BACKLOG.md](docs/perencanaan/BACKLOG.md) | Ide/pengembangan opsional & masa depan yang belum jadi komitmen. |
| [CHANGELOG.md](docs/perencanaan/CHANGELOG.md) | Catatan historis perubahan: invariant lintas-fitur, alasan keputusan, daftar migrasi. |
| [STATUS.md](docs/perencanaan/STATUS.md) | Potret status & catatan sesi terkini (cepat-basi). |
| [REKOMENDASI.md](docs/perencanaan/REKOMENDASI.md) | Catatan operasional & perencanaan peluncuran. |
| **[docs/panduan/](docs/panduan/)** | **Panduan pengguna:** |
| [CARA-PENGGUNAAN.md](docs/panduan/CARA-PENGGUNAAN.md) | Panduan pengguna akhir per peran + alur lengkap penilaian. |
| [RINCIAN-TOMBOL.md](docs/panduan/RINCIAN-TOMBOL.md) | Kamus tiap tombol di tiap halaman (fungsi · peran · kondisi · konfirmasi). |
| [CARA-BACKUP.md](docs/panduan/CARA-BACKUP.md) | Cara backup & restore data (Supabase free tier). |
| **[docs/pengujian/](docs/pengujian/)** | **Pengujian:** |
| [TESTING-CHECKLIST.md](docs/pengujian/TESTING-CHECKLIST.md) | Checklist uji manual menyeluruh per peran. |
| [SMOKE-TEST.md](docs/pengujian/SMOKE-TEST.md) | Uji kilat ~5–10 menit pasca-deploy. |
| **[docs/pengembangan/](docs/pengembangan/)** | **Pengembangan:** |
| [DEVELOPMENT.md](docs/pengembangan/DEVELOPMENT.md) | Alur dev/staging agar pengembangan tak menyentuh production. |

## Keamanan (inti)

Otorisasi berbasis peran adalah inti aplikasi ini, ditegakkan via **RLS di database** (bukan
hanya cek UI). Logika sensitif (kalkulasi Skor Akhir, finalisasi laporan, aktivasi/kunci periode,
bobot) berjalan di **Server Actions** dengan validasi Zod. Umpan balik 360° mentah (komentar
per penilai) **tidak pernah** terbaca oleh SPV. Rumus skor terkunci di `lib/scoring.ts` &
`lib/score360.ts` (dijaga oleh unit test).
