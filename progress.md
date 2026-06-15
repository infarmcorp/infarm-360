# PROGRESS — Infarm 360° Performance Appraisal

Status migrasi dari **SPA legacy** (`src/App.tsx`, localStorage, data contoh) ke
**Next.js App Router + Supabase** (auth nyata, PostgreSQL, RLS, live di Vercel).

> Ringkas: **migrasi fungsional selesai — seluruh fitur (P1/P2/P3) sudah termigrasi & live.**
> `/` kini gerbang auth versi Supabase; SPA legacy tinggal arsip di `/legacy`. Satu-satunya
> sisa opsional: aktivasi email pengingat via Resend (butuh setup eksternal).

Terakhir diperbarui: 2026-06-13

---

## ✅ Sudah Dibangun (live di produksi)

### Fondasi & Infrastruktur
- [x] **Next.js 16 App Router** (Turbopack, React 19, Tailwind v4, TS strict) — sudah live di Vercel, auto-deploy dari `main`.
- [x] **Supabase provisioning** (ref `beajoczjpywozavatzmf`, region ap-northeast-1).
- [x] **Skema DB** — 19 tabel (`0001_init.sql`) + RLS penuh per peran (`0002_policies.sql`) + `compliance_penalties` (`0003`) + `mappings.mandatory` (`0004`).
- [x] **Seed idempoten** (`scripts/seed.ts`) — 10 akun auth, employees, tim SPV, periode, aspek/indikator/pertanyaan, bobot, mapping, KPI (72 baris) dari `src/data.ts`.
- [x] **Auth Supabase** — `@supabase/ssr`, proxy Next 16 (`proxy.ts`), login/logout, gating route.

### Siklus Penilaian Inti
- [x] **Login** (`/login`) — email + password, redirect `next=`.
- [x] **Daftar Penilaian Saya** (`/penilaian`) — siapa yang harus dinilai di periode aktif.
- [x] **Pengisian 360** (`/penilaian/[targetId]`) — rating 1–5 per indikator + komentar + esai, Simpan Draf / Kirim (Server Action + Zod).
- [x] **Kalkulasi Skor 360** (`/admin/360`) — HRD hitung skor 360 terbobot (service_role), Self dikecualikan.
- [x] **Input KPI Bulanan** (`/kpi`) — SPV/HRD isi KPI tim (+ audit trail append-only).
- [x] **Dashboard Organisasi** (`/admin/dashboard`) — Skor Akhir + 9-Box + A/B/C/D Player **(versi tabel)**.
- [x] **Review & Finalisasi Hasil Akhir** (`/admin/laporan`) — HRD hitung Skor Akhir, Simpan Draf / Finalisasi.
- [x] **ACC Laporan Tim** (`/laporan-tim`) — SPV beri ACC anggota tim.
- [x] **Laporan Hasil Saya** (`/laporan`) — pegawai lihat hasil (hanya setelah finalisasi).
- [x] **Flag Kepatuhan & Punishment** (`/admin/kepatuhan`) — deteksi telat wajib + pengurangan poin.

### Konfigurasi HRD
- [x] **Kelola Periode** (`/admin/periode`) — buat, aktivasi (invarian 1 aktif), kunci & akhiri, toggle has_360.
- [x] **Pemetaan Penilai 360** (`/admin/pemetaan`) — siapa menilai siapa + relasi + sifat Wajib/Opsional.
- [x] **Kelola Bobot Penilai** (`/admin/bobot`) — bobot Atasan/Peer/Cross/Self.
- [x] **Kelola Pertanyaan** (`/admin/pertanyaan`) — indikator (soft-delete) + pertanyaan esai.

### Cutover (Fase 6, Opsi B)
- [x] `/` → server-redirect **berbasis peran** (tanpa sesi → `/login`; Pegawai → `/penilaian`, SPV → `/kpi`, HRD/Direksi → `/admin/dashboard`).
- [x] SPA legacy diparkir di `/legacy` (banner "data contoh"), publik sementara.
- [x] Hub `/home` **dihapus** — diganti shell persisten + landing per peran (lihat Restrukturisasi UI).

---

## ✅ Gap Fitur — SELESAI (sebelumnya hanya di `/legacy`, kini termigrasi)

Semua item di bawah sudah dibangun, terverifikasi RLS, dan live. Pendekatan: ekstrak
komponen presentasional dari `src/App.tsx`, lalu beri data dari Supabase.

