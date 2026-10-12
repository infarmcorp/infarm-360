# RENCANA — Infarm 360° Portal

Status terkini, pekerjaan yang masih harus dikerjakan, ide opsional, dan catatan operasional per periode.
Riwayat yang sudah selesai ada di [CHANGELOG.md](CHANGELOG.md). Cara teknis ada di [TEKNIS.md](TEKNIS.md).
Panduan pemakaian ada di [PANDUAN.md](PANDUAN.md).

Tanda: ⬜ belum · 🔄 sebagian · 🔑 butuh tindakan pemilik app (akses dashboard, kredensial, atau keputusan).

---

## 1. Status terkini (per 2026-10-12)

- Aplikasi **live dan dipakai**. Periode **Q3 2026** berjalan menuju tutup.
- Production berjalan dari branch `main`. Pekerjaan baru ada di branch `dev`.
- Yang **sudah ada di `dev` tetapi belum di production**:
  - perbaikan halaman Laporan Kinerja Tim dan Monitor;
  - layar **Review Penilaian** sebelum mengirim penilaian (lihat §2);
  - **Mode Maintenance** (halaman "Sedang Maintenance" yang bisa dinyalakan tanpa deploy ulang);
  - filter **Divisi** di Monitoring & Audit KPI;
  - penyeragaman tampilan (warna, huruf, tombol) di semua halaman;
  - perapian dokumentasi ini.
- 4 PDF panduan dan nomor versinya (`2026-10-01`) sudah tersimpan di `dev`. **Isinya belum direvisi**: teksnya
  masih sama dengan versi 30 Juli (masih ada "Review Hasil Akhir", "punishment", "4 karakter", salah ketik
  "ditHRD"). Jangan rilis `dev` ke production sebelum PDF benar-benar diperbarui; kalau tidak, tanda "BARU"
  muncul tanpa isi baru.

---

## 2. Harus dikerjakan

### Rilis & operasional
- 🔄 **Revisi 4 PDF panduan.** Sunting dokumen Word sumber sesuai daftar di
  [panduan/REVISI-PANDUAN-PDF.md](panduan/REVISI-PANDUAN-PDF.md) (bagian 0–4 dan 6), ekspor ulang, lalu simpan
  dan rilis. Langkahnya di [TEKNIS.md](TEKNIS.md) §9.
- 🔑⬜ **Aktifkan Mode Maintenance.** Langkah A–C di [TEKNIS.md](TEKNIS.md) §3.3:
  - ⬜ A. Rilis `dev` → `main` (setelah PDF beres) dan tunggu deploy production.
  - ⬜ B. Siapkan saklar di dashboard Vercel dan kode rahasia developer, lalu deploy ulang sekali.
  - ⬜ C. Uji coba sekali di luar jam pengisian penilaian.
  - Setelah A–C beres, langkah D dipakai setiap kali perlu maintenance.
- 🔄 **Layar "Review Penilaian" sebelum kirim.** Bila semua pertanyaan sudah lengkap, tombol utama formulir
  menjadi **Review Penilaian**. Layar ini menampilkan ringkasan jawaban per aspek (nilai dan key point,
  bukti perilaku bisa dibuka), jawaban esai, dan tombol **Edit** ke pertanyaan terkait. Setelah itu baru
  **Kirim Penilaian** → konfirmasi → sukses. Rata-rata skor tidak ditampilkan. Sisa: uji di staging dan HP
  (termasuk setelah deadline, saat tombolnya menjadi Lihat), lalu rilis ke production. Setelah rilis,
  tambahkan ke [PANDUAN.md](PANDUAN.md) §2.2.
- 🔑⬜ **Pastikan semua perubahan database Q3 2026 sudah terpasang di production** (dan staging). Kode di
  production sudah memakainya. Cara cek dan daftar perubahannya di [TEKNIS.md](TEKNIS.md) §1 dan §6.

### Keamanan
- 🔑⬜ **Ganti kunci rahasia database** (kunci admin Supabase dan lainnya) sebelum produksi penuh. Kunci admin
  bisa membuka seluruh data; bila pernah dibagikan saat pengembangan, anggap bocor. **Ditunda** sampai ada
  waktu sepi (luar jam kerja atau akhir periode), agar pengguna yang sedang login tidak terputus.
- ⬜ **Lindungi branch `main` di GitHub**: perubahan ke production wajib lewat PR dengan pengecekan otomatis
  yang hijau. Sekitar 5 menit di pengaturan GitHub.
- 🔑🔄 **Cadangan data di luar laptop.** Backup otomatis harian sudah berjalan. Sisa:
  - salin hasil backup manual ke Google Drive atau hard disk eksternal (aturan 3-2-1: backup di laptop saja
    = satu titik gagal);
  - tiap akhir kuartal, unduh file backup terenkripsi dari GitHub (hanya disimpan 30 hari) ke Drive tim;
  - ulangi backup manual di akhir periode dan sebelum perubahan database/reset.
