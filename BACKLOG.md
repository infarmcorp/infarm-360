# BACKLOG — Infarm 360° Performance Appraisal System

Ide & **pengembangan opsional / masa depan** yang belum jadi komitmen ("nice-to-have", belum
dijadwalkan). Dipromosikan ke **[TODO.md](TODO.md)** bila diputuskan dikerjakan. Catatan historis
di **[CHANGELOG.md](CHANGELOG.md)**; panduan durable di **[CLAUDE.md](CLAUDE.md)**.

### Pengembangan opsional
- ⬜ Ganti email mandiri (lanjutan Akun Saya).
- ✅ **Ekspor Log Aktivitas HRD ke Excel — SELESAI (2026-07-16).** Kartu "Log Aktivitas HRD" di
  Ekspor Dataset (`exportHrdAuditLog`, lintas-periode, paginasi `.range()` utk >1000 baris; kolom
  waktu/pelaku/kategori/aksi/ringkasan/target/detail-meta, terbaru di atas).
- ✅ **Bulk-finalisasi laporan ber-ACC — SELESAI (2026-07-16).** Tombol "Finalisasi Semua Ber-ACC (N)"
  di Review Hasil Akhir (`bulkFinalizeAccepted`): finalisasi sekaligus laporan `spv_acc=true` &
  `in_review`; skor dihitung ulang per pegawai (skip bila KPI & 360° kosong), konfirmasi dialog +
  peringatan bila 360° perlu Hitung Ulang, audit `report.bulk_finalize`.
- ✅ **Log Aktivitas HRD — paginasi 10 baris di server** (2026-07-15, hemat egress) + filter kategori/
  cari di server; **Audit KPI** → daftar **rata terbaru-di-atas** (+ kolom Pegawai), bukan dikelompok nama.
- ✅ **Grant HRD Admin & Peninjau dibatasi ke divisi HRD** (2026-07-15, `isHrdDept` = dept diawali
  "HRD"): tombol grant disembunyikan + server menolak grant utk non-HRD; **pencabutan tetap boleh**.
- ✅ **Peran "Koordinator"** (diminta & **SELESAI 2026-07-12**, migrasi 0021 di live; **diperluas
  2026-07-15**). Pegawai yang membawahi beberapa pegawai (sebagian lain tetap langsung ke SPV) diberi
  akses ke Laporan Kinerja Tim untuk daftar pegawai **eksplisit**-nya. **Sejak 2026-07-15 koordinator
  BISA meng-ACC laporan** & **input KPI** (tab Input) pegawai naungannya; **SPV** hanya ACC/input KPI
  pegawai **tanpa** koordinator. **TIDAK** memengaruhi 360°. Lihat Changelog "Peran Koordinator".
  **Assignment awal (Q2 2026, di live):** Rochmat Arif Maulana → {Qurrotun Ayun, Reni Candra Sari};
  Widodo Hadi Kusumo → {Adistya Dwi Nurmayunita, Muhammad Fikar Nazary, Sitti Aisyatul Maufiroh,
  Vizcha Amalia Susanto Putri}.
  - **Peluang lanjutan (opsional):** relasi ini SUDAH tersirat sbg **"Atasan"** di `mappings` → bila kelak
    banyak koordinator, pertimbangkan menurunkan lingkup dari mapping Atasan (tanpa efek skor) agar HRD tak
    input dua kali. Untuk sekarang pakai daftar eksplisit `coordinator_team_members`.
