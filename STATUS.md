# STATUS — Infarm 360° Performance Appraisal System

Potret status & catatan sesi (cepat-basi — perbarui tiap sesi). Panduan tahan-lama ada di
**CLAUDE.md**; rincian tiap fitur di **Changelog** (CLAUDE.md); sisa pekerjaan di **TO-DO & Backlog**
(CLAUDE.md); catatan operasional trial/Q2 di **REKOMENDASI.md**.

## Sedang Dikerjakan (per 2026-07-12)

**Fokus aktif:** peningkatan dashboard & pelaporan (tanggal aktif, trend, scorecard, 2-desimal).
Migrasi fungsional **selesai & live**; sisa sebagian besar **aktivasi env** (email/sandi) + **kebersihan akun**.

**Status repo: BERSIH — semua pekerjaan sesi 2026-07-10..12 sudah PUSHED ke `main` & live (commit `9266b34`).**
Bagian ini hanya potret status; perincian tiap fitur ada di **Changelog** & **TO-DO** di CLAUDE.md.

- **Peran Koordinator (2026-07-12, migrasi 0021 diterapkan ke live + di-push):** pegawai (role=employee)
  ber-grant `is_coordinator` lihat-saja "Laporan Kinerja Tim" untuk daftar eksplisit `coordinator_team_members`
  (pola Peninjau: grant non-RLS, akses service_role berlingkup, L3 dibuang; tanpa KPI/ACC/efek 360°). UI grant +
  dialog "Tim Koordinasi" di Kelola Pegawai. Assignment awal (live): Arif→{Qurrotun,Reni}; Widodo→{Adistya,
  Fikar,Sitti Aisyatul,Vizcha}. Detail: [[coordinator-access]] / Changelog "Peran Koordinator".

- **Sesi 2026-07-10 → 2026-07-12 (SEMUA sudah push & live — commit `9266b34`):**
  - **Tanggal aktif pegawai** (`joined_on`/`left_on`, migrasi **0020**, sudah diterapkan ke DB live) +
    kolom "Masa Aktif" di Kelola Pegawai; **Dashboard keanggotaan HIBRIDA** sadar-periode.
  - **Trend KPI seragam** (`lib/trend.ts`) di Laporan Kinerja Tim / Monitor / Dashboard; **"KPI belum
    terbaca"** (unread) dikecualikan seragam dari rerata/kategorisasi (baris tetap tampil, 360° tetap dihitung).
  - **Scorecard + metrik tim bersama** (`lib/team-metrics.ts`); **Monitor** dirombak jadi dashboard SPV
    (scorecard + tabel + filter periode + 3 grafik tren; tanpa tinjau/Status/ACC; sertakan baris SPV sendiri).
  - **Label Skor Akhir `(live)` vs `(tersimpan)`** (Monitor/Dashboard = live; Laporan Kinerja Tim = finalisasi).
  - **Skor 360° per-aspek TERBOBOT** (dashboard + laporan per-pegawai) + **presisi 2 desimal**
    (`round1`→`round2`); dashboard 360 tambah heatmap Divisi×Aspek, donut, scorecard tertinggi/terendah.
  - ⚠️ **PENDING aksi HRD:** klik **"Hitung Ulang Skor 360°"** agar `result_360` tersimpan jadi 2 desimal.
  - **Belum diperbarui:** item **#3 `allow360Only`** (Monitor `true` vs Dashboard `false`) sengaja dibiarkan.
  - Skrip diagnostik read-only baru: `scripts/check-unread.mjs` (daftar pegawai "KPI belum terbaca").

- **Sesi 2026-06-30 → 2026-07-01 (SEMUA sudah push & live):**
  - **Peninjau Hasil Lintas Divisi** (grant `is_cross_reviewer`, migrasi 0018) — commit `0043678`.
  - **Opsi B pelaporan:** halaman **pelaporan** (Dashboard/Rekap/Monitor/Laporan-Tim/Review Hasil
    Akhir) tampilkan pegawai **aktif ATAU punya data di periode** (bukan `is_active` keras) → hasil
    kuartal pegawai resign akhir-periode tak hilang. Halaman **flag/siklus** (Kepatuhan/Progress/
    Penilaian/input-KPI) tetap **hanya aktif**. `setEmployeeActive` ikut toggle `mappings.is_active`.
  - **Minta Koreksi relasi untuk target Ad-Hoc** (buka UI-gate `penilaian/page.tsx`) — commit `0043678`.
  - **Hapus Matriks 9-Box dari dashboard** (4-Box **tetap**; `talentBoxOf`/tes di `lib/scoring.ts`
    **tetap**) + **radar aspek bernomor** (`report-doc.tsx`) + **F2/F4/F5** pengerasan nonaktif +
    **F3** badge "nonaktif" (dashboard tetap **per-periode**, anti survivorship bias) — commit `fb66d1a`.
  - **Pegawai nonaktif diblokir dari pemetaan** (import/create/bulk/copy) + guard `sendOnboarding`;
    nonaktif tak menerima undangan/pengingat — commit `a756cf5`.
  - **Ekspor 360° gabungan 1 file (2 sheet)** + **Ekspor Ringkasan Aspek Naratif** — commit `85408ad`.
  - **Tutup/Buka Form** (migrasi 0017 `form_open`), filter periode Monitoring ke Riwayat & Audit,
    **Hapus Periode**, lampiran panduan PDF per peran di email undangan (+ `/panduan` publik),
    fix `deleteMapping` rekonsiliasi `result_360` — commit `17e7f13`/`3627c55`/`597b4df`/`8e5f134` dst.
  - **Data trial:** 6 akun uji dihapus permanen via `scripts/delete-people.mjs` (commit `908a661`);
    backup pra-aksi di `backups/`.
  - **Keputusan terkunci (2026-06-30): TIDAK ada "page-builder" untuk HRD** (lihat Keputusan terkunci).