- 🔑⬜ **Izin HRD tidak tercabut saat pegawai pindah divisi.** Izin HRD hanya boleh diberikan ke pegawai divisi
  HRD-GA, tetapi bila pemegangnya dipindah ke divisi lain lewat Ubah Pegawai, izinnya tetap melekat. Keputusan
  menyusul: dicabut otomatis, atau HRD diberi peringatan saat memindahkan.
- 🔑⬜ **SPV yang juga punya izin HRD** (temuan audit no. 11). Bila akun seperti ini ada, di Mode Admin ia tetap
  diperlakukan sebagai SPV: dari Review & Finalisasi ia hanya melihat laporan versi SPV, tanpa tombol
  Finalisasi, dan pegawai di luar divisinya tak bisa dibuka. Di Monitoring KPI, tab Riwayat menampilkan seluruh
  organisasi sementara tab lain hanya timnya. **Menunggu cek:** adakah SPV divisi HRD-GA yang diberi izin HRD?
  Bila tidak ada, cukup dicatat.
- Catatan (risiko rendah): batas "HRD hanya menginput KPI divisinya sendiri" hanya dijaga aplikasi, tidak
  dikunci di database. Pengguna tetap tidak bisa menulis KPI langsung ke database.

### Keandalan data
- ⬜ **Seragamkan Skor 360° di Ekspor "Kinerja Lengkap".** Lembar Rekap memakai Skor 360° tersimpan (sesegar
  Hitung Ulang terakhir), sedangkan lembar Penilaian 360° menghitung langsung dari nilai terbaru. Bila ada
  penilaian yang berubah setelah Hitung Ulang, satu file bisa menampilkan angka berbeda. Rencana: Rekap juga
  menghitung langsung dengan rumus resmi, tanpa mengubah skor tersimpan yang dipakai Dashboard/Monitor.
  Dalam praktik, menekan ① Hitung Ulang sebelum ekspor sudah mencegah selisih ini.
- 🔑🔄 **Cek tampilan di browser dengan data asli**: Monitor Kinerja (SPV, Koordinator, HRD), Dashboard
  Organisasi (diagram lingkaran, peta warna, scatter), dan peta warna aspek 360° Q1 2026.
- ⬜ **Pengecekan sebelum finalisasi periode:**
  - Jangan finalisasi sebelum pengisian 360° cukup (cek Progress 360, dorong lewat pengingat).
  - Cek beberapa Skor Akhir pegawai nyata: 50% KPI + 50% Skor 360° (potongan telat sudah di dalam Skor 360°).
  - Saat mengaktifkan periode baru sementara periode lama belum tuntas, pastikan peringatan muncul.
  - Jalankan uji beban di staging sebelum dibuka ke ~100 pengguna ([TEKNIS.md](TEKNIS.md) §7.5).
  - Laporan "layar kosong di HP" belum dikejar. Dugaan: perangkat (jam/tanggal HP salah sehingga sertifikat
    HTTPS gagal, atau jaringan), bukan aplikasi.
- ⬜ **Perbaikan audit kode gelombang 2** (setelah Q3 2026 ditutup, agar angka tidak bergeser di tengah periode):
  - no. 3: kategori skor di grafik Dashboard dan Monitor disamakan dengan laporan untuk pegawai yang skornya tepat
    di batas (mis. 79,996 kini tampil "Memenuhi" di mana-mana);
  - no. 4 dan 6: daftar tugas HRD dan Monitor dibuat aman bila datanya lebih dari 1.000 baris (cek dulu jumlah
    pegawai dan bulan di production);
  - no. 7: ekspor Excel menampilkan pesan gagal bila pengambilan data terputus, bukan menghasilkan file yang
    diam-diam tidak lengkap;
  - no. 10: angka 360° di Monitor setelah laporan dirilis/Final harus sama dengan laporan;
  - menambah tes untuk perhitungan dan finalisasi yang belum teruji (hitung ulang Skor 360°, potongan telat,
    finalisasi massal, buka/tutup periode, pengelolaan akses).

---

## 3. Ide opsional (belum jadi komitmen)

Dipindah ke §2 bila diputuskan dikerjakan.

- **Ringkasan Aspek otomatis dengan AI (Claude).** Tombol "✨ Buat Ringkasan Otomatis" di editor ringkasan HRD:
  nilai dan komentar **tanpa nama penilai** dikirim ke Claude, hasilnya mengisi kotak ringkasan, lalu HRD
  menyunting. Butuh kunci API Claude (hanya di server), aktif lewat saklar, khusus HRD, memakai model termurah
  (Haiku). Perkiraan biaya: ~$0,04 per pegawai → ~$2–4 per kuartal untuk 50–100 pegawai, hanya saat tombol
  ditekan. Privasi: komentar (sudah anonim) dikirim ke Anthropic, disimpan 30 hari, tidak dipakai melatih
  model. Perlu persetujuan kebijakan internal.
