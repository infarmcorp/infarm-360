# RENCANA — Infarm 360° Portal

Status terkini, pekerjaan yang masih harus dikerjakan, ide opsional, dan catatan operasional per periode.
Riwayat yang sudah selesai ada di [CHANGELOG.md](CHANGELOG.md). Cara teknis ada di [TEKNIS.md](TEKNIS.md).
Panduan pemakaian ada di [PANDUAN.md](PANDUAN.md).

Tanda: ⬜ belum · 🔄 sebagian · 🔑 butuh tindakan pemilik app (akses dashboard, kredensial, atau keputusan).

---

## 1. Status terkini (per 2026-10-16)

- Aplikasi **live dan dipakai**. Laporan **Q3 2026** sudah **Final** (53 dari 55 pegawai; 2 pegawai tanpa
  laporan) dan email rilis laporan sudah dikirim ke pegawai — semuanya **sebelum** rilis Q3 dipasang.
- Production berjalan dari branch `main`. Sejak 2026-10-16 `main` **dilindungi**: perubahan hanya lewat PR yang
  lulus pemeriksaan otomatis. Setiap PR yang masuk `main` langsung disusul PR "sinkron main → dev".
- **Rilis Q3 sudah di production sejak 2026-10-16** (pemilik memutuskan merge), **setelah** laporan Q3 Final dan
  diumumkan ke pegawai. Isinya:
  - perbaikan audit kode gelombang 1, 2, dan 2b, termasuk **kunci laporan Final** (lihat §2). Berlaku juga untuk
    laporan Q3 yang sudah Final: mengubah datanya harus lewat **Buka Kembali (ke Draf)** per pegawai;
  - nama penilai tidak lagi terkirim ke browser di tampilan HRD;
  - layar **Review Penilaian** sebelum mengirim penilaian;
  - **Mode Maintenance** (belum diaktifkan, lihat §2);
  - filter **Divisi** di Monitoring & Audit KPI;
  - perbaikan halaman Laporan Kinerja Tim dan Monitor, penyeragaman tampilan;
  - 4 PDF panduan dengan nomor versi `2026-10-01` (**apa adanya**, lihat §2).
  Semua perubahan database **0001–0052** terpasang di staging dan production (0048 & 0049 dijalankan pemilik
  2026-10-16).
- Setelah rilis (2026-10-16): huruf **kembali ke font bawaan perangkat** (rilis sempat membuat huruf rancangan
  Montserrat termuat sehingga teks melebar) dan pemberitahuan "Aplikasi baru saja diperbarui" pindah ke atas tengah.
- Langkah uji tambahan rilis (bagian 16–21 [UJI-RILIS-Q3.md](UJI-RILIS-Q3.md)) **belum dijalankan**. Kini diuji
  di Preview `dev` (isinya sama dengan production, memakai database staging).
- 🔑 Pesan perubahan untuk HRD **belum dikirim**: [PESAN-HRD-RILIS-Q3.md](PESAN-HRD-RILIS-Q3.md). Tidak mendesak
  (Q3 sudah Final), tetapi sebaiknya sebelum HRD perlu mengoreksi laporan Q3 atau memulai siklus Q4.
- **Sudah langsung di production sebelum rilis Q3** (dirilis lebih awal, keputusan pemilik):
  - 2026-10-13: **Impor Ringkasan dari Excel** dan **format ringkasan** (tebal/poin). Belum dicoba dengan data nyata.
  - 2026-10-14: **Unduh PDF pegawai membuka folder Google Drive** (Folder Laporan).
  - 2026-10-15: **ukuran tabel tetap**, **Email Rilis Laporan**, **kokpit Review & Finalisasi 3 langkah**.
  - 2026-10-16: tombol Finalisasi yang nonaktif **menyebut sebabnya**, **pesan bila aksi gagal tersimpan**
    (dan nama pegawai di log finalisasi massal), **Riwayat Laporan**.
  - Perubahan database **0050, 0051, 0052** sudah terpasang di **staging dan production** (2026-10-16).
  - Fitur 15–16 Oktober **belum diuji di staging**; sudah berjalan di production.
- **Uji rilis Q3 dijalankan 2026-10-15** di database staging: 53 langkah lulus, 0 gagal.