- **Riwayat sesi sebelumnya (ringkas — detail lengkap di Changelog):**
  - **2026-06-24:** penilai eksternal (`is_external`, migrasi 0016); fix dropdown nama login HP
    (`220f90d`); hapus Ad-Hoc + semua pemetaan **selalu wajib** + landing base → `/penilaian`
    (`f6e25f6`); UX form HP (gulir + reset zoom, `df017a1`).
  - **2026-06-23:** pengerasan form "Mulai Nilai" (auto-simpan draf, konfirmasi kirim, layar sukses,
    **esai wajib**, rating terbaca, rail responsif); banner Garis Hubungan; **REKOMENDASI.md**.
  - **Sesi lama:** alur visibilitas laporan bertahap (`draft→in_review→finalized`, migrasi 0011/0012);
    grant HRD (`is_hrd_admin`, migrasi 0013) + `canAdmin()`; jaring regresi L3 (`verify:rls` 21 assertion);
    heatmap KPI/divisi; palet warna skor terpadu (`lib/score-color.ts`); paritas SPV↔HRD-mode-SPV.
  - **Keputusan terkunci:** semua komentar (min 4 char) + semua esai **WAJIB** (kebijakan mutlak).

- **App sudah LIVE & berjalan (2026-07-01):** Undangan Massal terkirim → sandi unik per orang (✅).
- **Berikutnya (butuh aksi pengguna 🔑):** **rotasi `SUPABASE_SERVICE_ROLE_KEY`** (bila pernah
  ter-share saat dev); **backup rutin ke luar laptop**; (opsional) aktifkan Lupa Sandi via email untuk
  akun beremail asli. **Komunikasikan ke HRD** langkah "Rilis ke SPV".
- **Berikutnya (bisa digarap langsung):** branch protection GitHub (PR butuh CI hijau); tes Server
  Action (finalisasi/`releaseToSpv`/`setHrdAdmin`/ACC). Lihat **TO-DO & Backlog** di CLAUDE.md.

**File paling relevan:**
- Peninjau lintas divisi: `app/(app)/peninjau/`, `lib/report.ts` (`loadCrossDivisionReport`), `lib/auth/roles.ts` (`canCrossReview`)
- Laporan & visibilitas: `lib/report.ts` (`loadReport`/`loadTeamReportForSpv`/`loadTeamReportForHrdSpv`),
  `app/(app)/laporan/`, `app/(app)/laporan-tim/`, `app/(app)/admin/laporan/` · RLS: migrasi 0012
- Dashboard: `app/(app)/admin/dashboard/` (`page.tsx` + `dashboard-visual.tsx`)
- Laporan Kinerja Tim & Monitor: `app/(app)/laporan-tim/` (`team-table.tsx`/`scorecards.tsx`),
  `app/(app)/monitor/` (`page.tsx`/`monitor-trends.tsx`/`period-filter.tsx`), `lib/team-metrics.ts`, `lib/trend.ts`
- Tanggal aktif pegawai: `app/(app)/admin/pegawai/` (`actions.ts`/`page.tsx`/`pegawai-client.tsx`), migrasi 0020
- Ekspor: `app/(app)/admin/ekspor/` (`actions.ts` + `ekspor-client.tsx`)
- Skor & tes: `lib/scoring.ts`, `lib/score360.ts`, `tests/`, `scripts/verify-rls.ts`, `.github/workflows/ci.yml`
- Izin/sesi: `lib/auth/roles.ts` (`canAdmin`), `app/(app)/layout.tsx`, `app/(app)/app-shell.tsx`, `app/login/`
- Email: `lib/email/mailer.ts`, `app/(app)/admin/progress/actions.ts` · Skema/RLS: `supabase/migrations/`
