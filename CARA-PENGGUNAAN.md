# Cara Penggunaan Aplikasi — Infarm 360° Portal

Panduan pengguna aplikasi penilaian kinerja (Performance Appraisal) 360°.
Disusun dari `PANDUAN Infarm 360 Portal.pdf` dan disesuaikan dengan aplikasi saat ini.

> **Status:** aplikasi **live** dengan database **Supabase** (auth nyata, RLS per peran).
> Seluruh akun saat ini memakai sandi awal bersama **`Infarm2026`** (hasil reset massal) —
> sebaiknya tiap pegawai menggantinya. Pegawai asli dikelola lewat menu
> **HRD → Kelola Pegawai** (lihat di bawah).

---

## Login

1. Buka aplikasi (URL Vercel atau `http://localhost:3000` saat lokal).
2. Pilih **Peran**: Employee / SPV / HRD Admin / Direksi.
3. Pilih **Nama** Anda — dropdown punya **kotak pencarian**; ketik sebagian nama untuk
   menyaring (daftar nama diambil otomatis dari data pegawai aktif).
4. Masukkan **Sandi**.
5. Klik **Masuk**.

> Pegawai baru yang ditambahkan HRD otomatis muncul di daftar nama. Tersedia juga
> cadangan **"Masuk dengan email manual"** bila perlu. Dropdown nama berfitur pencarian
> juga dipakai di Pemetaan (Penilai/Target) & Penilaian Ad-Hoc.

**Daftar akun demo** (sandi awal bersama `Infarm2026`):

| Peran | Nama | Divisi |
|---|---|---|
| Employee | Andi Pratama, Budi Santoso | Operasional |
| Employee | Citra Dewi, Dinda Rahayu | Marketing |
| Employee | Eko Prasetyo | Finance |
| SPV | Gunawan Wibowo | Operasional |
| SPV | Hesti Lestari | Marketing |
| HRD Admin | Irma Suryani | HRD |
| Direksi | Joko Widiatmoko, Kartini Puspita | Direksi |

> HRD Admin punya **2 mode**: bertindak sebagai **SPV** atau sebagai **HRD Admin**
> (mengelola seluruh sistem).

---

## Tugas & Notifikasi (semua peran)

Di **sidebar bagian atas** terdapat panel **"Tugas & Notifikasi"** dengan badge jumlah
(juga muncul di tombol menu pada layar ponsel). Isinya **diturunkan otomatis** dari data —
tak perlu ditandai "sudah dibaca", selalu mengikuti keadaan nyata akun yang login:

- **X penilaian 360° menunggu diisi** → ke Daftar Penilaian Saya.
- **Laporan Hasil Anda sudah final** (Employee/SPV) → ke Laporan Hasil Saya.
- **X anggota belum ada KPI [bulan]** (SPV / HRD mode-SPV) → ke Input KPI.
- **X penilaian 360° belum lengkap** & **X laporan belum difinalisasi** (HRD Admin).
- **X usulan suksesi menunggu ACC** (Direksi).

Tiap baris adalah tautan langsung ke halaman terkait. Bila kosong: *"Tak ada tugas tertunda 🎉"*.
Panel hanya aktif saat ada **periode aktif**.

---

## Peran: EMPLOYEE

### Daftar Penilaian Saya
1. Lakukan penilaian 360° sesuai daftar "Rekan Kerja & Evaluasi dalam Daftar Penilaian Anda".
2. Cek kolom **Garis Hubungan** — jika hubungan kerja salah, ajukan **Minta Koreksi**
   dengan alasan, lalu **Kirim Pengajuan**.
   - Kolom **Sifat** menandai tiap penilaian **Wajib** atau **Opsional** (diatur HRD di Pemetaan).
3. Klik **Mulai Nilai**:
   - Pilih **Aspek Budaya** (rail kiri) dan indikatornya (mis. "Q1 Pegang Komitmen").
   - Beri **Rating** (1–5) dan isi **Komentar** (wajib, min. 4 karakter).
   - Klik **Selanjutnya** untuk indikator berikutnya.