---

## 2. Harus dikerjakan

### Rilis & operasional
- 🔄 **Revisi 4 PDF panduan (belum prioritas).** Keputusan pemilik 2026-10-16: 4 PDF dan nomor versinya
  (`2026-10-01`) **ikut rilis Q3 apa adanya**. Akibatnya tanda "BARU" muncul walau isinya masih sama dengan versi
  30 Juli (masih ada "Review Hasil Akhir", "punishment", "4 karakter", salah ketik "ditHRD"). Revisi menyusul:
  sunting dokumen Word sumber sesuai [panduan/REVISI-PANDUAN-PDF.md](panduan/REVISI-PANDUAN-PDF.md) (bagian 0–4
  dan 6), ekspor ulang, naikkan nomor versi, lalu rilis. Langkahnya di [TEKNIS.md](TEKNIS.md) §9.
- 🔑🔄 **Rilis Q3** — sudah di production (2026-10-16), 0048 & 0049 terpasang. Sisa:
  - 🔑 kirim [PESAN-HRD-RILIS-Q3.md](PESAN-HRD-RILIS-Q3.md) ke HRD (dan bagian untuk SPV/Koordinator & pegawai);
  - 🔑 jalankan bagian 16–21 [UJI-RILIS-Q3.md](UJI-RILIS-Q3.md) di Preview `dev` (staging);
  - setelah selesai: hapus UJI-RILIS-Q3.md dan PESAN-HRD-RILIS-Q3.md, catat hasilnya di CHANGELOG.
- 🔑⬜ **Aktifkan Mode Maintenance.** Langkah A–C di [TEKNIS.md](TEKNIS.md) §3.3:
  - ✅ A. Rilis Q3 (`dev` → `main`) — 2026-10-16.
  - ⬜ B. Siapkan saklar di dashboard Vercel dan kode rahasia developer, lalu deploy ulang sekali.
  - ⬜ C. Uji coba sekali di luar jam pengisian penilaian.
  - Setelah A–C beres, langkah D dipakai setiap kali perlu maintenance.
- 🔄 **Layar "Review Penilaian" sebelum kirim** — sudah di production (2026-10-16) dan tercatat di
  [PANDUAN.md](PANDUAN.md) §2.2. Sisa: uji di staging dan HP (bagian 19 UJI-RILIS-Q3).
- 🔑🔄 **Folder Laporan (Drive).** Perubahan database **0050** sudah terpasang di staging dan production
  (2026-10-16) dan kodenya sudah di production. Sisa: HRD menyiapkan folder + berbagi per pegawai dan mengisi
  tautannya (SOP di [PANDUAN.md](PANDUAN.md) §5.1). Tanpa tautan, pegawai melihat "PDF belum tersedia".
- ✅ **Riwayat Laporan** — perubahan database **0052** terpasang di staging dan production (2026-10-16). Setiap
  perubahan ACC, status, dan Skor Akhir sejak itu tercatat dan bisa dilihat HRD di panel Riwayat Laporan.
  Dipakai mulai kuartal berikutnya; kejadian sebelum 0052 tidak ditampilkan (keputusan pemilik 2026-10-16).
- 🔑🔄 **Email Rilis Laporan.** Perubahan database **0051** terpasang di staging dan production (2026-10-16).
  Sisa, per periode: unggah dua gambar pendamping di dialog Email Rilis Laporan, kirim uji ke email sendiri, baru
  kirim ke pegawai (SOP di [PANDUAN.md](PANDUAN.md) §5.9). Butuh tautan folder tiap pegawai terisi.
- ✅ **Perubahan database production** — 0001–0052 terpasang di staging dan production (dicek pemilik
  2026-10-16 dengan `scripts/check-migrations.sql`).

### Keamanan
- 🔑⬜ **Ganti kunci rahasia database** (kunci admin Supabase dan lainnya) sebelum produksi penuh. Kunci admin
  bisa membuka seluruh data; bila pernah dibagikan saat pengembangan, anggap bocor. **Ditunda** sampai ada
  waktu sepi (luar jam kerja atau akhir periode), agar pengguna yang sedang login tidak terputus.
