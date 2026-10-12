# Infarm 360° Performance Appraisal System

Aplikasi web **penilaian kinerja (Performance Appraisal) 360°** internal untuk Infarm.
Mengelola siklus penilaian per kuartal: **KPI bulanan**, **umpan balik 360°** (atasan/peer/cross/
bawahan), kalkulasi **Skor Akhir**, klasifikasi talenta (4-Box A/B/C + HRD Review), serta pelaporan
bertahap dari HRD ke SPV lalu ke pegawai.

> Bukan aplikasi e-commerce — tidak ada pembayaran, keranjang, stok, atau pengiriman.

## Peran pengguna

- **Employee** — mengisi penilaian 360°, melihat laporan hasil sendiri (setelah difinalisasi).
- **SPV** — input KPI bulanan tim (+ dirinya), ACC laporan tim, monitor kinerja bawahan.
- **HRD Admin** — kelola periode, pertanyaan, bobot, pemetaan, kepatuhan (potongan keterlambatan), finalisasi
  laporan, dashboard. Merupakan **izin** (`is_hrd_admin`), bukan jabatan — bisa diberikan ke
  Employee/SPV; punya **mode ganda** (Mode Admin ↔ Mode posisi-asli).
- **Direksi** — Dashboard Organisasi, Tinjauan Hasil Akhir (read-only), ACC laporan SPV & promosi/suksesi.

Akses tambahan (Koordinator, grant halaman berlingkup lewat **Manajemen Akses**) diberikan sebagai
**izin**, bukan peran baru.

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
npm test           # vitest — 290 tes: rumus skor, potongan telat, lingkup akses, guard Server Action
npm run verify:rls # verifikasi RLS per peran (butuh kredensial di .env.local)
```

## Deployment

Live di **Vercel**, auto-deploy dari branch `main` (preview otomatis tiap PR). Environment
variables diatur di dashboard Vercel.

Repo GitHub: **`infarmcorp/infarm-360`** (publik). Branch: `main` (production), `dev` (kerja).
Alur: kerja di `dev` → PR ke `main`. Backup database otomatis harian lewat GitHub Actions
(`.github/workflows/backup.yml`, terenkripsi).

**Mode Maintenance:** ubah item `maintenance` → `true` di **Vercel Edge Config** (seketika, tanpa redeploy) →
semua halaman production menampilkan "Sedang Maintenance" (503); Preview `dev` tak terpengaruh. Developer tetap
bisa masuk lewat `/?bypass=<MAINTENANCE_BYPASS_TOKEN>`. Persiapan sekali & langkah → CLAUDE.md "Mode Maintenance".

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
| [sop/](docs/panduan/sop/) | SOP HRD: pegawai baru/keluar, siklus periode, akses, reset sandi. |
| [REVISI-PANDUAN-PDF.md](docs/panduan/REVISI-PANDUAN-PDF.md) | Daftar revisi isi 4 PDF panduan in-app (belum diterapkan). |
| **[docs/pengujian/](docs/pengujian/)** | **Pengujian:** |
| [TESTING-CHECKLIST.md](docs/pengujian/TESTING-CHECKLIST.md) | Checklist uji manual menyeluruh per peran. |
| [SMOKE-TEST.md](docs/pengujian/SMOKE-TEST.md) | Uji kilat ~5–10 menit pasca-deploy. |
| **[docs/pengembangan/](docs/pengembangan/)** | **Pengembangan:** |
| [DEVELOPMENT.md](docs/pengembangan/DEVELOPMENT.md) | Alur dev/staging agar pengembangan tak menyentuh production. |
| [DESAIN-MANAJEMEN-AKSES.md](docs/pengembangan/DESAIN-MANAJEMEN-AKSES.md) | Spesifikasi & keputusan desain Manajemen Akses (grant halaman berlingkup). |

## Keamanan (inti)

Otorisasi berbasis peran adalah inti aplikasi ini, ditegakkan via **RLS di database** (bukan
hanya cek UI). Logika sensitif (kalkulasi Skor Akhir, finalisasi laporan, aktivasi/kunci periode,
bobot) berjalan di **Server Actions** dengan validasi Zod. Identitas penilai (siapa menilai siapa)
hanya diketahui HRD; SPV/Koordinator/Direksi hanya melihat umpan balik **anonim**. Rumus skor terkunci di `lib/scoring.ts` &
`lib/score360.ts` (dijaga oleh unit test).
