# Cara Penggunaan Aplikasi — Infarm 360° Portal

Panduan pengguna aplikasi penilaian kinerja (Performance Appraisal) 360°.
Disusun dari `PANDUAN Infarm 360 Portal.pdf` dan disesuaikan dengan aplikasi saat ini.

> **Versi demo:** data masih contoh (tersimpan di browser/`localStorage`), belum
> tersambung database. Semua user demo memakai password **`Infarm@2026`**.

---

## Login

1. Buka aplikasi (URL Vercel atau `http://localhost:3000` saat lokal).
2. Pilih **Peran**: Employee / SPV / HRD Admin / Direksi.
3. Pilih **Nama / ID Pegawai**.
4. Masukkan **Password**: `Infarm@2026`.
5. Klik masuk ke Workspace.

**Daftar user demo** (semua password sama):

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

## Peran: EMPLOYEE

### Daftar Penilaian Saya
1. Lakukan penilaian 360° sesuai daftar "Rekan Kerja & Evaluasi dalam Daftar Penilaian Anda".
2. Cek kolom **Garis Hubungan** — jika hubungan kerja salah, ajukan **Minta Koreksi**
   dengan alasan, lalu **Kirim Pengajuan**.
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

### Kelola Siklus Periode
1. **Kontrol Aktivasi Siklus**: beri **Label Periode**, set **Tanggal Mulai/Selesai**,
   centang **Aktifkan Angket Evaluasi 360** bila perlu, klik **Aktivasi Periode Penilaian**
   (form 360 di "Daftar Penilaian Saya" jadi aktif).
   - **Kunci & Akhiri Periode** menutup penilaian (tak bisa isi/edit lagi).
2. **Arsip & Riwayat Kuartal**: meninjau riwayat kuartal ber-penilaian 360°.

### Kelola Pertanyaan
- Edit/hapus indikator kuantitatif (rating 1–5) per aspek (hapus = permanen, tak bisa undo).
- **Tambah Indikator Kuantitatif Baru** → "Tambah Indikator ke Aspek".
- **Umpan Balik Kualitatif (Esai Bebas)** untuk pertanyaan kualitatif.

### Kelola Bobot Penilai
- **Model 4-Kelas** (Atasan, Peer, Cross beda bobot) atau **Model 2-Kelas** (Atasan vs Internal).
- Atur via geser/input angka. **Reset Default** atau **Simpan & Terapkan Bobot**.

### Monitoring & Audit KPI
- Memantau input & perubahan KPI yang dilakukan SPV.

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
  Sepasang Relasi Manual** (pilih Penilai + Target → sistem isi Relasi Asosiasi otomatis →
  **Daftarkan Relasi Manual**).
- Tabel jadwal pemetaan bisa dihapus (akomodasi pegawai resign).
- Tinjau **Permohonan Koreksi Garis Hubungan** (setujui/tolak).

### Progress 360 Feedback
- Filter Divisi/Status/Nama; lihat status "Belum / Sudah Lengkap".
- **Kirim Pengingat** ke email pegawai; **Paksa Selesai** untuk penyesuaian manual.

### Monitor Kinerja & Dashboard Organisasi
- Monitor **semua pegawai & semua divisi** (filter divisi/periode/pegawai).
- 4 dashboard: Kompilasi Kinerja Organisasi, Analisis Hasil KPI, Analisis 360 Feedback,
  Tabel Hasil Seluruh Pegawai.

---

## Peran: DIREKSI

- **Daftar Penilaian Saya** — sama seperti Employee (mengisi 360°).
- **Dashboard Eksekutif** — sama dengan Dashboard Organisasi HRD.
- **Monitor Kinerja** — memantau semua pegawai (filter divisi/periode/pegawai).
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

> Catatan demo: sebagian skor (mis. Evaluasi 360 awal) masih nilai contoh statis. Penjelasan
> "dampak" di bawah adalah perilaku yang dirancang; pada versi backend (Supabase) nanti
> perhitungan berjalan penuh dari data nyata.

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
**Fungsi:** mendaftarkan pasangan Penilai → Target + Relasi (Atasan/Peer/Cross/Self).
**Berdampak ke:**
- **Daftar Penilaian Saya** tiap pegawai → menentukan **daftar orang yang wajib ia nilai**.
- Kolom **Garis Hubungan** yang dilihat penilai (sumber "Minta Koreksi").
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
- **Kirim Pengingat** → notifikasi/email ke penilai yang belum selesai.
- **Paksa Selesai** → meng-override status pengisian menjadi selesai (penyesuaian manual),
  sehingga data dianggap lengkap untuk finalisasi.
- Tidak mengubah skor, tapi memengaruhi **kesiapan data** sebelum Review Hasil Akhir.

### 8. Monitoring & Audit KPI — *pengawasan, bukan pengubahan*
**Fungsi:** melihat input & perubahan KPI yang dilakukan SPV (jejak audit).
**Berdampak ke:** tidak mengubah data — alat **transparansi/kontrol** atas pekerjaan SPV.

### 9. Monitor Kinerja & Dashboard Organisasi — *analitik, read-only*
**Fungsi:** memantau **semua pegawai & semua divisi**, 4 dashboard agregat.
**Berdampak ke:** tidak mengubah data — dasar **pengambilan keputusan** (promosi, pembinaan).

### 10. Mode Ganda (HRD bertindak sebagai SPV)
**Fungsi:** HRD beralih ke mode SPV.
**Berdampak ke:** HRD bisa **Input KPI** & **ACC Laporan Kinerja Tim** layaknya SPV untuk tim
yang ditugaskan padanya. Di mode ini batasannya mengikuti aturan SPV.

---

### Ringkasan rantai dampak

```
Kelola Periode ─┐
Pemetaan ───────┤→ Daftar Penilaian (semua pegawai) → pengisian 360
Kelola Pertanyaan┘                                         │
Kelola Bobot ───────────────────→ Skor 360 ──┐            │
                                   KPI (SPV) ─┴→ Skor Akhir → Monitor/Rekap/Dashboard
                                                  │
Review Hasil Akhir → Finalisasi → Laporan Hasil Saya (pegawai) + PDF
Promosi & Penyesuaian → ACC Direksi
```