4. Belum selesai? Klik **Simpan Draf** — lanjutkan lagi dari "Daftar Penilaian Saya".
5. Sudah lengkap? Klik **Kirim Penilaian 360°**.
6. **Batalkan Pengisian** untuk membatalkan.
7. Menilai orang di luar daftar: fitur **Hak Penilaian Ad-Hoc Mandiri** →
   "Pilih Rekan Kerja untuk Dinilai" → "Tambahkan Rekan" → nilai seperti biasa.

### Laporan Hasil Saya
> Muncul **setelah** disetujui & divalidasi SPV dan HRD.
1. Pilih kuartal di **Pilih Kuartal Acuan**.
2. **Unduh PDF** jika laporan sudah tersedia.

---

## Peran: SUPERVISOR (SPV)

Selain semua fitur Employee di atas, SPV punya:

### Input KPI Anggota (bulanan)
- **Pengisian Manual Apps**: pilih **Bulan & Tahun**, isi **Skor Baru (0–100)**,
  klik **Simpan Semua Skor**. Saat mengedit, isi **Komentar Ringkas Audit**.
- **Unggah Excel Kerja**: unduh "Format Template KPI Standard.xlsx", isi, drag-drop,
  tunggu ter-parsing, lalu **Pasang Data & Tinjau Kembali**.

### Riwayat & Audit Perubahan
- "Rekam Audit Skor Perubahan KPI" — filter **Pilih Pegawai Tim** untuk meninjau perubahan.

### Rekapitulasi Kuartal
- Rekap capaian KPI, Hasil 360, & Skor Akhir bawahan. Filter **Tahun** & **Kuartal**.

### Laporan Kinerja Tim
- Tinjau "Final Report" tiap pegawai; klik section pegawai untuk lihat Hasil 360.
- Klik **ACC** jika sudah sesuai (koordinasi dengan HRD bila ada ketidaksesuaian).

### Monitor Kinerja
- Memantau kinerja bawahan. **SPV hanya melihat pegawai sedivisi** dengannya.
- Filter periode/pegawai; pilih satu pegawai untuk lihat **tren bulanan**
  (KPI, Evaluasi 360°, Skor Akhir).

---

## Peran: HRD ADMIN

### Kelola Pegawai
Mengelola akun & data pegawai (tambah/ubah/nonaktif), tanpa edit file/reseed.
1. **Tambah Pegawai** → isi Nama, Peran, Divisi, **Kode Pegawai**, Email, **Sandi Awal**,
   dan (opsional) **Atasan/SPV**. Klik **Buat Pegawai**.
   - **Email boleh placeholder** (mis. `nama@infarm.test`) — login pakai email+sandi tanpa
     verifikasi inbox; ganti ke email asli kapan saja lewat **Ubah**.
   - **Kode Pegawai bebas** mengikuti skema perusahaan (mis. `FT2021-001`); saran otomatis
     melanjutkan nomor terakhir. Sistem **memperingatkan** bila kode/email duplikat.
   - **Peran** (bukan kode) yang menentukan hak akses. **Atasan** bisa SPV, HRD, atau Direksi.
2. **Ubah** — ganti nama/divisi/peran/kode, email, atau atasan.
3. **Reset Sandi** — setel sandi baru (disarankan pegawai menggantinya sendiri).
4. **Aktif/Nonaktif** — menonaktifkan **mengunci akun** (tak bisa login) tanpa menghapus
   riwayat penilaian/KPI. Aktifkan kembali kapan pun.
5. **Impor dari Excel** (tombol di kanan atas) — tambah **banyak pegawai sekaligus**.
   Kolom: `nama`, `kode`, `divisi`, `peran` (employee/spv/hrd/direksi), opsional `email`
   (kosong → otomatis dari nama), `sandi` (kosong → **Sandi Default**), `atasan` (kode pegawai).
   Ada **Unduh template**, **Sandi Default**, dan **pratinjau tervalidasi** (✓ valid / ↷ dilewati
   karena duplikat / ✗ tidak valid + alasan) sebelum impor. Duplikat **dilewati** (tak menimpa).
   Tip: impor pegawai ber-peran **SPV/atasan dulu** agar kolom `atasan` bawahan langsung tertaut.
6. **Filter & cari** — kotak pencarian + filter **Peran**, **Divisi**, dan **Status**.

> Tips data asli: beri **sandi berbeda per orang** (jangan pakai sandi demo bersama).