- **Pengaman warna otomatis**: pengecekan otomatis yang menolak warna di luar palet resmi agar halaman baru
  tidak kembali ke gaya lama.
- **Tinjau ulang warna grafik** di Dashboard dan bagian analitik Monitor (sengaja dibiarkan atas permintaan).
- **Mode gelap.** Palet sudah mendukung; belum diminta.
- **Ganti email sendiri** di Akun Saya.
- **Email anti-spam permanen**: domain sendiri + layanan Resend.
- **Supabase Pro** (~$25/bulan): backup bawaan dan tanpa jeda otomatis. Bukan soal kapasitas.
- **Aktifkan "Lupa sandi?"** bila Reset sandi oleh HRD mulai merepotkan ([TEKNIS.md](TEKNIS.md) §3.2).
- **Jadwal otomatis potongan keterlambatan** (dinonaktifkan; kini diterapkan saat halaman dibuka).
- **Koordinator dari relasi Atasan**: bila kelak banyak koordinator, daftar binaan bisa diturunkan dari relasi
  "Atasan" di Pemetaan agar HRD tidak mengisi dua kali (tanpa efek ke skor).
- **Kolom jabatan spesifik** (mis. "Koordinator Gudang").
- **Pengetatan lanjutan akses**: rekan HRD terbatas saat ini masih bisa *melihat* semua data; batas baca per
  bagian/divisi di tingkat database belum dibuat.

---

## 4. Catatan operasional periode

### Pengumuman ke pegawai (template)
1. Tautan aplikasi dan siapa yang dihubungi bila lupa email/sandi. Sandi dikirim lewat email **Undangan & Info
   Akun**; segera ganti lewat **Akun Saya**.
2. Anda menilai N orang. Kerjakan semua sampai muncul **layar sukses** untuk tiap orang.
3. Wajib: semua nilai + **bukti perilaku minimal 20 karakter** + semua esai, baru bisa dikirim.
4. Selesaikan sebelum **deadline**. Terlambat = Skor 360° Anda dipotong 3 poin. Ajuan yang disetujui juga wajib.
5. Relasi terasa keliru? Pakai **Minta Koreksi**. Tidak seharusnya menilai seseorang? **Ajukan Hapus**.
6. Isian tersimpan otomatis — boleh berhenti dan lanjut nanti.
7. Tidak bisa kirim? Cek tab **Umpan Balik Kualitatif** (mungkin esai belum diisi).
8. Isi sesuai gelombang/jam divisi.

Komunikasikan juga ke HRD dan SPV langkah **Rilis ke SPV** dan arti ACC (tidak menghambat finalisasi).

### Sebar beban pengisian
Jangan beri jam tenggat yang sama untuk semua orang. Sebar per divisi/gelombang (mis. Sales pagi, Supply Chain
siang, Finance & HRD sore) atau beri rentang ("kapan saja hari ini sampai 16.00"). Kirim pengingat harian
"sisa N penilaian". Simpan otomatis membuat pengisian bertahap aman.

### Kapasitas
Profil Q2 2026: 55 pegawai aktif, ±600 pasangan penilaian, 7 hari, ±13.000 karakter per penilaian.
Total ±7,6 MB teks, ±8.400 baris, ±15–25 MB termasuk indeks = **3–5% dari 500 MB** paket gratis. Konkurensi
dan lalu lintas jauh di bawah batas. **Paket gratis cukup.** Volume ditentukan jumlah pasangan, bukan jumlah
pegawai. Risiko nyata adalah **beban per penilai**: rata-rata ±11 penilaian per orang, ada yang sampai 20
(±260.000 karakter dalam 7 hari). Andalkan simpan otomatis, penyebaran beban, pengingat, dan potongan
keterlambatan.

### Sebelum kirim massal ke kelompok baru
Uji dulu undangan ke 2–3 orang (mis. saat pertama kali mengirim ke alamat selain `@gmail.com`), baru kirim massal.

### Setelah deadline
Ikuti [PANDUAN.md](PANDUAN.md) §9.3 bagian "Setelah deadline".

### Hal yang perlu diingat
- **Jangan Hitung Ulang Skor 360° untuk Q1 2026.** Skornya hasil impor dari sumber luar (sistem sudah
  menolaknya).
- Simpan data di "file lokal" tidak cocok: aplikasi berjalan di server tanpa penyimpanan tetap, dan data dari
  banyak HP harus berkumpul di satu database pusat. Pilihan keandalan di [TEKNIS.md](TEKNIS.md) §8.5.