- ✅ **Lindungi branch `main` di GitHub** — aktif 2026-10-16: perubahan ke production wajib lewat PR dengan
  pemeriksaan otomatis yang lulus.
- 🔑🔄 **Cadangan data di luar laptop.** Backup otomatis harian sudah berjalan. Sisa:
  - salin hasil backup manual ke Google Drive atau hard disk eksternal (aturan 3-2-1: backup di laptop saja
    = satu titik gagal);
  - tiap akhir kuartal, unduh file backup terenkripsi dari GitHub (hanya disimpan 30 hari) ke Drive tim;
  - ulangi backup manual di akhir periode dan sebelum perubahan database/reset.
- 🔄 **Izin HRD saat pegawai pindah divisi** — sudah di production (audit gelombang 2): Ubah Pegawai menolak
  memindahkan pemegang izin HRD ke luar divisi HRD sampai izinnya dicabut. 🔑 Sisa: cek apakah sekarang sudah ada
  pemegang izin HRD di luar divisi HRD-GA (bila ada, cabut manual).
- ✅ **SPV yang juga punya izin HRD** (temuan audit no. 11) — **ditutup 2026-10-14**: dicek di production, tidak
  ada SPV ber-izin HRD (hanya satu pegawai berposisi Pegawai di HRD-GA yang punya izin HRD). Masalah "SPV tak bisa
  memfinalisasi di Mode Admin" tidak berlaku.
- 🔄 **Gelombang 3: detail laporan kini mengikuti mode** (sisa temuan no. 11) — sudah di `dev` (2026-10-16), belum
  di production. Pegawai ber-izin HRD di mode posisi-asli tak lagi mendapat tampilan HRD penuh; muncul pesan
  "hanya tersedia di Mode Admin". Koordinator ber-izin HRD di mode posisi-asli mendapat tampilan Koordinator.
  🔑 Sisa: uji di Preview `dev` dengan akun pemegang izin HRD berposisi Pegawai (mode posisi-asli vs Mode Admin).
- ✅ **Laporan diri sendiri untuk pemegang izin HRD** — **diputuskan** (pemilik, 2026-10-16), dicatat di CLAUDE.md
  sebagai **risiko yang diterima secara sadar**:
  - HRD mengurus laporannya sendiri (meringkas, merilis, **memfinalisasi**), karena tidak ada orang lain yang
    mengurus laporan HRD admin. Komentar mentah (anonim) di laporannya sendiri **tetap tampil**. Tidak ada rencana
    menolak HRD memfinalisasi laporannya sendiri.
  - Aturan database yang melarang membaca penilaian atas diri sendiri **tidak** dibuat.
  - Nama penilai **tidak lagi terkirim ke browser** di tampilan HRD mana pun (di production sejak 2026-10-16).
    Tampilan tak berubah.
  - Tetap berlaku: pemegang akses Review non-HRD tidak bisa mengubah atau memfinalisasi laporannya sendiri, dan
    tidak ada yang bisa meng-ACC laporannya sendiri.
- Catatan (risiko rendah): batas "HRD hanya menginput KPI divisinya sendiri" hanya dijaga aplikasi, tidak
  dikunci di database. Pengguna tetap tidak bisa menulis KPI langsung ke database.

### Keandalan data
- ✅ **Skor 360° di Ekspor** (2026-10-16): Rekap (file Kinerja Lengkap) tetap memakai Skor 360° resmi, sama dengan
  Dashboard dan laporan. Ringkasan per Pegawai (file Penilaian 360° Lengkap) yang menghitung langsung kini juga
  menampilkan Skor 360° resmi, potongan telat, dan selisihnya. Rencana lama "Rekap ikut menghitung langsung"
  dibatalkan: Rekap jadi berbeda dari Dashboard/laporan dan akan menghitung ulang skor Q1 hasil impor.
- 🔑🔄 **Cek tampilan di browser dengan data asli**: Monitor Kinerja (SPV, Koordinator, HRD), Dashboard
  Organisasi (diagram lingkaran, peta warna, scatter), dan peta warna aspek 360° Q1 2026.