> **Lupa Sandi via email (belum aktif).** Alur reset sandi mandiri lewat email sudah siap
> tapi sengaja disembunyikan. Untuk mengaktifkannya (agar pegawai bisa "Lupa sandi?" sendiri
> di halaman login): (1) isi **email asli** tiap pegawai di sini; (2) aktifkan **SMTP/Resend**
> di Supabase → *Authentication → Emails*; (3) daftarkan **Redirect URL**
> `https://<domain>/auth/callback` di *Authentication → URL Configuration*; (4) set env Vercel
> `NEXT_PUBLIC_ENABLE_PW_RESET=true` lalu redeploy. Sebelum itu, sandi diatur HRD lewat **Reset Sandi**.

### Kelola Siklus Periode
1. **Kontrol Aktivasi Siklus**: beri **Label Periode**, set **Tanggal Mulai/Selesai**,
   centang **Aktifkan Angket Evaluasi 360** bila perlu, klik **Aktivasi Periode Penilaian**
   (form 360 di "Daftar Penilaian Saya" jadi aktif).
   - **Kunci & Akhiri Periode** menutup penilaian (tak bisa isi/edit lagi).
2. **Arsip & Riwayat Kuartal**: meninjau riwayat kuartal ber-penilaian 360°.

### Kelola Pertanyaan
- Tiap aspek menampilkan daftar indikator kuantitatif (rating 1–5) — edit teks atau
  **nonaktifkan** (indikator dinonaktifkan, bukan dihapus, agar skor historis utuh).
- **Section khusus "Tambah Indikator Kuantitatif Baru"** (di bawah semua aspek): pilih
  **Aspek** → isi **Judul Ringkas** + **Deskripsi Perilaku** (opsional) → **Tambah Indikator ke Aspek**.
- **Umpan Balik Kualitatif (Esai Bebas)** untuk pertanyaan kualitatif (hapus = permanen).

### Bobot & Kalkulasi Skor 360° (satu halaman)
- **Bobot Penilai**: pilih **Model 4-Kelas** (Atasan/Peer/Cross/**Bawahan**/Self) atau **2-Kelas**
  (Atasan/Internal — Internal = Peer+Cross+Bawahan), atur angka, lalu **Simpan & Terapkan Bobot**.
  **Self** selalu dikecualikan dari total. Setelah mengubah, jalankan **Hitung Ulang Skor 360°**.
- **Kalkulasi Skor 360°**: tombol **Hitung Ulang Skor 360°** menulis hasil resmi
  (`result_360`) memakai model aktif + tabel hasil per pegawai. (Tab terpisah lama
  sudah disatukan ke halaman ini.)
- **Perbandingan Model 4-Kelas vs 2-Kelas**: pratinjau skor tiap pegawai bila dihitung
  dengan kedua model sekaligus + **Selisih**, membantu memilih model sebelum Hitung Ulang.
  (Pratinjau tak mengubah data.)

### Monitoring & Audit KPI (HRD Admin)
- **Satu halaman** berisi **Rekapitulasi Kuartal** + **Riwayat & Audit Perubahan KPI**
  berdampingan (split view; tab "Input KPI" tidak muncul di mode admin — input adalah tugas SPV).
- **Riwayat & Audit** punya **pencarian nama/divisi** pegawai.
- Memantau input & perubahan KPI yang dilakukan SPV (jejak audit append-only).
- Saat HRD beralih ke **mode SPV**, ketiga bagian (Input, Riwayat, Rekapitulasi) **hanya
  menampilkan pegawai di divisi HRD-nya sendiri**, konsisten dengan kebijakan SPV.

### Log Aktivitas HRD (Pemantauan)
- **Jejak audit aksi sensitif HRD** — *read-only* & **tak bisa diubah/dihapus** (append-only).
  Dapat dibuka HRD **dan Direksi** (pengawasan).
- Tercatat otomatis: aktif/kunci/toggle-360 **periode**, simpan **bobot**, **Hitung Ulang 360°**,
  finalisasi/draft **laporan**, **punishment**, kelola **pegawai** (buat/ubah/aktif/reset sandi/impor),
  **pemetaan** (buat/impor/hapus/koreksi), paksa-selesai **progress**, kelola **pertanyaan**.
  *(Sandi tidak pernah dicatat.)*
