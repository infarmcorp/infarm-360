# Audit Dokumentasi — rencana perapian & penggabungan .md

> File sementara (Tahap 1). Dihapus setelah Tahap 2 dicek. Branch: `docs/rapikan` (dari `dev`).
> Kondisi diaudit: 2026-10-12. Belum ada file .md lain yang diubah atau dihapus.

## 1. Inventaris (23 file, 5.978 baris)

Kolom "Dirujuk dari luar dokumentasi" adalah hasil grep di kode, `package.json`, `.github/`, `.claude/`,
`public/`, `supabase/`, `scripts/`, dan `.env.example`.

| # | Path | Baris | Audiens | Isi singkat | Dirujuk dari luar dokumentasi |
|---|------|------:|---------|-------------|-------------------------------|
| 1 | `CLAUDE.md` | 585 | Claude Code / dev | Pegangan teknis: status, peran, aktivasi, keputusan terkunci, design system, konvensi skor, pengujian, klasifikasi | ✅ komentar di `lib/backfill-guard.ts`, `dashboard-visual.tsx` (×3), migrasi `0021` |
| 2 | `README.md` | 105 | dev / publik GitHub | Ringkasan app, stack, cara jalan, peta dokumen | — (wajib ada di root) |
| 3 | `docs/perencanaan/STATUS.md` | 253 | dev | Potret status + riwayat sesi + file paling relevan | — |
| 4 | `docs/perencanaan/TODO.md` | 310 | dev + pemilik | Pekerjaan terbuka + banyak item ✅ bertanggal | — |
| 5 | `docs/perencanaan/BACKLOG.md` | 93 | dev + pemilik | Ide opsional + item ✅ + riwayat desain Peninjau/akses | — |
| 6 | `docs/perencanaan/REKOMENDASI.md` | 167 | HRD / pemilik | Persiapan demo/trial Q2, kapasitas, backup, checklist pasca-deadline | — |
| 7 | `docs/perencanaan/CHANGELOG.md` | 537 | dev | Invariant, alasan keputusan, daftar migrasi (tematik) | — |
| 8 | `docs/pengembangan/DEVELOPMENT.md` | 177 | dev | Alur branch & staging, migrasi, env per scope, checklist merge | ✅ `.env.example` baris 4 |
| 9 | `docs/pengembangan/DESAIN-MANAJEMEN-AKSES.md` | 420 | dev | Spesifikasi + riwayat desain Manajemen Akses (§1–§10) | ✅ migrasi `0032`, `0033` (komentar, "§10.5") |
| 10 | `docs/pengujian/TESTING-CHECKLIST.md` | 252 | penguji | Checklist uji manual per peran | — |
| 11 | `docs/pengujian/SMOKE-TEST.md` | 43 | penguji | Uji kilat pasca-deploy | — |
| 12 | `docs/panduan/CARA-PENGGUNAAN.md` | 1469 | pengguna (semua peran) | Panduan lengkap per peran + rumus + alur | — |
| 13 | `docs/panduan/RINCIAN-TOMBOL.md` | 406 | pengguna / HRD | Kamus tombol per halaman | — |
| 14 | `docs/panduan/CARA-BACKUP.md` | 135 | pengelola app | Backup manual, backup otomatis, restore | ✅ `.github/workflows/backup.yml` baris 11 |
| 15 | `docs/panduan/REVISI-PANDUAN-PDF.md` | 408 | penyunting PDF (HRD) | Teks siap tempel untuk merevisi 4 PDF | ✅ `lib/panduan.ts` baris 7; `public/panduan/README.md` |
| 16 | `docs/panduan/sop/README.md` | 25 | HRD | Daftar SOP | — |
| 17 | `docs/panduan/sop/SOP-PEGAWAI-BARU.md` | 101 | HRD | SOP pegawai baru | — |
| 18 | `docs/panduan/sop/SOP-PEGAWAI-KELUAR.md` | 89 | HRD | SOP pegawai keluar | — |
| 19 | `docs/panduan/sop/SOP-SIKLUS-PERIODE.md` | 117 | HRD | SOP satu periode | — |
| 20 | `docs/panduan/sop/SOP-AKSES.md` | 93 | HRD | SOP beri/cabut akses | — |
| 21 | `docs/panduan/sop/SOP-RESET-SANDI.md` | 87 | HRD | SOP reset sandi + aktivasi Lupa Sandi | — |
| 22 | `public/panduan/README.md` | 27 | dev / HRD | Aturan nama file PDF & cara memperbarui | — ⚠️ **ikut ter-publish** di `https://<domain>/panduan/README.md` |
| 23 | `scripts/loadtest/README.md` | 79 | dev | Uji beban k6 | — |

## 2. Keputusan per file