- ✅ **"Peninjau Hasil Lintas Divisi" (grant `is_cross_reviewer`, migrasi 0018)** — **SELESAI
  (2026-06-30).** Pegawai (mis. divisi HRD) yang diberi izin dapat **meringkas Hasil Akhir 360°
  pegawai di SEMUA divisi KECUALI divisinya sendiri** (membantu HRD menulis Ringkasan Aspek tanpa
  melihat hasil rekan sedivisinya). Kewenangan: **lihat (L2 + komentar anonim) + tulis Ringkasan
  Aspek** — TANPA rilis/finalisasi/hitung-ulang (tetap milik HRD).
  - **Cara aman menghindari jebakan RLS:** kolom `is_cross_reviewer` **SENGAJA TIDAK** menyentuh
    `is_hrd()` → pemegang grant berposisi `employee` tetap pegawai biasa di level RLS (tak bisa baca
    L3 siapa pun, termasuk divisinya, lewat API). Akses lintas-divisi diberi **hanya** lewat server
    (`service_role`) di jalur `/peninjau` yang menegakkan **"divisi target ≠ divisi peninjau"**.
    Karena RLS menolak langsung, app-level scoping di sini = batas privasi **nyata** (bukan rasa aman
    palsu). L3 (komentar per-penilai bernama) tetap **dibuang** di loader.
  - **File:** migrasi `0018_employee_cross_reviewer.sql`; `lib/auth/roles.ts` `canCrossReview()`;
    `lib/report.ts` `loadCrossDivisionReport()`; `app/(app)/peninjau/` (`page.tsx`+`cross-table.tsx`,
    `[employeeId]/page.tsx`, `actions.ts` `saveCrossAspectSummaries`); grant UI di Kelola Pegawai
    (`setCrossReviewer` + badge/tombol "Peninjau"); menu base `app-shell.tsx` ("Review Lintas Divisi");
    `AspectSummaryEditor` dapat prop `saveAction`. Audit `employee.grant/revoke_cross_reviewer` &
    `crossreview.save_summary` (lewat `logAuditAsService`, pelaku non-HRD).
- ⬜ **Akses HRD granular penuh (per-bagian)** (diminta 2026-06-30, DITUNDA): grant HRD saat ini
  **semua-atau-tidak** (`is_hrd_admin` → `canAdmin()` penuh; lihat `lib/auth/roles.ts`). Permintaan
  (diskusi 2026-06-30): HRD ingin **memberi akses per-halaman berbeda per pegawai** (mis. A→{1,2,3},
  B→{4,5,6}), **bisa berubah sewaktu-waktu & tak harus runut**. **Kesimpulan diskusi: ini LAYAK & tak
  membuat app "terlalu dinamis"** — yang berubah adalah **data**, bukan kode (pola RBAC standar).
  - **Desain (granular ringan):** kolom `employees.hrd_sections text[]` (kosong=penuh, backward-
    compatible) + helper `canSection(actor, section)` dipakai di menu + guard halaman + Server Action.
    UI = **grid centang** per pegawai di Kelola Pegawai; bisa diubah kapan saja tanpa deploy. Kombinasi
    bebas per-user = sekadar baris data berbeda → murah.
  - **KUNCI agar tak liar:** katalog bagian **TETAP** (~11 nama baku: pegawai/periode/pemetaan/
    pertanyaan/bobot/progress/kepatuhan/laporan/dashboard/ekspor/log) — **bukan URL bebas**. Ini yang
    menjaga terkendali; "halaman apa saja" yang membuatnya rapuh, daftar-tetap-yang-dicentang tidak.
  - ⚠️ **PISAHKAN berdasarkan sensitivitas (wajib):** bagian **KONFIGURASI** (tak bocorkan data pribadi
    — pertanyaan/bobot/periode/pemetaan) → **app-level `canSection` CUKUP**. Bagian **DATA SENSITIF**
    (laporan/dashboard/ekspor/raw 360°) → app-only **TIDAK cukup**: bila pemegang grant tetap `is_hrd()`
    penuh, ia masih bisa baca **L3 mentah 360°** lewat API meski menu disembunyikan (rasa aman palsu).
    Untuk yang sensitif gunakan **pola Peninjau** (grant terpisah yang **TIDAK** menyalakan `is_hrd()`
    + akses via `service_role` berfilter / RLS-level). Jangan campur halaman sensitif ke daftar centang
    app-only. (RLS sulit mengekspresikan "daftar bagian arbitrer per-user" — itu satu-satunya bagian
    yang benar-benar mahal, hanya relevan untuk halaman sensitif.)