- Tiap entri: **waktu** (WIB) · **pelaku** · **kategori** (badge) · **ringkasan**.
  Tersedia **filter Kategori & Pelaku** + **pencarian teks** (menampilkan 500 entri terbaru).

### Promosi & Penyesuaian
- Pilih **Rencana Suksesi (Rekomendasi HRD)** per pegawai, isi **Catatan Justifikasi**.
- Filter **Sektor/Divisi** dan **Saring Rencana Suksesi**.

### Review Hasil Akhir
1. Filter **Siklus Acuan**.
2. **Edit Laporan** per pegawai (klik tiap section, mis. "Jujur & Tanggung Jawab").
3. Section **Rincian Komentar Murni (Raw Feedback)** = akumulasi komentar tiap indikator;
   komentar dari **penilaian diri sendiri** ditandai badge **"Self"**.
4. **Simpan Draft** → **Finalisasi Hasil** (setelah sepakat dengan SPV) → **Unduh PDF**.

### Pemetaan (Mapping)
- **Impor Massal Pemetaan Excel** (unduh "Formulir Acuan.xlsx") atau **Pendaftaran
  Sepasang Relasi Manual** (pilih Penilai + Target lewat dropdown **berpencarian** →
  pilih Relasi & **Sifat Penilaian** (Wajib/Opsional) → **Daftarkan Relasi Manual**).
- **Sifat Penilaian**: tiap relasi bisa **Wajib** atau **Opsional**. Tampil di kolom Sifat
  tabel mapping, di Daftar Penilaian Saya, dan di Progress 360. Default **Wajib**.
- Daftar pemetaan menampilkan **"Total N pasangan penilaian"** + **filter Penilai & Target**
  (dengan tombol Bersihkan). Tiap baris bisa dihapus (akomodasi pegawai resign).
- Tinjau **Permohonan Koreksi Garis Hubungan** (setujui/tolak) di tab Koreksi Relasi.

### Progress 360 Feedback
- Filter Divisi/Status/Nama; lihat status "Belum / Sudah Lengkap" + progres per penilai.
- Klik **Rincian** → daftar target yang belum dinilai; tiap target menampilkan badge
  **Relasi** (Atasan/Peer/Cross/Self/Bawahan) dan **Wajib/Opsional** (dari Pemetaan).
- **Kirim Pengingat** / **Pengingat Massal** — *placeholder* (email aktif setelah integrasi
  Resend); **Paksa Selesai** untuk menandai penilaian selesai (penyesuaian manual).

### Flag Kepatuhan Penilaian
- Memantau **kepatuhan** pengisian 360° dan memberi **punishment**.
- **Flag keterlambatan**: pegawai dengan penilaian **Wajib** yang belum selesai, lengkap
  dengan **jumlah** penilaian terlambat + daftar targetnya.
- **Flag Self Assessment**: menandai pegawai yang **belum** mengisi penilaian diri sendiri.
- **Punishment (pengurangan nilai)**: HRD input poin pengurangan per pegawai. Poin ini
  **memotong Skor Akhir** (minimal 0) dan menjalar ke Review Hasil Akhir, Dashboard, dan
  Monitor Kinerja. **Per kuartal** — banner menampilkan siklus aktif yang sedang dipunish.

### Monitor Kinerja & Dashboard Organisasi
*(Keduanya ada di section sidebar **Pemantauan**.)*

**Monitor Kinerja** — banner "Sistem Intelijen Kinerja Tim" + 3 filter (**Divisi**,
**Pegawai**, **Periode/Kuartal**). SPV → tim, HRD/Direksi → semua. Dua mode:
- **Perbandingan antar-pegawai** (saat Pegawai = "Bandingkan Semua") — bar Skor Akhir
  berperingkat + tabel KPI/360°/Skor Akhir, di-scope periode terpilih (atau rerata lintas periode).
- **Tren bulanan individual** (saat satu pegawai dipilih) — grafik KPI/360°/Skor Akhir per bulan + tabel.

