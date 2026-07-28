# RINCIAN TOMBOL — Infarm 360° Performance Appraisal

Kamus lengkap **setiap tombol/aksi di semua halaman**, diambil langsung dari kode (akurat per 2026-06-27).
Pelengkap [CARA-PENGGUNAAN.md](CARA-PENGGUNAAN.md). Untuk tiap tombol: **Fungsi · Peran · Kondisi (kapan muncul/nonaktif) · Konfirmasi**.

## Cara membaca

- **Peran:** Pegawai · SPV · HRD Admin · Direksi. "HRD mode-SPV" = pemegang izin HRD yang sedang di **Mode SPV** (perlakuan identik SPV biasa). "Mode Admin" = HRD mengoperasikan sistem.
- **Mode ganda HRD:** tombol **HRD Admin ↔ Mode SPV/Pegawai** di sidebar (hanya bila punya izin HRD). Default login = mode base (posisi asli).
- **Konfirmasi:** "ConfirmDialog" = modal dalam aplikasi; "inline" = konfirmasi di tempat; "—"/"Tidak" = aksi langsung.
- Hampir semua aksi tulis **butuh periode `status='active'`** dan diproteksi RLS + `canAdmin()` di server.

## Daftar Isi
1. [Umum (Login, Sandi, Akun, Sidebar)](#1-umum)
2. [Pegawai (Penilaian & Laporan)](#2-pegawai)
3. [SPV / HRD mode-SPV (KPI, Laporan Tim, Monitor)](#3-spv--hrd-mode-spv)
4. [HRD Admin](#4-hrd-admin)
5. [Direksi](#5-direksi)

---

## 1. UMUM

### Halaman Masuk / Login (`/login`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Masuk** | `signInWithPassword`. Sukses → reset cookie `hrd_mode` (ke base) → ke tujuan (`next` non-admin, selain itu `/`). | Semua | Nonaktif saat loading; tolak bila nama/email kosong | — |
| **Masuk dengan email manual / ← Pilih dari daftar** | Toggle antara input email manual & combobox peran+nama | Semua | — | — |
| **Lupa sandi?** | Link ke `/auth/lupa-sandi` | Semua | Hanya bila `NEXT_PUBLIC_ENABLE_PW_RESET='true'`; jika mati → teks statis "Hubungi HRD" | — |

### Lupa Sandi (`/auth/lupa-sandi`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Kirim Tautan Reset** | `resetPasswordForEmail` (redirect ke `/auth/callback`). Sukses → pesan netral | Semua | Halaman aktif hanya bila flag reset 'true'; nonaktif saat loading | — |
| **← Kembali ke Masuk** | Link ke `/login` | Semua | Selalu | — |

### Perbarui / Buat Sandi Baru (`/auth/perbarui-sandi`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Simpan Sandi Baru** | Validasi (min 8, cocok) → `updateUser({password})` → alihkan ke `/` | Semua (sesi dari tautan reset) | Nonaktif saat loading | — |
| **Minta Tautan Baru** | Link ke `/auth/lupa-sandi` | Semua | Hanya bila tak ada sesi (tautan kedaluwarsa) | — |

### Akun Saya (`/akun`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Simpan Sandi Baru** | `changeOwnPassword` (verifikasi sandi lama → update) | Semua | Nonaktif saat busy; validasi klien | — |
| **← Beranda** | Link ke `/` | Semua | Selalu | — |
| *Ikon mata pada field sandi* | Lihat/sembunyikan tulisan sandi | Semua | Pada semua input sandi (login, akun, perbarui) | — |

### Sidebar / Shell aplikasi

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **HRD Admin** (toggle) | Set cookie `hrd_mode='admin'` → tampilkan Menu Administrator | Pemegang izin HRD | Hanya bila `canAdmin` | — |
| **Mode SPV / Mode Pegawai** (toggle) | Set `hrd_mode='spv'` (mode base) | Pemegang izin HRD | Hanya bila `canAdmin` | — |
| **Item Tugas & Notifikasi** | Navigasi ke halaman terkait | Sesuai sumber notifikasi | Bila ada todo | — |
| **Item navigasi** (Daftar Penilaian, Laporan Hasil Saya, Input KPI, Laporan Kinerja Tim, Monitor, Kelola Pegawai/Periode/Pemetaan/Pertanyaan, Bobot, Progress 360, Flag Kepatuhan, Review Hasil Akhir, Promosi & Suksesi, Dashboard, Monitoring & Audit KPI, Log Aktivitas, Ekspor) | Navigasi antar-halaman | Sesuai peran & mode (base/admin/eksekutif) | Muncul per peran (lihat tabel detail di kode) | — |
| **Akun Saya** | Link ke `/akun` | Semua | Selalu (footer) | — |
| **Keluar** | Signout (akhiri sesi) | Semua | Selalu (footer) | — |
| **Hamburger / overlay** (mobile) | Buka/tutup drawer sidebar | Semua | Hanya mobile | — |

---

## 2. PEGAWAI

### Daftar Penilaian Saya (`/penilaian`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **← Beranda** | Link ke `/` | Semua penilai | Selalu | — |
| **Tambahkan Rekan** (Ad-Hoc) | `addAdhocTarget` → buat mapping Cross opsional (`is_adhoc`) | Semua penilai | Nonaktif bila target kosong/pending; hanya saat periode aktif & `has_360` | — |
| **Hapus** (baris ad-hoc) | `removeAdhocTarget` → hapus mapping ad-hoc + draf | Pemilik baris ad-hoc | Hanya baris ad-hoc; **nonaktif bila sudah `submitted`** | **Ya** — `window.confirm` "Hapus penilaian ad-hoc…?" |
| **Minta Koreksi** | Buka modal koreksi garis hubungan | Pemilik baris | Hanya non-Self & non-adhoc; jadi badge "Koreksi diajukan" bila sudah pending | Membuka modal |
| **Mulai Nilai / Lanjutkan / Edit** | Link ke `/penilaian/{targetId}` (label adaptif per status) | Pemilik baris | Selalu | — |

> Empty-state bila tak ada periode aktif atau `has_360=false` ("Penilaian 360° belum dibuka").

### Modal "Minta Koreksi"

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Kirim Pengajuan** | `requestCorrection` → ajukan koreksi relasi (status `pending`) | Pemilik mapping | Nonaktif saat busy; alasan min 5 karakter (server) | — (submit; error inline) |
| **Batal / ✕ / overlay** | Tutup modal | — | Nonaktif saat busy | — |

### Form "Mulai Nilai" (`/penilaian/[targetId]`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **← Daftar** | Link ke `/penilaian` | Penilai ditugaskan | Selalu | — |
| **Panduan Penilaian Umum** | Buka/tutup panduan statis | Penilai | Selalu | — |
| **Rail aspek / chip indikator** | Pindah aspek/indikator | Penilai | Per aspek/indikator | — |
| **Tombol rating 1–5** | Set rating indikator aktif | Penilai | Selalu di editor | — |
| **✕ (bersihkan jawaban)** | Reset rating+komentar indikator aktif | Penilai | Bila indikator terisi | — |
| **Sebelumnya** | Indikator sebelumnya | Penilai | Nonaktif bila indikator pertama | — |
| **Selanjutnya / Ke Umpan Balik Kualitatif** | Indikator berikut; dari terakhir → lompat ke esai | Penilai | Nonaktif bila indikator terakhir & tak ada esai | — |
| **Batal** | Keluar tanpa simpan manual (`/penilaian`) | Penilai | Nonaktif saat busy | — |
| **Buang Draf** | `discardAssessment` → hapus draf | Penilai | Hanya bila ada draf | **Ya** — ConfirmDialog "Buang draf penilaian?" |
| **Simpan Draf** | `submitAssessment(status:'draft')` (selain autosave 5 detik) | Penilai | Nonaktif saat busy | — |
| **Lengkapi Penilaian (N tersisa) / Kirim Penilaian 360°** | Adaptif: kuning = memandu ke yang kurang; hijau = validasi → konfirmasi kirim | Penilai | Nonaktif saat busy/sedang menyimpan | **Ya** — panel konfirmasi "Kirim penilaian untuk …?" |
| **Ya, Kirim Sekarang** | `submitAssessment(status:'submitted')` → layar sukses | Penilai | Saat panel konfirmasi | — |
| **Lanjut ke Penilaian Berikutnya / Kembali ke Daftar** | Ke `/penilaian` (label adaptif sisa wajib) | Penilai | Di layar sukses | — |

### Laporan Hasil Saya (`/laporan`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Unduh PDF** | `window.print()` (print-to-PDF) | Pegawai (laporan sendiri) | Halaman hanya bila status `finalized`; pegawai hanya lihat agregat L1+L2 (komentar mentah dibuang) | — |

---

## 3. SPV / HRD mode-SPV

> Berlaku **sama** untuk SPV biasa & HRD dalam Mode SPV (aturan paritas).
>
> **Koordinator** (grant `is_coordinator`, posisi Employee) juga memakai **Input KPI (tab Input)** &
> **Laporan Kinerja Tim** — tetapi **hanya** untuk daftar pegawai naungannya (`coordinator_team_members`),
> via `service_role` berlingkup. Untuk pegawai yang **punya** koordinator, **SPV tidak** meng-ACC/input
> KPI (itu tugas koordinator; SPV lihat status read-only).

### Input KPI (`/kpi?tab=input`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Tab Input KPI / Riwayat & Audit / Rekapitulasi Kuartal** | Ganti sub-tab | SPV / HRD mode-SPV | Mode input | — |
| **Toggle Input Manual / Impor Excel** | Ganti cara input | SPV / HRD mode-SPV | — | — |
| **Dropdown Bulan & Tahun / Divisi** | Pilih bulan target & filter divisi | SPV / HRD mode-SPV | Divisi hanya bila >1 | — |
| **Simpan Semua Skor** | `saveKpiScores` (manual) — untuk **Koordinator** otomatis lewat `saveKpiAsCoordinator` (berlingkup naungan). **Edit skor bulan yang sudah ada WAJIB komentar audit** | SPV / HRD mode-SPV / **Koordinator** | Mode manual; nonaktif saat pending; tolak bila 0 skor. **SPV: pegawai berkoordinator dikeluarkan** dari daftar (di-input koordinatornya) | — (error inline) |
| **Unduh template** | Buat `.xlsx` template KPI | SPV / HRD mode-SPV | Mode Excel | — |
| **Terapkan & Simpan (N baris)** | `saveKpiScores` dari Excel (note default "Impor Excel") | SPV / HRD mode-SPV | Mode Excel; setelah parse; tolak 0 baris | — |
| **Batal** (Excel) | Buang hasil parse | SPV / HRD mode-SPV | Setelah parse | — |

> HRD **Mode Admin** melihat layout "Monitoring & Audit KPI" (read-only split-view), tanpa tab tulis. Direksi tak punya akses.

### Riwayat & Audit (`/kpi?tab=riwayat`) · Rekapitulasi (`/kpi?tab=rekap`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Cari nama/divisi** | Filter grup audit (klien) | SPV / HRD | Selalu | — |
| **Dropdown periode** (rekap) | Render ulang rekap periode terpilih | SPV / HRD | Selalu | — |

> Tabel audit & rekap read-only (append-only) — tanpa aksi tulis.

### Laporan Kinerja Tim (`/laporan-tim`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Cari nama pegawai** | Filter baris (klien) | SPV / HRD mode-SPV / Koordinator | Selalu | — |
| **Nama pegawai (link detail)** | Buka detail agregat `/laporan/{id}` (radar/aspek + ringkasan HRD **+ raw anonim**; **tanpa L3 bernama**) | SPV / HRD mode-SPV / Koordinator | Hanya bila status `in_review`/`finalized` (selain itu "menunggu rilis HRD") | — |
| **Beri ACC / ✔ ACC (batalkan)** | `setSpvAcc` set/cabut ACC laporan (cabang **Koordinator** via `service_role`) | SPV / HRD mode-SPV / **Koordinator** | Hanya bila report `in_review`/`finalized`. **Pegawai berkoordinator → di-ACC koordinatornya** (SPV lihat status read-only); SPV meng-ACC pegawai **tanpa** koordinator | — (error inline) |

> Laporan **diri sendiri** tak lagi tampil di sini — SPV/Koordinator melihatnya lewat **"Laporan Hasil Saya"** (saat Final). Koordinator = daftar **naungannya** saja; **finalisasi tetap milik HRD**.

### Monitor Kinerja (`/monitor`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Dropdown Divisi / Pegawai / Periode** | Filter tampilan (Perbandingan vs Tren individual) | SPV / HRD mode-SPV | Selalu | — |

> Hanya tampilan Supervisor. HRD Mode Admin & Direksi ditolak server. Konten murni grafik/tabel (tanpa aksi tulis).

---

## 4. HRD ADMIN

### Dashboard Organisasi (`/admin/dashboard`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **← Beranda / Ke Kelola Periode** | Navigasi | HRD/Direksi | Empty-state bila belum ada periode | — |
| **Dropdown Tahun / Periode / Divisi** | Filter pelaporan (navigasi `?param=`) | HRD/Direksi | Selalu | — |
| **Sub-tab** Kompilasi / Analisis KPI / Analisis 360 / Tabel Hasil | Ganti tampilan dashboard | HRD/Direksi | Selalu | — |
| **Cari nama/divisi + Dropdown Player** (tab Tabel) | Filter baris tabel (klien) | HRD/Direksi | Hanya tab Tabel | — |

> Murni pelaporan — tak ada aksi tulis.

### Kelola Pegawai (`/admin/pegawai`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Tambah Pegawai** | Buka form kosong (kode disarankan) | HRD Admin | Bila form belum terbuka | — |
| **Acak** (sandi) | Isi sandi acak | HRD Admin | Form Tambah | — |
| **Buat Pegawai** | `createEmployee` | HRD Admin | Mode tambah; nonaktif saat pending/duplikat | — |
| **Simpan Perubahan** | `updateEmployee` | HRD Admin | Mode edit; nonaktif saat pending/duplikat | — |
| **Checkbox Penilai eksternal** | Tandai eksternal (hanya menilai) | HRD Admin | Form tambah/edit | — |
| **Nama Panggilan (opsional)** | Set `nickname` (maks. 30 char) — dipakai di tampilan padat | HRD Admin | Form tambah/edit | — |
| **Ubah** (per baris) | Buka form terisi | HRD Admin | Nonaktif saat pending | — |
| **Reset sandi** (per baris) | `resetPassword` (set sandi baru) | HRD Admin | Nonaktif saat pending | **Ya** — ConfirmDialog "Reset sandi — {nama}" (+ tombol Acak) |
| **Nonaktifkan / Aktifkan** | `setEmployeeActive` (kunci/buka login) | HRD Admin | Nonaktif saat pending | — (langsung) |
| **Cari + Dropdown Peran/Divisi/Status** | Filter tabel | HRD Admin | Selalu | — |

> **Tombol grant PINDAH ke Manajemen Akses (2026-07-20).** Izin HRD Admin, Koordinator, Tim
> Koordinasi, batas akses rekan HRD, & akses halaman berlingkup **tidak lagi** di Kelola Pegawai —
> lihat tabel **Manajemen Akses** di bawah.

### Manajemen Akses (`/admin/akses`) — HRD penuh saja

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Pilih penerima** (pegawai / peran / halaman) | Langkah 1 alur "penerima-dulu" | HRD penuh | Selalu | — |
| **Simpan grant halaman** (Panel Lingkup & Izin) | `setPageGrant` — halaman + lingkup(multi) + izin 3-tingkat | HRD penuh | Minimal 1 lingkup dipilih | — (inline) |
| **Beri akses ke PERAN** | `setPageGrantForRole` — materialisasi ke anggota peran saat ini | HRD penuh | Ada anggota peran | **Kondisional** — konfirmasi bila izin Finalisasi |
| **Badge izin (👁 Lihat / ✎ Meringkas / ✎ Finalisasi)** | `setPageGrant` — putar tingkat izin | HRD penuh | Halaman jenis 'administrator' (Review) | — |
| **Beri / Cabut Izin HRD Admin** | `setHrdAdmin` | HRD penuh | **Grant hanya divisi HRD**; cabut selalu boleh | — (langsung) |
| **Atur Akses** (batas rekan HRD) | `setHrdSections` — subset katalog halaman admin | HRD penuh | Pemegang izin HRD; tak bisa akun sendiri | — |
| **Beri / Cabut Koordinator** | `setCoordinator` (cabut ikut hapus `coordinator_team_members`) | HRD penuh | Pegawai (Employee) | — (langsung) |
| **Tim Koordinasi** (dialog) | `setCoordinatorTeam` | HRD penuh | Sudah ber-grant Koordinator; tak boleh menaungi diri sendiri | — |
| **Cabut satu grant** | `removePageGrant` | HRD penuh | Reversibel | — (langsung) |
| **Cabut massal (halaman / pegawai)** | `removePageGrantForAll` / `removeAllPageGrantsForEmployee` | HRD penuh | Ada pemegang | **Ya** — ConfirmDialog |
| **Tandai sudah ditinjau** (Pegawai Baru) | `markAccessReviewed` | HRD penuh | Pegawai baru ≤30 hari belum ditinjau | — (langsung) |

### Kelola Siklus Periode (`/admin/periode`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Checkbox Sertakan Evaluasi 360° + Standar KPI** | Set parameter periode baru | HRD Admin | Form Buat | — |
| **Buat Periode** | `createPeriod` | HRD Admin | Nonaktif saat busy | — |
| **Standar KPI inline** (per baris) | `setKpiStandard` (metrik dashboard) | HRD Admin | On blur/Enter bila berubah | — |
| **Aktivasi** | `activatePeriod` (mengunci periode aktif lama) | HRD Admin | Hanya bila belum aktif | **Kondisional** — ConfirmDialog "Aktifkan periode ini?" bila periode lama belum lengkap |
| **Kunci & Akhiri** | `endPeriod` (kunci edit) | HRD Admin | Hanya bila aktif | **Selalu** — ConfirmDialog "Kunci & Akhiri Periode?" (daftar isu tertunda) |
| **Aktifkan 360°** | `toggleHas360(true)` (buka gerbang form 360° = peluncuran) | HRD Admin | Saat `has_360=false`; **divalidasi** — tolak bila belum ada pertanyaan/pemetaan | — (langsung) |
| **Set Tanpa 360°** | `toggleHas360(false)` (tutup form 360°, Skor Akhir jadi 100% KPI) | HRD Admin | Saat `has_360=true` | **Kondisional** — ConfirmDialog "Matikan komponen 360°?" bila sudah ada penilaian terkirim |
| **Lengkapi →** (panel Kesiapan 360°) | Tautan ke Kelola Pertanyaan / Pemetaan / Bobot | HRD Admin | Panel kesiapan periode aktif; per prasyarat yang belum lengkap | — |

> **Panel "Kesiapan Peluncuran 360°"** (atas tabel, hanya periode aktif): checklist read-only
> (pertanyaan · pemetaan · bobot) + badge status + legenda dua saklar. Murni penuntun, tanpa aksi tulis.

### Pemetaan Penilai 360° (`/admin/pemetaan`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Tambah Relasi** | `createMapping` (selalu Wajib; tolak target eksternal/duplikat) | HRD Admin | Tab Pemetaan; target hanya internal | — |
| **+ Impor dari Excel / Unduh template / Impor N baris / Batal / ✕** | Impor pemetaan massal (`createMappingsBulk`; buang target eksternal) | HRD Admin | Panel impor | — (pratinjau + daftar dilewati) |
| **Salin dari Periode Sebelumnya / Salin Pemetaan / ✕** | `copyMappingsFromPeriod` | HRD Admin | Bila ada periode lain | — |
| **Penilai/Target/Bersihkan** | Filter daftar | HRD Admin | "Bersihkan" bila filter aktif | — |
| **Hapus** (per baris) | `deleteMapping` (akomodasi resign). Bila pasangan **sudah dinilai** → hapus penilaian 360°-nya **di periode itu saja** + **auto Hitung Ulang Skor 360°** | HRD Admin | Nonaktif saat busy | **Kondisional** — ConfirmDialog (peringatan bila sudah ada penilaian) via `mappingDeleteInfo` |
| **Setujui / Tolak** (tab Koreksi Relasi) | `reviewCorrection` (approve mengubah relasi mapping) | HRD Admin | Hanya request `pending` | — |
| **Tab Pemetaan / Koreksi Relasi** | Navigasi (+ badge pending) | HRD Admin | Selalu | — |

### Kelola Pertanyaan (`/admin/pertanyaan`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Salin ke Periode Aktif → Ya, salin / Batal** | `importQuestionsFromPeriod` (aspek+indikator aktif+esai, lewati duplikat) | HRD Admin | Bila ada sumber berisi pertanyaan | Konfirmasi inline |
| **Tambah Aspek** | `addAspect` | HRD Admin | Nama min 2; nonaktif saat busy | — |
| **Ubah nama aspek / Simpan / Batal** | `renameAspect` (edit inline) | HRD Admin | — | — |
| **Naik / Turun** (aspek) | `moveAspect` (urutan) | HRD Admin | Nonaktif di ujung/busy | — |
| **Hapus aspek** | `deleteAspect` (tolak bila masih ada indikator) | HRD Admin | — | **ConfirmDialog** "Hapus aspek?" (bila kosong) |
| **Simpan** (teks indikator) | `updateIndicator` (teks) | HRD Admin | Bila teks diubah | — |
| **Nonaktif / Aktifkan** (indikator) | `toggleIndicator` | HRD Admin | — | — |
| **Hapus indikator** | `deleteIndicator` (tolak bila sudah dipakai) | HRD Admin | — | **ConfirmDialog** "Hapus indikator?" |
| **Chevron panduan / Simpan Panduan / Tutup** | Editor deskripsi + rating guide (`updateIndicator`) | HRD Admin | — | — |
| **Tambah Indikator ke Aspek** | `addIndicator` | HRD Admin | Bila ada aspek; judul wajib | — |
| **Tambah / Simpan / Hapus** (esai kualitatif) | `addQualQuestion` / `updateQualQuestion` / `deleteQualQuestion` (hapus permanen) | HRD Admin | — | — (Hapus esai langsung) |

### Bobot & Kalkulasi Skor 360° (`/admin/bobot`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Model Bobot** (select 4class/2class) | Ganti model bobot | HRD Admin | — | — |
| **Simpan & Terapkan Bobot** | `saveWeights` (tak otomatis hitung ulang) | HRD Admin | Nonaktif saat busy | — |
| **Hitung Ulang Skor 360°** | `computeResult360` → tulis `result_360` resmi (Self dikecualikan) | HRD Admin | Nonaktif saat busy | — |

### Progress 360 Feedback (`/admin/progress`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **🔔 Kirim Pengingat Massal** | `massReminder` (ke penilai belum selesai) | HRD Admin | Nonaktif saat pending; dorman bila email belum diset | — |
| **📨 Kirim Undangan Massal** | `massOnboarding` (set sandi acak + email info akun; trial gmail-only) | HRD Admin | Nonaktif saat pending | **ConfirmDialog** "Kirim Undangan Massal?" (sandi disetel ulang) |
| **Undangan** (per-orang) | `sendOnboarding` (set sandi + email info akun) | HRD Admin | — | **ConfirmDialog** "Kirim Undangan ke {nama}?" |
| **Kirim Pengingat** (per-orang) | `sendReminder` (target belum dinilai) | HRD Admin | Hanya bila penilai belum lengkap; tolak 0 sisa | — |
| **Rincian (N) / Tutup** | Expand daftar target belum dinilai | HRD Admin | Bila ada pending | — |
| **Paksa Selesai** | `forceComplete` (tandai submitted) | HRD Admin | Di dalam Rincian | — |
| **Cari / Divisi / Status** | Filter daftar penilai | HRD Admin | Selalu | — |

### Review Hasil Akhir (`/admin/laporan`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Cari + Dropdown Divisi / Kelengkapan 360° / Hanya perlu tindakan / Bersihkan** | Filter baris (klien); filter kelengkapan = penilai WAJIB lengkap; "perlu tindakan" sembunyikan laporan Final yang skornya tak berubah | HRD Admin | Filter kelengkapan hanya saat `has_360` | — |
| **① Hitung Ulang Skor 360°** | `computeResult360` semua pegawai (kokpit "Sinkronkan Skor"; tanpa pindah ke halaman Bobot) | HRD Admin | Di kokpit; nonaktif saat busy | — |
| **② Finalisasi Ulang Berubah (N)** | `resyncDriftedFinals` — sinkronkan `final_score` tersimpan pada laporan Final yang skornya ketinggalan ("berubah → N"); laporan tetap Final, ringkasan tak berubah | HRD Admin (Mode Admin) | Muncul bila ada laporan berubah (N>0) | **Ya** — ConfirmDialog |
| **⚖ Atur Bobot / ⚑ Flag Kepatuhan** | Pintasan ke `/admin/bobot` & `/admin/kepatuhan` | HRD Admin | Di kokpit | — |
| **Tinjau →** (kolom Aksi) | Buka detail `/laporan/{id}` (state-machine ada di detail) | HRD Admin | "KPI kosong" bila KPI belum ada (nama **tidak** bisa diklik lagi) | — |

> Tabel = **kokpit** read-only: kolom KPI ("X/Y bln" amber bila kurang) · 360° ("belum"/"N/A"/
> "⚠ perlu hitung") · Punish. · Skor Akhir (baris Final = angka **tersimpan** + badge "berubah → N"
> bila skor terkini beda) · Dinilai oleh X/Y · ACC SPV · Status. Aksi Simpan/Finalisasi/Rilis kini
> **hanya di halaman detail** (Panel Aksi di bawah).

### Detail Laporan — Panel Aksi HRD (`/laporan/[employeeId]`)

Panel **berbasis status (state-machine)**: saat masih dapat diedit (draf/belum/Ditinjau SPV)
tombol edit muncul; saat **Final** panel jadi read-only (hanya Unduh PDF + Kembalikan ke Draf).

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Unduh PDF** | `window.print()` | HRD Admin | Selalu | — |
| **Simpan Draf** | `saveOrFinalizeReport(false)` → status `draft` | HRD Admin | Hanya saat belum Final; "KPI kosong" → dinonaktifkan | — |
| **Rilis ke SPV** | `releaseToSpv` → status `in_review` (SPV bisa lihat agregat) | HRD Admin | Hanya saat belum Final & belum `in_review` | — |
| **Finalisasi Hasil** | `saveOrFinalizeReport(true)` → `finalized` (pegawai bisa lihat) | HRD Admin | Hanya saat belum Final; tersembunyi bila KPI kosong | **Kondisional (lunak)** — konfirmasi bila Skor 360° perlu dihitung ulang / KPI belum lengkap semua bulan |
| **↩ Kembalikan ke Draf** | `saveOrFinalizeReport(false)` (buka kunci, sembunyikan dari pegawai) | HRD Admin | **Hanya saat status Final** | **Ya** — konfirmasi (menyembunyikan dari pegawai) |
| **Hitung Ulang Skor 360°** (link) | Tautan ke `/admin/laporan` atau `/admin/bobot` | HRD Admin | Di banner "Skor 360° perlu dihitung ulang" (sebut penyebab spesifik) | — |

> **Ringkasan Aspek 360°** kini **auto-simpan** (`saveAspectSummaries`, debounce ~5 detik + saat
> blur) dengan indikator status — **tidak ada lagi tombol "Simpan Ringkasan" manual**, dan tidak
> ada konfirmasi "belum disimpan" saat Rilis/Finalisasi. Saat Final, editor ringkasan **terkunci**.

### Flag Kepatuhan (`/admin/kepatuhan`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Input Punishment + Simpan** (per baris) | `setPenalty` (potong Skor Akhir, min 0; kolom **kosong** bila belum ada — placeholder "0") | HRD Admin | Nonaktif saat busy | — |
| **Tampilkan semua pegawai** (toggle) | Tampilkan seluruh pegawai (default hanya yang **perlu perhatian**: telat / belum self / sudah ada punishment) | HRD Admin | Selalu | — |

### Ekspor Dataset (`/admin/ekspor`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Dropdown Periode** | Set scope dataset ber-periode | HRD Admin | Selalu | — |
| **Unduh Rekap (.xlsx)** | `exportPeriodConfig` (5 sheet konfigurasi) | HRD Admin | Nonaktif saat ada unduhan lain | — |
| **Unduh Excel** — Pegawai / KPI / Audit KPI / Kepatuhan / Rekap / Penilaian 360° Detail / Umpan Balik Kualitatif / Pemetaan | Ekspor masing-masing dataset (360° & esai anonim) | HRD Admin | Nonaktif saat busy; "Belum ada data" bila kosong | — |

### Log Aktivitas HRD (`/admin/audit`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Cari + Dropdown Kategori/Pelaku + Bersihkan** | Filter jejak audit (klien, read-only) | HRD Admin / Direksi | "Bersihkan" bila filter aktif | — |

---

## 5. DIREKSI

Direksi **sebagian besar read-only** (Dashboard, Log Aktivitas, Review Hasil Akhir). Aksi tulis:
**ACC rencana suksesi** & **ACC laporan SPV**.

### Laporan Kinerja Tim & Review Hasil Akhir (Direksi)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Tinjau / Nama (link detail)** | Buka detail agregat laporan **SPV** (radar/aspek + ringkasan HRD **+ raw anonim**; **tanpa L3 bernama**) | Direksi | Hanya laporan **SPV** (atau pemimpin tim) yang sudah dirilis; laporan pegawai non-SPV **ditolak** | — |
| **Beri ACC / ✔ ACC** | `setSpvAcc` (cabang **Direksi** via `service_role`) — pakai ulang kolom `spv_acc` | Direksi | Hanya bila target = SPV & report `in_review`/`finalized`; **non-blok** (tak menghambat finalisasi HRD) | — (error inline) |

> **Review Hasil Akhir** (`/review-hasil`) = **read-only** untuk Direksi: lihat Hasil Akhir **semua**
> pegawai (agregat + raw anonim, termasuk draf), **tanpa** Hitung Ulang / Rilis / Finalisasi / ACC / edit
> ringkasan. Direksi juga **boleh dinilai 360°** → hasilnya tampil di Review Hasil Akhir & Ekspor Rekap HRD.

### Promosi & Suksesi (`/suksesi`)

| Tombol | Fungsi | Peran | Kondisi | Konfirmasi |
|--------|--------|-------|---------|------------|
| **Setujui** | `respondPlan('approved')` → status approved (terkunci) | **Direksi** | Untuk rencana `submitted`; nonaktif saat pending | — |
| **Tolak** | `respondPlan('rejected')` → status rejected (terkunci) | **Direksi** | Untuk rencana `submitted` | — |
| **Textarea Komentar Direksi** | Komentar keputusan (opsional) | Direksi | — | — |

> Sisi **HRD** di halaman ini: Dropdown rencana, Justifikasi, **Simpan Draf**, **Ajukan ke Direksi** (`upsertPlan`), **Hapus** (`deletePlan`) — terkunci setelah Direksi memutuskan.

---

*Dokumen ini diturunkan dari kode (Server Actions + komponen). Bila tombol/perilaku berubah, perbarui bagian terkait.*