### Prioritas 1 — Visual & Analitik
- [x] **Dashboard visual** — chart 9-Box (grid), 4-Box (kartu), bar KPI per departemen, bar sub-aspek 360°, stat mini, top/bottom performer. Tabel rinci jadi `<details>` di bawah. (`app/admin/dashboard/dashboard-visual.tsx`)
- [x] **Monitor Kinerja** (`/monitor`) — tren bulanan KPI / 360° / Skor Akhir per pegawai (chart SVG + tabel), filter divisi & pegawai. SPV → tim, HRD/Direksi → semua. RLS aman. (`app/monitor/`)
- [x] **Rekapitulasi Kuartal** — kini **tab di dalam Input KPI** (`/kpi?tab=rekap`): tabel per periode (KPI bulanan, Rataan, 360°, Skor Akhir, Kategori). SPV → tim, HRD/Direksi → semua. (`app/(app)/kpi/rekap-view.tsx`)

### Restrukturisasi UI — Shell persisten ala legacy ✅
- Route group **`app/(app)/`** + `layout.tsx` + `app-shell.tsx` (sidebar persisten: brand, indikator periode, menu berkelompok per peran, profil + Keluar). URL tiap route TETAP sama.
- **Landing per peran** (ganti Beranda hub): `/` → Pegawai `/penilaian` · SPV `/kpi` · HRD/Direksi `/admin/dashboard`.
- **Rekap = tab dalam Input KPI** (Input · Rekapitulasi); Monitor item sidebar sendiri.
- Route dipindah ke `(app)`: admin/*, penilaian, laporan, laporan-tim, monitor, kpi. **Dihapus**: `/home`, `/rekap` (jadi tab). Tautan "← Beranda" → `/`.

> **Catatan keamanan (fix):** `SPV_TEAMS` dulu lintas divisi → SPV bisa baca KPI/360 divisi lain via RLS `is_my_member`. Diperbaiki: tim selaras divisi + `spv_team_members` DB live direkonsiliasi. Diverifikasi 0 kebocoran.

### Prioritas 2 — Fitur Eksekutif & Laporan
- [x] **Promosi & Suksesi** + **ACC Direksi** (`/suksesi`) — HRD ajukan rencana (berbasis Skor Akhir), Direksi setuju/tolak + komentar. RLS: pegawai tak melihat. (`app/(app)/suksesi/`)
- [x] **Dokumen laporan rinci** — radar aspek (others vs self), ringkasan skor, komentar mentah per penilai + badge Self. `/laporan` (pegawai, anonim) & `/laporan/[employeeId]` (HRD/Direksi/SPV, bernama). (`lib/report.ts`, `app/(app)/laporan/report-doc.tsx`)
- [x] **Unduh PDF** laporan — via print-to-PDF (`window.print()` + CSS `@media print`), tanpa dependensi berat. (Alternatif `@react-pdf/renderer` bila perlu PDF server-side.)

### Prioritas 3 — Operasional & Integrasi
- [x] **Progress 360** (`/admin/progress`) — pantau kelengkapan per penilai + **Paksa Selesai** per tugas (HRD upsert assessment). **Kirim Pengingat / Pengingat Massal** = placeholder (email menunggu Resend). (`app/(app)/admin/progress/`)
  - [ ] *(menunggu)* Aktifkan email pengingat via **Resend** (`RESEND_API_KEY` + domain).
- [x] **Minta Koreksi Garis Hubungan** — pengajuan di /penilaian (tombol+modal), tinjauan HRD sebagai **tab di Pemetaan** (halaman-dalam-halaman ala legacy). Setuju → relasi mapping diperbarui. RLS terverifikasi. (`app/(app)/penilaian/correction-*`, `admin/pemetaan/review-button.tsx`)
- [x] **Impor Excel** — KPI massal (mode di Input KPI) & mapping massal (panel di Pemetaan). Parse `xlsx` di klien → pratinjau → simpan via Server Action. Template tersedia. (`kpi-form.tsx`, `pemetaan/mapping-import.tsx`)
- [x] **Penilaian Ad-Hoc** — panel di Daftar Penilaian Saya: nilai rekan di luar mapping rutin. Membuat mapping Cross/Opsional via service_role, lalu dinilai normal. RLS terverifikasi. (`app/(app)/penilaian/adhoc-*`)
- [x] **Riwayat/Audit KPI viewer** — tab "Riwayat & Audit" di Input KPI: jejak `kpi_audit` per pegawai (append-only). SPV → tim, HRD → semua. (`app/(app)/kpi/riwayat-view.tsx`)
- [x] **Mode ganda HRD-as-SPV** — toggle sidebar (cookie `hrd_mode`): Admin ↔ SPV Mode. Mode SPV: Input KPI (semua pegawai), Monitor, Rekap. (`app/(app)/mode-actions.ts`, `app-shell.tsx`)

### Pasca-migrasi — Operasional Data
- [x] **Kelola Pegawai** (`/admin/pegawai`, HRD) — tambah/ubah/nonaktif pegawai + reset sandi + tautkan atasan (tim SPV), tanpa edit file/reseed. Akun auth via `service_role` (`admin.createUser`); `employees`/`spv_team_members` via client user-scoped (RLS `emp_manage`/`team_manage`). Email boleh placeholder (login email+sandi tanpa verifikasi inbox); nonaktif = `is_active:false` + BAN akun. **Roster login kini dari DB** (pegawai baru otomatis muncul; fallback `DEMO_USERS`). RLS terverifikasi (HRD boleh, pegawai biasa ditolak 42501). (`app/(app)/admin/pegawai/`)

### Penyesuaian UI tambahan ✅
- **Login ala legacy**: pilih Peran → Nama → Sandi (tanpa ketik email; roster dari DEMO_USERS), + cadangan "email manual". (`app/login/`)
- **Kalkulasi Skor 360°** kini tab di **Kelola Bobot** (`/admin/bobot?tab=kalkulasi`); route `/admin/360` dihapus.
- **Layout full-width** di semua halaman shell (konten dekat sidebar, hilang ruang kosong tengah).

### Reset Sandi via Email (Opsi 2 — DORMANT, siap diaktifkan)
Alur "Lupa Sandi" sudah dibangun penuh tetapi **disembunyikan di balik flag** sampai email
asli + SMTP siap. Tanpa flag, link "Lupa sandi?" tak muncul & `/auth/lupa-sandi` redirect ke
`/login`. File: `app/auth/lupa-sandi/`, `app/auth/callback/`, `app/auth/perbarui-sandi/`,
link di `app/login/login-form.tsx` (`NEXT_PUBLIC_ENABLE_PW_RESET`).

**Langkah aktivasi (tanpa coding lagi):**
1. **Isi email asli** pegawai (ganti `nama@infarm.test`) lewat Kelola Pegawai.
2. **Aktifkan SMTP/Resend** di Supabase → *Authentication → Emails* (pastikan template
   "Reset Password" aktif). Bawaan Supabase dibatasi ~2–4 email/jam — cukup untuk uji.
3. **Daftarkan Redirect URL** di Supabase → *Authentication → URL Configuration →
   Redirect URLs*: `https://<domain-vercel>/auth/callback`.
4. Set env di **Vercel** (Production): `NEXT_PUBLIC_ENABLE_PW_RESET=true` → redeploy.

### Penutup
- [ ] Saat semua gap tertutup → **hapus** `/legacy`, `src/App.tsx`, `src/data.ts`.
- [ ] (Pra-produksi) Ganti email seed `nama@infarm.test` → email asli; rotasi kredensial.

---

## Peta Route Saat Ini

Semua route di bawah `(app)/` berbagi shell sidebar persisten (kecuali `/login`, `/auth`, `/legacy`).

| Route | Peran | Status |
|---|---|---|
| `/` | semua | ✅ gerbang auth (redirect berbasis peran) |
| `/login`, `/auth/signout` | publik | ✅ |
| `/legacy` | publik (sementara) | ✅ SPA lama (data contoh) |
| `/penilaian`, `/penilaian/[targetId]` | semua (+ panel Ad-Hoc & Minta Koreksi) | ✅ |
| `/laporan`, `/laporan/[employeeId]` | pegawai (anonim) / HRD·Direksi·SPV (bernama) | ✅ |
| `/kpi` (tab: input · riwayat · rekap) | SPV/HRD | ✅ |
| `/laporan-tim` | SPV/HRD-as-SPV | ✅ |
| `/monitor` | SPV (tim) / HRD·Direksi (semua) | ✅ |
| `/suksesi` | HRD (ajukan) / Direksi (ACC) | ✅ |
| `/admin/dashboard` | HRD (+Direksi) | ✅ |
| `/admin/laporan`, `/admin/kepatuhan`, `/admin/progress` | HRD | ✅ |
| `/admin/periode`, `/admin/pemetaan` (tab: pemetaan · koreksi), `/admin/pertanyaan` | HRD | ✅ |
| `/admin/bobot` (tab: bobot · kalkulasi 360°) | HRD | ✅ |
| ~~`/home`~~, ~~`/admin/360`~~, ~~`/rekap`~~ | — | ❌ dihapus (jadi landing/tab) |