**Dashboard Organisasi** — **Panel Filter** di atas: **Periode/Kuartal** & **Divisi**;
seluruh chart dihitung ulang konsisten untuk lingkup itu (default: periode aktif, semua
divisi). Skor Akhir mengikuti flag **360° aktif/nonaktif** periode terpilih (KPI 50% +
360° 50% ↔ 100% KPI murni). **4 sub-dashboard (tab):**
- **Kompilasi Kinerja Organisasi** — stat talenta, **Distribusi Kategori Kinerja**,
  **Rencana Tindak Lanjut**, **Skor KPI per Divisi**, **Evaluasi Budaya 360° (sub-aspek)**,
  Matriks **9-Box** & **4-Box**, **Papan Pertimbangan Suksesi & Promosi (Skor ≥ 90)**, top/bottom.
- **Analisis Hasil KPI** — rerata KPI organisasi, KPI per divisi, perkembangan KPI bulanan, leaderboard KPI teratas/terendah.
- **Analisis 360 Feedback** — rerata 360°, rataan sub-aspek budaya, leaderboard 360° teratas/terendah.
- **Tabel Hasil Seluruh Pegawai** — tabel rinci + **pencarian nama/divisi** & **filter A/B/C/D Player**.

#### Klasifikasi Talenta (tab Kompilasi)
- **Matriks 9-Box (KPI × 360°)** — sebaran pegawai pada 9 kategori (Star Talent,
  High Performer, Core Contributor, dst.) dari band KPI (≥90 / 80–89,99 / <80) ×
  band 360° (≥80 / 70–79,99 / <70).
- **Matriks 4-Box (A/B/C/D Player)** — berbasis **Skor Akhir**:
  **A** (Skor ≥ 90 **dan** KPI ≥ 90 **dan** 360° ≥ 80) · **B** (Skor ≥ 80) ·
  **C** (Skor ≥ 70) · **D** (Skor < 70).
- **Sefase periode:** KPI, 360°, dan Skor Akhir diambil dari **periode yang dipilih** di
  Panel Filter (default periode aktif) agar klasifikasi adil.
- **Periode tanpa 360°:** 9-Box tidak ditampilkan (menampilkan info), dan kategori
  **A Player tidak tersedia** (Skor Akhir = 100% KPI).

#### Tabel Hasil Seluruh Pegawai
- Kolom **Klasifikasi 9-Box** dan **A/B/C/D Player** per pegawai (konsisten dengan kedua
  matriks di atas). Saat kuartal tanpa 360°, kolom 9-Box menampilkan **N/A · Tanpa 360°**.

---

## Peran: DIREKSI

- **Daftar Penilaian Saya** — sama seperti Employee (mengisi 360°).
- **Dashboard Eksekutif** — sama dengan Dashboard Organisasi HRD.
- **Monitor Kinerja** — memantau semua pegawai (filter divisi/periode/pegawai).
- **Log Aktivitas HRD** — *read-only*, mengawasi jejak aksi sensitif HRD (sama seperti yang
  dilihat HRD; lihat bagian HRD Admin).
- **Promosi & Penyesuaian** — respon **Kewenangan Diskusi / ACC Direksi** terhadap
  Rencana Suksesi yang diajukan HRD.

---

## Alur Lengkap (ringkas)

1. **HRD** aktivasi periode + (opsional) aktifkan angket 360 + atur mapping & bobot.
2. **Semua pegawai** mengisi penilaian 360° di "Daftar Penilaian Saya".
3. **SPV** input KPI bulanan tiap anggota tim.
4. **HRD** pantau progress 360 → kunci periode bila sudah lengkap.
5. **HRD** Review Hasil Akhir → diskusi & **ACC bersama SPV** → **Finalisasi**.
6. **Pegawai** melihat **Laporan Hasil Saya** setelah final.
7. **HRD → Direksi**: usulan promosi/suksesi untuk **ACC Direksi**.

---

# Rincian Fitur HRD Admin & Dampaknya

HRD Admin adalah peran pusat: hampir semua aksinya **mengubah apa yang dilihat/dikerjakan
peran lain**. Berikut tiap fitur, fungsinya, dan **ke mana dampaknya menyebar**.

> Catatan: backend **Supabase sudah aktif** — seluruh perhitungan (Skor 360°, Skor Akhir,
> dsb.) berjalan penuh dari data nyata. Penjelasan "dampak" di bawah adalah perilaku
> aktual aplikasi.

### 1. Kelola Siklus Periode — *gerbang utama seluruh proses*
**Fungsi:** membuka/menutup kuartal & mengaktifkan angket 360.
**Berdampak ke:**
- **Aktivasi Periode** → form 360 di **Daftar Penilaian Saya** menjadi **aktif untuk semua
  peran** (Employee, SPV, Direksi). Tanpa ini, tidak ada yang bisa menilai.