| File lama | Keputusan | Alasan |
|-----------|-----------|--------|
| `CLAUDE.md` | **Pertahankan, tulis ulang** (≤ 250 baris) | Wajib di root. Status, riwayat, runbook, dan tabel klasifikasi dipindah keluar |
| `README.md` | **Pertahankan, ringkas** (~60 baris) | Wajib di root. Peta dokumen diperbarui, angka tes dibetulkan |
| `STATUS.md`, `TODO.md`, `BACKLOG.md`, `REKOMENDASI.md` | **Gabung → `docs/RENCANA.md`**, lalu hapus | Tumpang-tindih besar. Item ✅ & riwayat sesi pindah ke CHANGELOG |
| `CHANGELOG.md` | **Pindah + tulis ulang → `docs/CHANGELOG.md`**, lalu hapus | Bahasa awam, urut tanggal. Detail teknis invariant pindah ke TEKNIS/CLAUDE |
| `DEVELOPMENT.md`, `TESTING-CHECKLIST.md`, `SMOKE-TEST.md`, `CARA-BACKUP.md`, `public/panduan/README.md`, `scripts/loadtest/README.md` | **Gabung → `docs/TEKNIS.md`**, lalu hapus | Semua dokumen operasional/teknis. Rujukan dari `.env.example` & `backup.yml` → lihat **Temuan Q1** |
| `DESAIN-MANAJEMEN-AKSES.md` | **Gabung → TEKNIS (model berlaku) + CHANGELOG (riwayat)**; nasib file → **Temuan Q2** | Dirujuk migrasi 0032/0033 (tak boleh diubah) |
| `CARA-PENGGUNAAN.md`, `RINCIAN-TOMBOL.md`, 6 file `sop/` | **Gabung → `docs/PANDUAN.md`**, lalu hapus | Isi berulang 2–3 kali (mis. siklus periode, sandi, akses). Dikelompokkan per peran |
| `REVISI-PANDUAN-PDF.md` | **Usul: pertahankan sementara di tempatnya** → **Temuan Q3** | Dirujuk `lib/panduan.ts`; berisi teks siap tempel ke Word, masih dipakai sampai PDF direvisi |

**Hasil:** 23 file → **6 file inti** (`CLAUDE.md`, `README.md`, `docs/RENCANA.md`, `docs/CHANGELOG.md`,
`docs/TEKNIS.md`, `docs/PANDUAN.md`) **+ maksimal 2 file bersyarat** (REVISI-PDF sementara; DESAIN bila Q2 = pertahankan).

Perkiraan baris: CLAUDE ~240 · README ~60 · RENCANA ~230 · CHANGELOG ~420 · TEKNIS ~560 · PANDUAN ~1.050
→ **~2.560 baris** (+408 REVISI sementara, +~80 bila DESAIN dipertahankan ringkas). Turun dari 5.978.

## 3. Struktur tiap file inti

### `CLAUDE.md` (≤ 250) — teknis, format "Selalu/Jangan … (lokasi) — alasan"
1. Apa ini & peran (Employee/SPV/HRD Admin/Direksi + Koordinator & grant halaman) — 25
2. Peta dokumen (6 file + bersyarat) — 10
3. Stack & struktur ringkas (top-level saja, rujuk kode) — 25
4. Keputusan arsitektur terkunci (Next.js/Server Action/RLS, no page-builder, kebijakan vs kelalaian + pengecualian modal Ad-Hoc) — 30
5. Keamanan & privasi (L1/L2/raw anonim/L3 dijelaskan sekali; SPV sedivisi; laporan diri tanpa raw; service_role) — 30
6. Invariant akses: izin HRD = grant, paritas SPV↔HRD Mode-SPV (titik sentuh), invariant `page_grants` (4 poin) — 30
7. Aturan skor terkunci (satu rumus, BR-07/09/10/11 dijelaskan sekali, potongan telat, invalidated, Direksi subjek terbatas, Q1 backfill guard, periode bisa dibuka ulang) — 40
8. Design System token (+ palet diskrit dashboard & pengecualian kontras chart — dirujuk `dashboard-visual.tsx`) — 30
9. Konvensi + pengujian (perintah, "salah diam-diam", PostgREST 1000 baris, verify:rls) — 25
10. Perintah — 10

### `docs/RENCANA.md` (~230) — bahasa awam
1. Status terkini (kondisi app, branch, yang di `dev` belum di `main`) — 30
2. Harus dikerjakan (hanya item ⬜/🔄, 🔑 ditandai) — 90
3. Ide opsional (backlog) — 40
4. Catatan operasional periode (brief pegawai, stagger, kapasitas, checklist pasca-deadline, pilihan penyimpanan) — 70