- ⬜ **Pengecekan sebelum finalisasi periode:**
  - Jangan finalisasi sebelum pengisian 360° cukup (cek Progress 360, dorong lewat pengingat).
  - Cek beberapa Skor Akhir pegawai nyata: 50% KPI + 50% Skor 360° (potongan telat sudah di dalam Skor 360°).
  - Saat mengaktifkan periode baru sementara periode lama belum tuntas, pastikan peringatan muncul.
  - Jalankan uji beban di staging sebelum dibuka ke ~100 pengguna ([TEKNIS.md](TEKNIS.md) §7.5).
  - Laporan "layar kosong di HP" belum dikejar. Dugaan: perangkat (jam/tanggal HP salah sehingga sertifikat
    HTTPS gagal, atau jaringan), bukan aplikasi.
- ✅ **Perbaikan audit kode gelombang 2** — di production sejak 2026-10-16: grafik Dashboard/Monitor memakai
  golongan yang sama dengan laporan, daftar tugas HRD dan Monitor tak lagi terpotong di 1.000 baris, ekspor menolak
  membuat file tidak lengkap, dan tes baru untuk hitung ulang Skor 360°, potongan telat, finalisasi, periode, dan
  akses. Uji manual **lulus** 2026-10-15.
- 🔑🔄 **Kunci laporan Final + perbaikan audit gelombang 2b** — **di production sejak 2026-10-16**, setelah
  laporan Q3 Final (sesuai rencana). Isinya: laporan Final terkunci sampai HRD menekan "Buka Kembali (ke Draf)";
  pengaman Q1 2026 kini menolak bila gagal dibaca dan juga melindungi potongan telat; finalisasi massal hanya
  menghitung yang benar-benar tersimpan; HRD tak bisa memberi akses halaman ke dirinya sendiri; batalkan/pulihkan
  penilaian memberi peringatan bila skor gagal diperbarui; ACC hanya untuk anggota tim/divisi sendiri dan bukan
  laporan sendiri. Sisa:
  - ✅ migrasi **0048** dan **0049** terpasang di staging (2026-10-14) dan production (2026-10-16);
  - ✅ uji manual **lulus** 2026-10-15 (53 langkah, 0 gagal; hasil di [UJI-RILIS-Q3.md](UJI-RILIS-Q3.md)). Data
    uji di staging sudah dikembalikan;
  - 🔑 sampaikan perilaku baru ke HRD (sudah berlaku), termasuk: **Skor Akhir bisa berubah saat laporan
    dibuka kembali lalu difinalisasi ulang**, karena potongan telat yang masih tertunda ikut diterapkan (di uji:
    74,00 → 72,50), dan **KPI pegawai Final terkunci** untuk SPV/Koordinator. Pesan siap kirim:
    [PESAN-HRD-RILIS-Q3.md](PESAN-HRD-RILIS-Q3.md);
  - catatan: Ubah deadline & cron melewati pegawai Final tanpa menyebut jumlahnya (proses otomatis).
- 🔄 **Gelombang 3 (kecil): pesan di Manajemen Akses** — sudah di `dev` (2026-10-16), belum di production. Pesan
  berhasil kini tetap terlihat setelah panel tertutup (per peran dan per pegawai), dan jumlah penerima per peran
  tidak lagi menghitung pemberi akses sendiri (mis. "50 Pegawai (Anda sendiri tidak termasuk)"). 🔑 Sisa: uji di
  Preview `dev`.
- ⬜ **Gelombang 3: hapus tombol "Perbarui Laporan Final yang Berubah"** (Finalisasi Ulang Laporan Berubah) setelah
  jumlah laporan berlabel "berubah → N" = 0. Dengan kunci laporan Final, label itu tak akan muncul lagi; tombol
  sementara dipertahankan hanya untuk merapikan selisih lama (keputusan 2026-10-12).
- ⬜ **Rapikan temuan lint** (`npm run lint` kembali jalan, 2026-10-12): 49 temuan lama (34 error, 15 peringatan),
  terutama pola React (setState di effect, komponen dibuat saat render), teks tanpa escape, dan variabel tak
  terpakai. Belum dimasukkan ke CI — masukkan setelah bersih.
- ✅ **Cek dampak bug potongan telat ke 0** — **ditutup 2026-10-14**: query cek dampak dijalankan di production,
  hasilnya kosong. Tidak ada pegawai yang terdampak.

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