- Centang **Aktifkan Angket 360** → menentukan apakah kuartal punya komponen 360. Ini
  mengubah **rumus Skor Akhir**: tanpa 360 = KPI murni; dengan 360 = blend 50/50 KPI+360.
  Terlihat di Monitor Kinerja, Rekapitulasi, Review Hasil Akhir, Dashboard.
- **Kunci & Akhiri Periode** → semua form 360 **nonaktif**; Employee/SPV tak bisa isi/edit.
  Mengunci data agar bisa difinalisasi.

### 2. Pemetaan (Mapping) — *menentukan siapa menilai siapa*
**Fungsi:** mendaftarkan pasangan Penilai → Target + Relasi (Atasan/Peer/Cross/Self) + **Sifat** (Wajib/Opsional).
**Berdampak ke:**
- **Daftar Penilaian Saya** tiap pegawai → menentukan **daftar orang yang wajib ia nilai**.
- Kolom **Garis Hubungan** yang dilihat penilai (sumber "Minta Koreksi").
- **Sifat Wajib/Opsional** → tampil di Daftar Penilaian Saya & Progress 360, dan menjadi
  dasar **Flag Kepatuhan** (hanya penilaian Wajib yang dihitung "terlambat").
- **Perhitungan 360**: relasi menentukan masuk kelas bobot mana (lihat Kelola Bobot).
- **Progress 360**: total target yang harus diisi tiap orang dihitung dari mapping.
- Hapus relasi (mis. pegawai resign) → target itu hilang dari daftar penilaian terkait.
- Setujui/tolak **Permohonan Koreksi** → mengubah relasi yang sudah terdaftar.

### 3. Kelola Pertanyaan — *isi form penilaian*
**Fungsi:** tambah/edit/hapus indikator kuantitatif (rating 1–5) & pertanyaan kualitatif.
**Berdampak ke:**
- **FormAssess** (Mulai Nilai) yang dilihat **semua penilai** — pertanyaan langsung berubah.
- Struktur aspek di **Review Hasil Akhir** & "Rincian Komentar Murni".
- **Dashboard** (Indeks Sub-Aspek Kompetensi & Perilaku) yang mengelompokkan per indikator.
- ⚠️ **Hapus = permanen** (tidak bisa undo) → jawaban historis untuk indikator itu bisa hilang konteksnya.

### 4. Kelola Bobot Penilai — *cara skor 360 dihitung*
**Fungsi:** atur bobot Atasan/Peer/Cross (Model 4-Kelas) atau Atasan/Internal (Model 2-Kelas).
**Berdampak ke:**
- **Nilai Evaluasi 360** tiap pegawai → mengubah **Skor Akhir** → menjalar ke Monitor
  Kinerja, Rekapitulasi Kuartal, Review Hasil Akhir, Dashboard, **Kategori Evaluasi**, dan
  **Papan Pertimbangan Suksesi** (skor > 90).
- Berlaku setelah klik **Simpan & Terapkan Bobot**; **Reset Default** mengembalikan ke awal.

### 5. Review Hasil Akhir — *finalisasi & rilis laporan*
**Fungsi:** audit & edit Final Report per pegawai, lalu finalisasi.
**Berdampak ke:**
- **Simpan Draft** → tersimpan, belum dirilis.
- **Finalisasi Hasil** → laporan **muncul untuk pegawai** di **Laporan Hasil Saya**
  (status final) & bisa **Unduh PDF**. Sebelum final, pegawai tidak melihat apa pun.
- Idealnya dilakukan **setelah ACC SPV** (Laporan Kinerja Tim) — alur dua pihak.
- Komentar **penilaian diri sendiri** ditandai badge **"Self"** di Rincian Komentar Murni.

### 6. Promosi & Penyesuaian — *usulan ke Direksi*
**Fungsi:** input Rencana Suksesi + Catatan Justifikasi per pegawai.
**Berdampak ke:**
- **Direksi** → muncul di Promosi & Penyesuaian Direksi untuk **ACC / diskusi**.
- Kolom **Rencana Suksesi / Promosi** di Dashboard Organisasi & Tabel Hasil Seluruh Pegawai.