### `docs/CHANGELOG.md` (~420) — bahasa awam, urut tanggal terbaru di atas
1. Entri per tanggal/rilis (ringkas: apa berubah + alasan keputusan) — 330
2. Fitur yang dicabut (Punishment, N/A, Exposure Check, Ad-Hoc instan, Self, Peninjau, 9-Box tampilan, Beranda) — 30
3. Daftar migrasi 0001–0047 dalam kalimat biasa (tanpa nama kolom) — 60

### `docs/TEKNIS.md` (~560) — teknis
1. Alur branch, staging & migrasi (DEVELOPMENT §2–§5, §7) — 100
2. Env var lengkap + scope Vercel (termasuk yang belum tercatat — lihat Temuan T9) — 40
3. Aktivasi: email SMTP/Resend, Lupa Sandi, Mode Maintenance A–D — 80
4. Rumus skor & klasifikasi (Skor Akhir, 360° 4/2 kelas + BR-10, potongan telat, tabel 9-Box & 4-Box, trend KPI) — 70
5. Manajemen Akses: model data & enforcement (page_grants, izin 3 tingkat, lingkup, hrd_sections) — 50
6. Pengujian: Vitest (ringkas, rujuk `tests/`), verify:rls, smoke test, checklist manual, uji beban k6 — 140
7. Backup & restore (manual, otomatis terenkripsi, restore) — 60
8. PDF panduan (nama file, cara memperbarui, catatan folder `public/`) — 20

### `docs/PANDUAN.md` (~1.050) — bahasa awam, nama tombol persis seperti di app
1. Umum: login, Akun Saya, Tugas & Notifikasi, halaman Maintenance — 60
2. Pegawai: Daftar Penilaian Saya (+ Pengajuan), form penilaian, Laporan Hasil Saya — 120
3. SPV: Input KPI Anggota, Riwayat & Audit, Rekapitulasi, Laporan Kinerja Tim, Monitor — 90
4. Koordinator & akses dari HRD (halaman berlingkup) — 50
5. HRD Admin: per halaman (fungsi + tombol + dampak ke peran lain) — 420
6. Direksi — 40
7. Cara nilai dihitung + tabel "bila ada perubahan" — 70
8. Alur lengkap & siapa melihat apa — 60
9. SOP HRD: pegawai baru, keluar, satu periode, akses, reset sandi (checklist) — 140

## 4. Peta pemindahan

Legenda tujuan: **CL**=CLAUDE.md · **RD**=README · **RC**=RENCANA · **CG**=CHANGELOG · **TK**=TEKNIS · **PD**=PANDUAN.
"Buang" hanya untuk duplikat, riwayat yang sudah ada di CG, atau detail yang terbaca dari kode.
Kolom ✅ diisi saat Tahap 2.

### 4.1 `CLAUDE.md`
| Bagian / fakta | Tujuan | ✅ |
|---|---|---|
| "Sedang Dikerjakan (per 2026-10-12)" — kondisi, branch, gelombang Q3, status PDF, tersisa | RC §1–2 (status); daftar fitur Q3 → CG | ✅ |
| File paling relevan Q3 | CL §7 (inline di aturan terkait) — sisanya buang (terbaca dari kode) | ✅ |
| Apa Ini + 4 peran + blok "HRD = izin" + ATURAN PARITAS (titik sentuh) | CL §1, §6 | ✅ |
| Status as-is (stack, Supabase ref, 24 tabel, staging, shell, CI, backup, repo publik, login) | CL §3 (ringkas); ref & staging → TK §1 | ✅ |
| Sisa pra-produksi | RC §2 (duplikat TODO) | ✅ |
| Struktur Proyek (pohon rinci) | CL §3 ringkas top-level; rincian buang (terbaca dari kode) | ✅ |
| Dokumen Terpisah | CL §2 (peta dokumen baru) | ✅ |
| Aktivasi: Email SMTP/Resend, Lupa Sandi, Mode Maintenance A–D | TK §3 (runbook); CL §2 rujukan 1 baris | ✅ |
| Keputusan Arsitektur 1–3 + paritas legacy KPI komentar | CL §4 | ✅ |
| No page-builder (2026-06-30) | CL §4 (aturan); tanggal → CG | ✅ |
| INVARIANT page_grants (4 poin, ⚠️ is_hrd tampilan, finalisasi grant, Peninjau) | CL §6; model data → TK §5; riwayat → CG | ✅ |
| Kebijakan vs kelalaian + pengecualian modal Ad-Hoc 2026-08-21 | CL §4; tanggal → CG | ✅ |
| Design System token (brand, StatusChip, warna semantik, border/radius, Panel, font, Button/OverflowMenu, microcopy, kanvas) | CL §8 | ✅ |
| Tech Stack | CL §3 (duplikat sebagian, digabung) | ✅ |
| Deployment + daftar env var | TK §2 (lengkap); CL §3 rujukan | ✅ |
| Security Rules (+ blok DIUBAH 2026-07-15 & 2026-10-07) | CL §5 (aturan berlaku); riwayat → CG | ✅ |
| Konvensi: TS strict, istilah UI Indonesia, domain types | CL §9 | ✅ |
| Skor Akhir / Punishment dihapus / satu rumus / `displayedFinalOf` / `hasScoreDrift` | CL §7; riwayat → CG; penjabaran awam → PD §7 | ✅ |
| BR-10 bobot 2 kelas otomatis, `schemeFor`/`effectiveModel`, `AUTO_WEIGHT_FROM` | CL §7; tabel → TK §4 | ✅ |
| `invalidated` (0046), filter `status='submitted'`, Terkirim tak boleh dihapus | CL §7 | ✅ |
| Skor 360° resmi − potongan, AJUAN_PENALTY_FROM, waiver points, trigger first_submitted_at, cron nonaktif + cara aktifkan | CL §7 (aturan); cara aktifkan cron → TK §3 | ✅ |
| Klasifikasi Dashboard + 9-Box dihapus dari UI, rumus tetap | CL §7; tabel → TK §4 | ✅ |
| Pengujian (kenapa ada, cakupan per file tes, verify:rls 56) | CL §9 ringkas; rincian per file → buang (terbaca dari `tests/`), jumlah & verify:rls → TK §6 | ✅ |
| Klasifikasi Talenta (tabel 9-Box & 4-Box) | TK §4 — **dengan perbaikan Temuan T1** | ✅ |
| Perintah | CL §10 | ✅ |