### 7. Progress 360 Feedback — *kontrol kelengkapan*
**Fungsi:** pantau siapa sudah/belum mengisi; dorong penyelesaian.
**Berdampak ke:**
- **Kirim Pengingat** → email ke penilai yang belum selesai (*placeholder* — aktif setelah Resend disiapkan).
- **Paksa Selesai** → meng-override status pengisian menjadi selesai (penyesuaian manual),
  sehingga data dianggap lengkap untuk finalisasi.
- Tidak mengubah skor, tapi memengaruhi **kesiapan data** sebelum Review Hasil Akhir.

### 8. Flag Kepatuhan Penilaian & Punishment — *menghukum ketidakpatuhan*
**Fungsi:** menandai keterlambatan penilaian **wajib** & Self Assessment yang kosong, lalu
memberi **punishment** (pengurangan poin).
**Berdampak ke:**
- **Flag** dihitung dari **Sifat (Pemetaan)** + status pengisian (assessList).
- **Punishment** → input poin **per kuartal** per pegawai → **memotong Skor Akhir** (minimal 0).
- Pengurangan menjalar ke **Review Hasil Akhir, Dashboard, Monitor Kinerja** (matriks &
  tren bulanan) untuk kuartal terkait.

### 9. Monitoring & Audit KPI — *pengawasan, bukan pengubahan*
**Fungsi:** melihat input & perubahan KPI yang dilakukan SPV (jejak audit).
**Berdampak ke:** tidak mengubah data — alat **transparansi/kontrol** atas pekerjaan SPV.

### 10. Monitor Kinerja & Dashboard Organisasi — *analitik, read-only*
**Fungsi:** memantau **semua pegawai & semua divisi** (keduanya di section Pemantauan),
4 sub-dashboard agregat, termasuk **Matriks 9-Box** (KPI × 360°) & **Matriks 4-Box
A/B/C/D Player** (berbasis Skor Akhir), serta **Papan Pertimbangan Suksesi**.
**Berdampak ke:** tidak mengubah data — dasar **pengambilan keputusan** (promosi, pembinaan).
- Klasifikasi **sefase periode** lewat Panel Filter (KPI, 360°, Skor Akhir dari **periode
  yang dipilih**; default periode aktif).
- Mengikuti flag **360°** periode (dari Kelola Periode, #1): periode tanpa 360° → 9-Box
  disembunyikan & kolom 9-Box jadi **N/A**, kategori **A Player** tidak tersedia (Skor Akhir = 100% KPI).

### 11. Mode Ganda (HRD bertindak sebagai SPV)
**Fungsi:** HRD beralih ke mode SPV.
**Berdampak ke:** HRD bisa **Input KPI** & **ACC Laporan Kinerja Tim** layaknya SPV untuk tim
yang ditugaskan padanya. Di mode ini batasannya mengikuti aturan SPV — termasuk **Input KPI,
Riwayat & Audit, dan Rekapitulasi** yang hanya menampilkan pegawai **divisi HRD-nya sendiri**.

### 12. Log Aktivitas HRD (jejak audit)
**Fungsi:** mencatat **otomatis** setiap aksi sensitif HRD ke jejak **append-only** (tak bisa
diubah/dihapus). **Tidak mengubah data** — alat **akuntabilitas**.
**Berdampak ke:** memberi HRD & **Direksi** rekaman *siapa melakukan apa & kapan* (kunci periode,
ubah bobot, Hitung Ulang 360°, finalisasi, punishment, kelola akun/pemetaan/pertanyaan, dll).
Berguna saat audit/sengketa. Sandi tak pernah dicatat.

---

### Ringkasan rantai dampak

```
Kelola Periode ─┐
Pemetaan ───────┤→ Daftar Penilaian (semua pegawai) → pengisian 360
Kelola Pertanyaan┘                                         │
Kelola Bobot ───────────────────→ Skor 360 ──┐            │
                                   KPI (SPV) ─┴→ Skor Akhir → Monitor/Rekap/Dashboard
Flag Kepatuhan → Punishment (−poin/kuartal) ──┘  │
                                                  │
Review Hasil Akhir → Finalisasi → Laporan Hasil Saya (pegawai) + PDF
Promosi & Penyesuaian → ACC Direksi
```