### 4.2 `README.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Ringkasan, peran, stack, cara jalan, perintah, deployment, keamanan inti | RD (tetap, ringkas; angka tes 290 → 307) | ✅ |
| Mode Maintenance ringkas | RD 1 baris → rujuk TK §3 | ✅ |
| Tabel Dokumentasi | RD (diganti peta 6 file) | ✅ |

### 4.3 `STATUS.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Sedang Dikerjakan 2026-10-12 (kondisi, repo/branch, PDF, sesi 10-12) | RC §1 | ✅ |
| Sesi 2026-10-05..08, 10-01..02, 09-18..30, 08-06..09-10, 07-20, 07-16..18, 07-15, 07-10..12, 06-30..07-01, sebelumnya | CG (per tanggal); duplikat dengan CHANGELOG lama digabung | ✅ |
| Pengecualian Token Redesign (chart Dashboard & analitik Monitor jangan diubah) | CL §8 | ✅ |
| Gotcha paritas `team-table`/`scorecards` dipakai bersama Monitor | CL §8 | ✅ |
| ⚠️ JANGAN Hitung Ulang Q1 | CL §7 (sudah dijaga `backfill-guard`) | ✅ |
| PENDING HRD klik Hitung Ulang (2 desimal) | Buang — sudah tuntas (TODO: dijalankan 2026-07-16) | ✅ |
| `allow360Only` dibiarkan (#3) | Buang — parameter sudah tak ada di `finalScoreOf` (dicek kode) | ✅ |
| Berikutnya (rotasi, backup, Lupa Sandi, komunikasikan Rilis ke SPV, branch protection) | RC §2 | ✅ |
| File paling relevan | Buang (terbaca dari kode); yang penting masuk CL inline | ✅ |

### 4.4 `TODO.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Token Redesign (semua ✅) | CG 2026-08 & 2026-10-12; pengecualian → CL §8 | ✅ |
| Aktivasi Mode Maintenance A–C (⬜) | RC §2 (langkah → TK §3) | ✅ |
| Revisi 4 PDF (🔄) | RC §2 | ✅ |
| Cek migrasi 0036–0047 di production (🔑⬜) | RC §2 | ✅ |
| Screen 04 Review Penilaian (🔄) | RC §2 — lihat **Temuan Q4** | ✅ |
| Keamanan: sandi unik ✅, Akun Saya ✅, Lupa Sandi dorman, email asli ✅ | CG; aturan dorman → TK §3 | ✅ |
| Rotasi kredensial (🔑⬜, ditunda jam kerja) | RC §2 | ✅ |
| Backup: skrip ✅, otomatis ✅, sisa salin ke luar laptop (⬜) | RC §2 (sisa); CG (riwayat); TK §7 (cara) | ✅ |
| Hapus legacy ✅, audit npm xlsx ✅ + larangan `npm audit fix --force` | CG; **larangan → CL §9** | ✅ |
| Pengingat email ✅ + anti-spam multipart + solusi permanen opsional | CG; opsi domain/Resend → RC §3 | ✅ |
| Undangan & Info Akun (Opsi A sandi, filter gmail) | PD (perilaku); TK §2 (`ONBOARDING_GMAIL_ONLY`); CG | ✅ |
| Ekspor, deadline, heatmap, Review Direksi tanpa KPI, 4-Box single-axis, audit UX ✅ | CG | ✅ |
| Verifikasi visual Monitor/Dashboard & heatmap Q1 (🔑🔄) | RC §2 | ✅ |
| Manajemen Akses (Tahap 1/2 riwayat) | CG; model → TK §5 | ✅ |
| Laporan Hasil Saya lintas periode ✅, fix hitung kunci ✅ | CG | ✅ |
| Koreksi KPI langsung-DB (nama + nilai) | CG **tanpa nama pegawai** — lihat **Temuan Q5** | ✅ |
| Ringkasan Aspek otomatis Claude API (⬜, biaya, privasi) | RC §3 (ide); model ID diperbarui saat ditulis | ✅ |
| Seragamkan skor 360° Ekspor Rekap (⬜) | RC §2 | ✅ |
| Fix 1000 baris ✅ + pelajaran | CG; **pelajaran → CL §9** | ✅ |
| Backfill Q1 Looker ✅ | CG | ✅ |
| Cek pra-finalisasi #8–#18 | RC §2 (yang terbuka: #8, #9, #11, #13, #14); #16 dibetulkan (KPI kosong kini boleh bila 360° ada); #17 → CL §4; #18 → CG | ✅ |
| Tes unit / Server Action ✅ | TK §6 (jumlah 307/18) | ✅ |
| Branch protection (⬜) | RC §2 | ✅ |
| verify:rls ✅ | TK §6 | ✅ |
| Aksesibilitas — keputusan a11y tidak didorong ke pembaca layar | **CL §9** (larangan eksplisit) | ✅ |
| Audit kontras ✅ + pengecualian SVG chart | CL §8 (dirujuk `dashboard-visual.tsx`); CG | ✅ |

### 4.5 `BACKLOG.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Lint guard palet, tinjau chart berwarna, dark mode, ganti email mandiri | RC §3 | ✅ |
| Ekspor Log ✅, bulk-finalisasi ✅, paginasi log ✅, grant HRD dibatasi divisi HRD ✅ | CG; aturan divisi HRD → CL §6 & PD | ✅ |
| Peran Koordinator + assignment awal (nama) + peluang turunkan dari mapping Atasan | CG (tanpa nama); peluang → RC §3 | ✅ |
| Peninjau Lintas Divisi (desain awal, pensiun) | CG | ✅ |
| Akses HRD granular: Jalur A/B, pemisahan konfigurasi vs data sensitif | TK §5 (aturan); CG (riwayat); Jalur B sisa → RC §3 | ✅ |

### 4.6 `REKOMENDASI.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| §1 Status kesiapan (blank di HP = perangkat) | RC §4 (1 baris); sisanya CG | ✅ |
| §2a Brief pegawai | RC §4 (diperbarui: evidence ≥ 20 karakter, bukan 4) | ✅ |
| §2b Smoke test pegawai | TK §6 (digabung dengan SMOKE-TEST) | ✅ |
| §2c Tes kredensial 2–3 orang | RC §4 (pola untuk kirim massal berikutnya) | ✅ |
| §3 Stagger | RC §4 | ✅ |
| §4 Kapasitas Q2 + keputusan "komentar & esai wajib mutlak" | RC §4; keputusan → CL §4 | ✅ |
| §5 Penyimpanan & cadangan (bukan file lokal, pilihan Pro/VPS) | RC §4 ringkas; cara → TK §7 | ✅ |
| §6 Checklist pasca-deadline | PD §9 (SOP periode, duplikat digabung) | ✅ |
| §7 Reset trial Q1 V2 | CG 2026-06-23 | ✅ |
| §8 Item operasional (demo, stagger, unduh .enc tiap kuartal, rotasi, Pro opsional) | RC §2/§4 | ✅ |

### 4.7 `CHANGELOG.md` (lama)
| Bagian | Tujuan | ✅ |
|---|---|---|
| Invariant & fitur inti (±30 entri) | CG (riwayat + alasan, bahasa awam); aturan berlaku → CL §5–§7; detail teknis → TK | ✅ |
| Fitur pendukung | CG | ✅ |
| Skema DB 0005–0047 | CG §3 (awam) + **tambah 0001–0004** (belum tercatat) | ✅ |
| Infra/Testing/CI (1000 baris, tes, verify:rls, backup, repo publik, skrip, backfill Q1) | CG; aturan → CL §9; skrip → TK | ✅ |

### 4.8 `DEVELOPMENT.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| §1–§5 (alasan pisah, branch, 2 Supabase, migrasi Jalur A/B, urutan aditif vs destruktif, konflik nomor) | TK §1 | ✅ |
| §6 env per scope + Mode Maintenance | TK §2–§3 | ✅ |
| §7 checklist merge | TK §1 | ✅ |
| "Kondisi per 2026-10-12" (3 branch, feature/review-penilaian ditunda) | RC §1 (sudah basi: branch itu kini tercakup `dev`) | ✅ |

### 4.9 `DESAIN-MANAJEMEN-AKSES.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| §1–§3, §6 (tujuan, augment-bukan-replace, keamanan nyata) | TK §5 | ✅ |
| §4–§5, §7–§8, §9, §10.1–10.4 (usulan, pentahapan, mockup, diagram lama) | CG (ringkas: keputusan + tanggal); diagram lama buang (historis, ditandai sendiri sebagai usang) | ✅ |
| §9.2 keputusan mengikat (Supervisor=SPV, koordinator per-tim, multi-lingkup, peringatan izin ke peran luas, pegawai baru tak otomatis) | TK §5 + PD (perilaku) | ✅ |
| §10.5 izin 3 tingkat + titik penegakan | TK §5 (+ file dipertahankan bila Q2) | ✅ |
| §10.6 alur penerima-dulu (diagram terbangun) | PD §5 (diagram Manajemen Akses) | ✅ |
| Pertanyaan terbuka §8 (field jabatan spesifik) | RC §3 | ✅ |

### 4.10 `TESTING-CHECKLIST.md` & `SMOKE-TEST.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Semua bagian 0–15 | TK §6 — **disesuaikan aturan berlaku** (Temuan T11) | ✅ |
| SMOKE-TEST A–E + aturan gagal | TK §6 (digabung dengan REKOMENDASI §2b) | ✅ |
| §15 aktivasi produksi | RC §2 (yang belum) / TK §3 (cara) | ✅ |

### 4.11 `CARA-PENGGUNAAN.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Pembuka "Diperbarui …" | CG | ✅ |
| Login, Akun Saya, Tugas & Notifikasi, Maintenance, keyboard | PD §1 (+ perbaikan Temuan T2) | ✅ |
| Employee: Daftar Penilaian, form, Pengajuan, Laporan Hasil Saya | PD §2 | ✅ |
| Akses Khusus Review berlingkup | PD §4 | ✅ |
| SPV: Input KPI, Riwayat, Rekap, Laporan Kinerja Tim, Monitor | PD §3 | ✅ |
| Koordinator | PD §4 | ✅ |
| HRD: Kelola Pegawai, Manajemen Akses, Periode, Pertanyaan, Ekspor, Bobot, Monitoring & Audit KPI, Log, Suksesi, Review & Finalisasi, Pemetaan, Progress, Sandi & Onboarding, Kepatuhan, Monitor/Dashboard, Struktur | PD §5 (+ perbaikan T3, T4; tambah Ekspor "Bahan Laporan per Pegawai") | ✅ |
| Direksi | PD §6 | ✅ |
| Bagaimana Nilai Dihitung (§1–§5 + 2 bagan) | PD §7 | ✅ |
| Alur Lengkap (bagan Tahap 0–7, ceklis, dua saklar, transisi status, empat lapis) | PD §8; ceklis digabung dengan SOP periode | ✅ |
| Rincian Fitur HRD & Dampaknya §1–§12 + rantai dampak | PD §5 (digabung per halaman — kini duplikat dengan bagian HRD di atas) | ✅ |

### 4.12 `RINCIAN-TOMBOL.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Tiap tabel tombol per halaman | PD — tabel tombol ditempel di bawah halaman masing-masing, kolom **Tombol · Fungsi · Siapa · Kapan muncul · Konfirmasi**; nama fungsi kode (`setSpvAcc` dst.) dibuang (sudah di kode) | ✅ |
| "Cara membaca" | PD pembuka | ✅ |

### 4.13 SOP (README + 5 SOP)
| Bagian | Tujuan | ✅ |
|---|---|---|
| Prinsip SOP (kebijakan, bukan tambal kelalaian) | PD §9 pembuka | ✅ |
| SOP Pegawai Baru (A–E, cabang, jebakan, checklist, diagram) | PD §9.1 | ✅ |
| SOP Pegawai Keluar | PD §9.2 | ✅ |
| SOP Siklus Periode (+ urutan baku) | PD §9.3 — digabung dengan "Ceklis HRD" CARA-PENGGUNAAN (duplikat) | ✅ |
| SOP Akses | PD §9.4 (+ perbaikan T6) | ✅ |
| SOP Reset Sandi (tabel keputusan, jebakan) | PD §9.5; aktivasi Lupa Sandi → TK §3 (duplikat CLAUDE.md) | ✅ |

### 4.14 `CARA-BACKUP.md`, `public/panduan/README.md`, `scripts/loadtest/README.md`
| Bagian | Tujuan | ✅ |
|---|---|---|
| Backup manual, 3-2-1, kapan, otomatis + secret, dekripsi, JSON→Excel, restore + perilaku upsert | TK §7 | ✅ |
| Nama file PDF per peran, lampiran, akses publik, cara memperbarui, .docx tak di repo | TK §8 | ✅ |
| Load test: jangan ke production, staging, k6, langkah, membaca hasil | TK §6 (migrasi "0001–0013" dibetulkan jadi "semua") | ✅ |

## 5. Temuan

### 5a. Dokumen bertentangan dengan kode — usul saya: ikuti kode (mohon dikonfirmasi)
| # | Dokumen menyebut | Kode sebenarnya | Bukti |
|---|---|---|---|
| T1 | CLAUDE.md "Klasifikasi": kuartal tanpa 360° → 4-Box "kategori A Player nonaktif"; SOP-SIKLUS: "4-Box hanya B-KPI/C yang mungkin" | Satu sumbu kosong → **HRD Review** (BR-11). Tanpa 360° = semua pegawai ber-KPI jadi HRD Review | `lib/scoring.ts:64` |
| T2 | CARA-PENGGUNAAN: sisa hari di sidebar menuju **tanggal selesai periode (bukan Deadline 360°)** | Menuju **Deadline 360°**, jika kosong baru tanggal selesai periode (REVISI-PDF §6 sudah benar) | `app/(app)/layout.tsx:33-35` |
| T3 | Log Aktivitas HRD: "500 entri terbaru" & "filter klien" (CARA, RINCIAN); "10 baris/hal" (CHANGELOG, BACKLOG). Log Manajemen Akses "10/hal". Riwayat & Audit KPI "10 baris" (RINCIAN, REVISI-PDF) | Semua **5 baris per halaman**, dicari di server | `admin/audit/page.tsx:16`, `admin/akses/page.tsx:9`, `kpi/riwayat-view.tsx:8` |
| T4 | CARA-PENGGUNAAN & RINCIAN: hapus pemetaan yang sudah dinilai → konfirmasi → penilaiannya ikut terhapus + skor dihitung ulang | Terkirim **tak bisa dihapus** ("Gunakan Batalkan Validitas"); hapus hanya Belum Mulai/Draft + **alasan wajib**; ada **Periksa Validitas → Batalkan/Pulihkan** (belum ada di CARA & RINCIAN) | `admin/pemetaan/actions.ts:234-243` |
| T5 | Jumlah tes: "290 tes / 17 file" (README, TODO, CHANGELOG), "55 tes" & verify:rls "21/21" (TESTING-CHECKLIST) | **307 tes / 18 file**; verify:rls **56** pemeriksaan (CLAUDE.md sudah benar) | `npx vitest list` |
| T6 | SOP-AKSES & CARA §11: "Atur Akses" = **hanya tampilan menu, bukan gembok data** | Sejak 0045: **perubahan data** dibatasi di DB per bagian (`hrd_can`); **melihat** data tetap penuh. CARA "Lapis B" sudah menulis ini → dua bagian CARA saling bertentangan | `0045_server_leak_hardening.sql` (31× `hrd_can`) |
| T7 | Ekspor (CARA, RINCIAN): 5 kartu, tanpa "Bahan Laporan per Pegawai" | Ada kartu ke-6 **Bahan Laporan per Pegawai** (3 lembar: Skor · Komentar Aspek · Komentar Esai, anonim, tanpa Self) | `admin/ekspor/ekspor-client.tsx:116` |
| T8 | TODO #16: finalisasi ditolak bila KPI kosong; STATUS/TODO: `finalScoreOf(..., allow360Only)` | KPI kosong + 360° ada → Skor Akhir = 360° (semua halaman); parameter `allow360Only` sudah tidak ada | `lib/scoring.ts:146` |
| T9 | Daftar env var di CLAUDE.md belum lengkap | Kode juga membaca `SMTP_HOST`, `SMTP_PORT` (default smtp.gmail.com:465), `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL` (tautan email), `SUPABASE_DB_URL` (skrip & secret GitHub), `BACKUP_PASSPHRASE` (secret), `VERCEL_ENV`/`VERCEL_PROJECT_PRODUCTION_URL` (otomatis) | grep `process.env` |
| T10 | CHANGELOG daftar migrasi mulai 0005 | 0003 (tabel punishment, kini dorman) & 0004 (sifat Wajib/Opsional) tak tercatat | `supabase/migrations/` |
| T11 | TESTING-CHECKLIST masih menguji aturan lama: Ad-Hoc instan, Self-assessment, komentar ≥ 4 karakter, grant HRD di Kelola Pegawai, baris "Anda" di Laporan Kinerja Tim, "SPV tak pernah lihat raw" (kini raw **anonim** boleh) | Aturan berlaku sesuai CLAUDE.md & kode | — |

### 5b. Pertanyaan yang butuh keputusan Anda
- **Q1 — Rujukan dari file non-.md.** `.env.example` (→ DEVELOPMENT.md) dan `.github/workflows/backup.yml`
  (→ CARA-BACKUP.md) hanya berupa **komentar**. Usul: **Anda izinkan saya mengubah 2 komentar itu**
  ke `docs/TEKNIS.md`. Alternatif: pertahankan 2 file lama sebagai stub 3 baris "pindah ke TEKNIS.md".
- **Q2 — `DESAIN-MANAJEMEN-AKSES.md` dirujuk migrasi 0032/0033** (tak boleh diubah). Pilihan:
  (a) pertahankan file, ringkas jadi ~80 baris (keputusan §10.5 + konteks); (b) hapus, biarkan komentar
  migrasi menunjuk file yang hanya ada di riwayat git. Usul: **(a)**.
- **Q3 — `REVISI-PANDUAN-PDF.md`** (408 baris, teks siap tempel ke Word, dirujuk `lib/panduan.ts`).
  Pilihan: (a) pertahankan sementara di tempatnya, hapus setelah PDF direvisi; (b) jadikan bagian
  PANDUAN.md (perlu izin ubah komentar `lib/panduan.ts`). Usul: **(a)**, sekaligus perbaiki T3 (10→5 baris)
  di teksnya.
- **Q4 — Screen 04 "Review Penilaian"** sudah ada di `dev`, belum di `main`/production. Ditulis di
  PANDUAN sekarang (dengan catatan "mulai rilis berikutnya"), atau baru setelah merge? Usul: tulis di
  RENCANA saja, PANDUAN tetap menggambarkan perilaku production.
- **Q5 — Data pribadi di repo publik.** File lama memuat nama pegawai & nilai (koreksi KPI, contoh skor
  salah, kode pegawai FT2026-0xx, daftar anggota koordinator, nama SPV) dan alamat Gmail pengirim SMTP.
  Usul: **tidak dibawa** ke file baru (ditulis "6 nilai KPI dikoreksi", "1 pegawai"). Catatan: isinya
  tetap ada di riwayat git.
- **Q6 — Status PDF di CLAUDE.md & brief Anda** menyebut 4 PDF + `PANDUAN_VERSION` "belum di-commit".
  `git status` bersih dan STATUS.md mencatat sudah ter-commit di `f58d6b4`. Saya tulis "sudah di-commit
  di `dev`, isi belum direvisi" — benar?
- **Q7 — Panjang PANDUAN.md (~1.050 baris).** Tetap satu file (sesuai target), atau dipecah jadi 2
  (Pengguna umum vs HRD)? Usul: satu file dengan daftar isi per peran.
- **Q8 — `public/panduan/README.md` ikut ter-publish** di domain app. Usul: hapus setelah isinya pindah
  ke TEKNIS (folder `public/` jadi hanya berisi PDF).

## 6. Hasil verifikasi Tahap 2 (2026-10-12)

- Semua baris peta pemindahan §4 ditandai ✅ (dicek saat menulis tiap file inti).
- **Penyimpangan dari rencana:**
  - Daftar migrasi 0001–0047 ditaruh di **TEKNIS §6**, bukan CHANGELOG §3, karena CHANGELOG wajib bebas nomor
    migrasi. CHANGELOG hanya menyebut "perubahan database" dalam kalimat biasa.
  - Panjang aktual: CLAUDE 195 · README 60 · RENCANA 146 · CHANGELOG 288 · TEKNIS ~587 · PANDUAN 1.027 ·
    DESAIN 57 · REVISI-PDF 411 (sementara).
- **Temuan baru T12:** `getTalentQuarterKey()` disebut di CLAUDE.md lama, tetapi tidak ada di kode. Klasifikasi
  dikunci ke satu kuartal lewat filter periode Dashboard. Sudah dibetulkan di CLAUDE.md & TEKNIS §4.5.
- Grep kelengkapan di file inti: semua env var (22) ✅ · migrasi 0001–0047 ✅ · helper skor/akses (37) ✅ ·
  route `app/(app)/*` & `admin/*` ✅ · aturan terkunci (page-builder, paritas, kebijakan vs kelalaian, BR-10,
  ajuan, invalidated, 9-Box, tanpa D, npm audit, Q1, buka kembali periode, 1000 baris) ✅.
- PANDUAN/RENCANA/CHANGELOG bebas istilah `RLS`, `service_role`, `migrasi`, `lib/`, `app/` ✅.
- Tautan antar-.md: tidak ada yang rusak ✅. Tidak ada rujukan kode ke file yang dihapus ✅.
- Tidak ada nama pegawai, kode pegawai, atau alamat email pribadi di file baru ✅.
