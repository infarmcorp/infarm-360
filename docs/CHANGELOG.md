# CHANGELOG — Infarm 360° Portal

Catatan apa yang berubah dan **mengapa**, urut dari yang terbaru. Aturan yang berlaku sekarang ada di
[PANDUAN.md](PANDUAN.md) (untuk pengguna) dan [TEKNIS.md](TEKNIS.md) / CLAUDE.md (untuk developer).
Daftar perubahan database bernomor ada di [TEKNIS.md](TEKNIS.md) §6. Rincian per baris kode ada di riwayat git.

---

## Oktober 2026

### 2026-10-14 (di `dev`, belum di production)
- **"Unduh PDF" pegawai membuka folder Google Drive** (permintaan pengguna). PDF hasil cetak aplikasi kurang rapi
  dibanding PDF yang disusun HRD. Kini HRD menyimpan tautan **satu folder Drive per pegawai** di Kelola Pegawai.
  Folder itu dipakai terus untuk semua kuartal (isi mis. *Nama - Q3 2026*). Tombol **Unduh PDF** di Laporan Hasil
  Saya membuka folder tersebut. Keputusan pengguna:
  - satu folder per pegawai, bukan per periode, dan tautan diisi lewat Kelola Pegawai (bukan impor Excel);
  - pegawai hanya bisa melihat dan mengunduh, diatur dengan berbagi **Pelihat** dan akses **Dibatasi** di Drive;
  - bila tautan belum diisi, tombol menampilkan "PDF belum tersedia, hubungi HRD".
  Tautan hanya dikirim ke pemiliknya, dan hanya bila ia sudah punya laporan Final. Tombol Unduh PDF di laporan
  yang dibuka HRD/SPV/Direksi tetap mencetak dari aplikasi. Isi PDF di Drive tidak diperiksa aplikasi, jadi HRD
  wajib memastikan tak ada nama penilai dan PDF diganti bila laporan dibuka kembali.

### 2026-10-13 (langsung ke production atas permintaan pengguna, lalu digabung ke `dev`)
- **Impor Ringkasan dari Excel** di halaman Review & Finalisasi (permintaan pengguna). Ringkasan aspek dan
  ringkasan pertanyaan kualitatif banyak pegawai bisa diisi sekaligus dari Excel, tidak perlu diketik satu per
  satu di tiap laporan. Formatnya sama dengan lembar Ringkasan Naratif di Ekspor, jadi bisa unduh, sunting,
  lalu unggah lagi. Keputusan pengguna:
  - isi file **menimpa** ringkasan jenis yang sama, dan item yang tidak tercantum terhapus;
  - sel kosong dilewati (isi lama tetap);
  - boleh dipakai HRD dan penerima akses Review & Finalisasi (Meringkas/Finalisasi), sesuai lingkupnya.
  Pengaman tambahan: baris bermasalah memblokir baris lain milik pegawai dan jenis yang sama, supaya salah ketik
  nama aspek tidak menghapus ringkasan yang benar. Laporan Final tidak diubah, skor tidak tersentuh.
- **Ringkasan tampil rapi** (permintaan pengguna, mengikuti contoh laporan PDF): huruf tebal, poin berindentasi,
  dan paragraf, dengan tanda sederhana di teks (`**tebal**`, baris diawali `- ` atau `* ` = poin). Berlaku untuk
  hasil impor maupun ketikan, di layar dan di PDF. Ringkasan lama tanpa tanda tampil seperti dulu. Skor dan label
  kategori di judul aspek sengaja tidak ditambahkan (keputusan pengguna: teks saja).

### 2026-10-12 (di `dev`, belum di production)
- **Laporan Final kini terkunci** (keputusan pemilik; dirilis ke production setelah finalisasi Q3). Dulu, setelah
  laporan Final, rerata KPI, Skor 360°, dan skor aspek di laporan masih bisa bergeser bila ada yang mengubah data,
  sementara Skor Akhir tetap angka lama. Kini, selama laporan seorang pegawai Final, data yang memengaruhi
  laporannya tidak bisa diubah sampai HRD menekan **Buka Kembali (ke Draf)** (dulu "Kembalikan ke Draf"):
  - ditolak dengan pesan: input/edit/impor/hapus KPI (juga bila bulannya dipakai periode lain tempat pegawai itu
    Final), penilaian 360° untuknya (kirim/kirim ulang), Paksa Selesai, Batalkan/Pulihkan Validitas, koreksi
    relasi/tambah penilai, potongan telat & bobot khususnya, serta finalisasi ulang tanpa membuka kembali;
  - dilewati dan dihitung jumlahnya: Hitung Ulang Skor 360° dan Terapkan Potongan (termasuk penerapan otomatis);
  - terkunci untuk seluruh periode begitu ada satu laporan Final: bobot periode, pertanyaan & indikator,
    hidup/matikan 360° periode, dan hapus periode.
  Konfirmasi Buka Kembali menjelaskan bahwa ACC SPV/Direksi dihapus dan perlu diulang, dan pegawai tidak bisa
  melihat laporannya selama dibuka kembali. Tombol "Perbarui Laporan Final yang Berubah" dipertahankan sementara
  untuk merapikan selisih lama.
- **Perbaikan audit kode, gelombang 2b:**
  - **Pengaman skor Q1 2026 (hasil impor) lebih ketat**: bila pengecekannya gagal dibaca, perubahan ditolak (dulu
    dianggap boleh), dan potongan telat juga tak lagi bisa mengubah skor periode itu.
  - **ACC hanya untuk yang berhak**: tak seorang pun bisa meng-ACC laporannya sendiri; SPV hanya anggota timnya;
    HRD (Mode SPV) hanya pegawai sedivisi. HRD yang tak punya akses bagian Laporan kini bisa meng-ACC anggota
    divisinya, sama seperti SPV (dulu tidak bisa).
  - **Finalisasi massal jujur**: hanya laporan yang benar-benar tersimpan yang dihitung berhasil; yang gagal
    disebutkan namanya.
  - **Pengaturan Akses**: HRD tak bisa memberi akses halaman ke dirinya sendiri, dan isian izin tak bisa lagi
    salah terbaca.
  - **Batalkan/Pulihkan penilaian** kini memperingatkan bila Skor 360° belum ikut diperbarui, beserta langkahnya.
  - **Aktifkan & Hapus Periode** kini berjalan sekaligus (tidak tertinggal setengah jalan) setelah pembaruan
    database diterapkan; sebelum itu tetap memakai cara lama.
  - Perbaikan kecil: data periode lalu di Dashboard tak lagi berisiko terpotong; input KPI tak lagi membocorkan nama
    pegawai ke pengguna yang tak berwenang; `npm run lint` kembali berjalan (temuannya belum dibersihkan).
- **Perbaikan hasil audit kode, gelombang 2:**
  - **Grafik Dashboard dan Monitor kini memakai golongan skor yang sama dengan laporan.** Dulu pegawai dengan
    rerata KPI tepat di batas (mis. 79,996, tampil 80,00 "Memenuhi" di laporan) masuk irisan "Perlu Peningkatan"
    di diagram lingkaran dan batang distribusi, dan warna badge peringkat bisa tidak cocok dengan labelnya. Angka
    di tooltip dan kartu juga dibulatkan dengan cara yang sama seperti laporan. Laporan, skor tersimpan,
    finalisasi, dan ekspor tidak berubah.
  - **Daftar tugas HRD dan Monitor Kinerja tak lagi terpotong** bila datanya lebih dari 1.000 baris (mis. satu
    divisi besar dengan data KPI bertahun-tahun). Dulu sisanya hilang tanpa peringatan.
  - **Ekspor Excel tidak lagi menghasilkan file yang diam-diam tidak lengkap.** Bila pengambilan data gagal di
    tengah jalan, HRD mendapat pesan "Gagal mengambil data dari database … File tidak dibuat …" dan bisa
    mencoba lagi. Saat normal, isi file sama persis seperti sebelumnya.
  - **Pemegang izin HRD tidak bisa dipindah ke divisi lain** sebelum izinnya dicabut, agar izin HRD tidak
    tertinggal di luar divisi HRD-GA.
  - Tes baru untuk hitung ulang Skor 360°, potongan telat, finalisasi, buka/tutup periode, dan pengaturan akses.
    Beberapa perilaku yang tampak keliru ditemukan dan dicatat di RENCANA (belum diubah).
- **Perbaikan mendesak: potongan telat yang diubah ke 0 kini tersimpan** (dirilis terpisah ke production
  sebelum finalisasi Q3). Dulu, bila HRD sudah menetapkan potongan seorang pegawai (mis. −7) lalu mengubahnya
  menjadi 0 ("dikecualikan"), nilai lama −7 tetap berlaku di Skor 360°, padahal Log Aktivitas mencatat
  "Mengecualikan". Penyebabnya: nilai 0 disimpan tanpa menyertakan kolom nilainya, sehingga database
  mempertahankan angka lama. Kini nilai selalu disimpan, dan Log Aktivitas mencatat angka yang benar-benar
  tersimpan. Pegawai yang terdampak sebelum perbaikan perlu diatur ulang oleh HRD.
- **Perbaikan hasil audit kode, gelombang 1:**
  - **Nama penilai tidak lagi terkirim ke pemegang akses "Review & Finalisasi"** yang bukan HRD. Dulu nama
    penilai memang tidak tampil di layar, tetapi datanya ikut terkirim ke browser dan bisa dibaca lewat alat
    developer. Kini dibuang sebelum dikirim. Tampilan tidak berubah; komentar anonim tetap terlihat.
  - **Email pegawai tidak lagi ada di halaman login.** Halaman login bisa dibuka siapa saja, dan dulu memuat
    email semua pegawai aktif untuk dropdown "Pilih dari daftar". Dropdown tetap sama (nama, divisi, peran);
    email dicari oleh server saat pegawai menekan Masuk. Pesan gagal sengaja dibuat sama untuk semua sebab, agar
    tidak ketahuan apakah nama atau sandinya yang salah. Masuk dengan email manual tidak berubah.
  - **Menu "Monitoring & Audit KPI" langsung membuka Riwayat & Audit.** Dulu selalu jatuh ke Rekapitulasi.
  - Keputusan yang dicatat: pemegang akses Review boleh membaca komentar anonim sejak laporan masih draf (untuk
    menyusun ringkasan aspek); Monitor boleh menampilkan Skor 360° berjalan sebelum laporan dirilis; HRD hanya
    menginput KPI divisinya sendiri dan dirinya; izin HRD hanya untuk pegawai divisi HRD-GA; Progress 360 dan
    Flag Kepatuhan sengaja dipisah.
- **Mode Maintenance.** Halaman "Sedang Maintenance" untuk semua pengguna saat aplikasi dirawat, dinyalakan
  dari dashboard Vercel **tanpa deploy ulang**. Versi pertama memakai pengaturan yang butuh deploy ulang; di hari
  yang sama diganti ke saklar Edge Config. Sengaja tidak bergantung pada database, karena maintenance sering
  terjadi justru saat database dirawat. Hanya berlaku di production (agar versi uji `dev` tidak ikut terkunci).
  Hanya developer yang bisa lolos (lewat tautan rahasia, berlaku 12 jam); HRD pun ikut terkunci.
- **Layar "Review Penilaian" dikembalikan ke `dev`.** Sempat dikeluarkan pada 2026-10-02 untuk disimulasikan ke
  pegawai dulu. Isinya: ringkasan jawaban per aspek sebelum kirim, dengan tombol Edit. Tanpa rata-rata skor.
- **Penyeragaman tampilan tuntas**: Laporan Kinerja Tim, Tinjauan Hasil Akhir Direksi, halaman lupa/perbarui
  sandi, dan tampilan memuat. Keputusan pengguna: kartu ringkasan dan tabel pegawai di **Monitor ikut berubah**
  karena memakai komponen yang sama dengan Laporan Kinerja Tim. Warna label 4-Box dan Trend KPI tetap (dipakai
  juga Dashboard). Grafik Dashboard dan analitik Monitor tetap dibiarkan.
- **Filter Divisi di Monitoring & Audit KPI** untuk HRD dan pemegang akses. Filter menyaring di dalam lingkup
  akses, jadi tidak bisa dipakai menembus batas.
- **Langkah aktivasi "Lupa sandi?" diperbaiki**: email reset dikirim Supabase, jadi pengaturan email harus diisi
  di dashboard Supabase, bukan di Vercel. Diputuskan tetap dorman sampai Reset sandi oleh HRD merepotkan.
- **Tombol "Selanjutnya" macet di iPhone** (laporan 2026-06-26) ditutup karena tidak terulang selama pengisian
  Q3 2026. Bila muncul lagi: dugaan iOS Safari memakai ketukan pertama untuk menutup keyboard; perbaikan kandidat
  = merespons saat jari menyentuh, menutup keyboard lebih dulu, atau bar navigasi menempel.
- **Akses Direksi ke Monitor Kinerja Pegawai** tidak dibuat khusus; cukup diberikan lewat Manajemen Akses.
- **Dokumentasi dirapikan**: 23 file digabung menjadi 6 file inti. Branch lama `feature/review-penilaian` (sudah tercakup di `dev`) dan `docs/rapikan` dihapus.

### 2026-10-05 s.d. 10-08
- **Review & Finalisasi**: tombol Tinjau muncul untuk pegawai yang sudah dinilai walau skornya belum dihitung;
  Direksi tetap tampil walau Skor 360°-nya belum dihitung.
- **"Dinilai oleh" disamakan dengan Progress 360.** Dulu ikut menghitung pasangan nonaktif dan penilaian yang
  dibatalkan, sehingga tertulis "9/10" padahal Progress sudah 100%. Kini pasangan nonaktif tidak dihitung
  (kecuali pegawai yang dinilai sendiri sudah nonaktif), dan penilaian yang dibatalkan keluar dari total.
- **Umpan balik asli jadi tabel Rating | Komentar** per pertanyaan. Dulu nilai dan komentar ditampilkan sebagai
  dua daftar terpisah, sehingga nilai ke-n belum tentu milik komentar ke-n.
- **Siapa boleh melihat umpan balik asli (keputusan pengguna):** SPV melihat seluruh pegawai **sedivisi**
  (1 divisi = 1 SPV, koordinator dan timnya selalu sedivisi). Laporan **diri sendiri** tidak memuat umpan balik
  asli, kecuali untuk HRD Mode Admin dan Direksi. Anggota tim koordinator **wajib sedivisi**; anggota lama yang
  beda divisi ditandai untuk dilepas.
- **Ekspor baru "Bahan Laporan per Pegawai"** (3 lembar: Skor, Komentar Aspek, Komentar Esai).
- **Backup harian diperbaiki** (alat pembantu dipasang di folder terpisah karena galat npm).

### 2026-10-01 s.d. 10-02 (dirilis ke production 2026-10-02)
Keputusan HRD 2026-10-01 untuk Q3 2026:
- **4 status penilaian**: Belum Mulai · Sedang Diisi · Selesai – Tepat Waktu · Selesai – Terlambat, dari waktu
  kirim pertama. Paksa Selesai dan periode tanpa deadline dianggap tepat waktu. Tampil di Daftar Penilaian dan
  Progress 360 (kartu, chip, filter, info deadline).
- **"No Score"**: Skor 360° yang belum bisa dihitung tidak lagi tampil sebagai kosong/0.
- **Bobot 2 kelas otomatis** mulai Q3 2026: 40/60 bila penilai internal ≥ 2 orang, 60/40 bila 1 orang, 100%
  bila hanya satu sisi. 4 kelas dan bobot khusus pegawai tidak berubah.
- **HRD Review**: bila KPI **atau** 360° kosong, pegawai tidak lagi dianggap di bawah 80, tetapi berstatus HRD
  Review. Menggantikan kelompok "Data Belum Lengkap (1 Sumbu)" dari 2026-07-16.
- **Fitur Punishment dihapus.** Satu-satunya sanksi kini potongan keterlambatan −3 pada Skor 360° penilai.
  Input poin manual, kolom "Punish.", dan lembar ekspor Punishment dibuang. Tabelnya dibiarkan kosong. Sebagai
  gantinya Review & Finalisasi punya kolom **Potongan**, dan ekspor Kinerja punya lembar **Potongan Keterlambatan**.
- **Pembatalan validitas penilaian** dan **hapus pemetaan berdasar status**: penilaian terkirim tidak boleh
  dihapus; HRD bisa membatalkan validitasnya (disimpan sebagai arsip, tidak dihitung, kewajiban penilai gugur)
  atau memulihkannya. Hapus pemetaan hanya untuk Belum Mulai/Draft dengan alasan wajib.
- **Penilaian terkirim terkunci setelah deadline** (tombol menjadi Lihat). Yang belum terkirim tetap boleh
  dikirim (tercatat terlambat).
- **Tampilan kartu di HP** untuk Daftar Penilaian, dengan progres draf.
- Pemetaan tampil berdampingan; hitungan tenggat sidebar kini menuju **deadline penilaian**; lebar kolom tabel tetap.
- **Panel "Penilaian Ajuan"** di Progress 360. Ajuan tetap Opsional (tidak masuk kartu Wajib) tetapi tetap kena
  potongan. Notifikasi HRD dipisah Wajib vs Ajuan; dulu hitungannya selisih satu dengan kartu Wajib.
- **Persiapan tutup Q3**: Hitung Ulang ditolak bila bobot periode belum disimpan (dulu tertulis "pakai bawaan");
  **pengaman Q1** — skor 360° Q1 hasil impor tidak bisa tertimpa walau periodenya dibuka kembali; notifikasi
  ajuan disetujui dan permohonan diputuskan; **backup otomatis harian terenkripsi** (karena repo publik).
- Perbaikan Kirim Ulang. Layar Review Penilaian ditahan di cabang terpisah menunggu simulasi.

## September 2026

### 2026-09-30 — menutup celah yang hanya bisa dipakai lewat akses langsung ke database
Hasil audit (bukan lewat tombol aplikasi):
- Kirim penilaian diperiksa untuk **semua** indikator aktif, dan ditolak bila ada nilai, bukti (≥ 20 karakter),
  atau esai yang kurang.
- Isi penilaian hanya bisa ditulis saat periode aktif, 360° dibuka, formulir terbuka, dan pasangan aktif.
- Persetujuan permohonan memakai pasangan yang tertulis di permohonan dan diperiksa ulang.
- **Batas akses rekan HRD kini ditegakkan di database untuk perubahan data** (melihat tetap penuh).
- Izin (HRD Admin, bagian HRD, Koordinator) dan akun HRD/Direksi hanya bisa diubah HRD berakses penuh; tak ada
  yang bisa mengubah izin dirinya sendiri.
- ACC hanya di periode aktif dan selalu tercatat. Direksi hanya bisa merespons rencana suksesi yang diajukan.
- KPI pegawai eksternal ditolak. Pertanyaan hanya bisa diubah untuk periode aktif; esai yang sudah dijawab tak bisa dihapus.
- Total bobot = 100 dan aturan penilaian diri dijaga di database.
- Tautan "kembali ke halaman" setelah login tidak bisa diarahkan ke situs lain.
- Pemegang akses Review tidak bisa mengubah/memfinalisasi laporannya sendiri.
- Pemeriksaan keamanan otomatis bertambah 15 menjadi **56**.

### 2026-09-29 — audit besar & penyeragaman
- **Skor Akhir seragam di semua halaman (keputusan HRD).** Dulu dihitung di ±12 tempat dengan aturan berbeda
  (sebagian halaman memakai skor 360° saja bila KPI kosong, sebagian tidak; angka 79,996 tampil "80,00" tetapi
  dikelaskan di bawah 80; Laporan Tim menampilkan angka tersimpan apa pun statusnya). Kini satu rumus, rerata
  KPI dibulatkan hanya di akhir, klasifikasi atas angka terbulat, dan laporan Final selalu menampilkan angka
  tersimpan. Hanya Review & Finalisasi yang menunjukkan selisih. Dicek ke data: tidak ada kategori bergeser.
- **Pembulatan tampilan diperbaiki** (mis. 84,925 dulu tampil "84,92").
- **Trend KPI berdasar jumlah bulan terisi** (definisi HRD): kosong = belum ditetapkan, 0 = nilai sungguhan.
  Aturan lama "dua bulan 0 → Belum terbaca" dihapus. Pengecualian "Belum terbaca" kini juga di tren tahunan,
  distribusi per kuartal, dan mode "semua kuartal".
- **Kerapian 360°:** total bobot wajib 100% (dulu bebas, dan bobot semua 0 membuat pegawai hilang dari hasil);
  bobot khusus pegawai dipakai di semua perhitungan per pegawai (dulu hanya saat Hitung Ulang); tanda "perlu
  hitung ulang" juga menyala saat bobot berubah; skor pegawai yang tak lagi punya penilaian dihapus saat Hitung
  Ulang; galat membaca data kini menghentikan simpan/finalisasi (dulu Skor Akhir diam-diam = 360° saja).
- **ACC tercatat** di Log Aktivitas dan **batal** bila laporan kembali ke draf atau dirilis ulang dengan skor
  berbeda. Finalisasi massal melewati laporan yang skornya berubah sejak di-ACC.
- **Rencana kunci periode permanen dibatalkan** atas permintaan pengguna: periode terkunci tetap boleh dibuka
  kembali; laporan Final aman karena angkanya tidak berubah sendiri.
- Hapus periode kini mencatat jumlah nilai KPI dan jejak audit yang ikut terhapus.
- **Pengetatan akses langsung ke database:** penilaian hanya untuk pasangan aktif (dulu bisa menyuntik nilai
  untuk rekan mana pun); penilai tak bisa menurunkan penilaian terkirim jadi draf; SPV hanya bisa mengubah ACC
  dan hanya setelah rilis; KPI periode terkunci tak bisa diubah; pegawai yang dinilai tak bisa membaca data
  mentah tentang dirinya.
- **Kerahasiaan penilai (keputusan HRD):** siapa menilai siapa hanya untuk HRD. Pegawai tahu siapa yang **ia**
  nilai, bukan siapa yang menilainya. SPV dan Direksi tak lagi membaca pemetaan. **KPI hanya bisa diubah lewat
  aplikasi** (termasuk oleh HRD), dan skor + jejak audit ditulis bersamaan.
- **HRD bisa menetapkan nilai potongan** per pegawai (0 = dikecualikan). **Ajuan ikut potongan** mulai Q3 2026.
  Potongan diterapkan otomatis saat halaman Kepatuhan/Review dibuka dan sebelum simpan/finalisasi. Jadwal
  otomatis untuk potongan sempat dibuat lalu **dinonaktifkan** atas permintaan pengguna.
- **Pilihan N/A dicabut** (perhitungannya perlu divalidasi; data N/A saat itu 0). **Exposure Check dicabut total**.
- **Panduan BARS dengan key point** per nilai.
- **Nama menu disederhanakan:** "Review Hasil Akhir" (HRD) → **Review & Finalisasi**; halaman Direksi →
  **Tinjauan Hasil Akhir**. Tombol Hitung Ulang Skor 360° kini **hanya satu** (di Review & Finalisasi). Tombol
  "Finalisasi Ulang yang Berubah" → **② Perbarui Laporan Final yang Berubah**.
- **Bersih-bersih aturan lama:** flag "Belum self-assessment" dihapus (dulu menandai semua pegawai); pemegang
  akses non-HRD di Progress 360 dan Kepatuhan hanya melihat jumlah.
- Repo GitHub dijadikan **publik**. Daftar revisi isi 4 PDF panduan dibuat.

### 2026-09-18 — deadline penilaian & potongan keterlambatan (keputusan pengguna)
- HRD menetapkan **Deadline 360°**. Formulir **tidak** ditutup otomatis. Tepat waktu/terlambat dilihat dari
  **waktu kirim pertama**, dicatat jam server, karena waktu kirim biasa tertimpa setiap kali penilaian diedit.
- Penilai yang terlambat kena **−3 sekali** pada **Skor 360° miliknya** (bukan per penilaian, bukan Skor Akhir).
  Penilaian yang terlambat tetap dihitung penuh untuk yang dinilai.
- Awal pekerjaan Penilaian Q3 tahap 1–2.

## Agustus 2026
- **Penyeragaman tampilan dimulai** (dari gaya "template dashboard" ke palet resmi): acuan halaman Kelola
  Periode dan sidebar. Warna utama diganti hijau Infarm; huruf Montserrat; angka memakai huruf monospace.
  Halaman diubah bertahap; grafik Dashboard dan analitik Monitor sengaja dibiarkan atas permintaan.
- **Halaman Beranda dihapus** (2026-08-08); alamat utama langsung mengarah ke halaman awal tiap peran.
  Tab **Status Siklus** pindah ke Kelola Periode.
- **Konfirmasi hapus Ad-Hoc** jadi jendela di dalam aplikasi (2026-08-21) — demi konsistensi tampilan, bukan
  pengaman keteledoran.
- Koreksi pemetaan, periode di Laporan Tim, batas input KPI pegawai nonaktif mengikuti tanggal keluarnya.

## Juli 2026

### 2026-07-24 — Manajemen Akses "penerima-dulu" & izin 3 tingkat
- **Alasan:** dulu ada dua tempat memberi akses (akses halaman vs izin peran) dan kata "peran" punya dua arti.
  Kini satu alur: pilih **siapa** (pegawai / peran / halaman) → lihat semua aksesnya → beri/ubah/cabut.
- **Izin 3 tingkat** (Lihat / Meringkas / Finalisasi). Keputusan pengguna: peran "meringkas tanpa finalisasi"
  dipertahankan. Akses edit lama otomatis menjadi Finalisasi agar tidak ada yang diam-diam kehilangan kemampuan.
- **Peninjau Lintas Divisi dipensiunkan** sebagai fitur tersendiri; kini = akses Review & Finalisasi + lingkup
  "Selain divisinya" + Meringkas. Menu "Review Lintas Divisi" dihapus. Finalisasi kini bisa oleh HRD **atau**
  pemegang akses Finalisasi dalam lingkupnya.

### 2026-07-21 s.d. 07-22 — Manajemen Akses tahap lanjut
- Akses Review untuk non-HRD kini bisa **mengedit/memfinalisasi** (ditegakkan server).
- Lingkup **Diri sendiri**; lingkup boleh **lebih dari satu** (membalik keputusan 07-21 yang "pilih satu").
- **Akses per peran** diterapkan ke anggota **saat itu**; pegawai baru **tidak** otomatis ikut (keputusan).
  Sebagai gantinya ada kartu **Pegawai Baru**. Peringatan saat memberi izin edit ke peran luas.
- Lingkup **Tim naungannya** untuk koordinator (per daftar tim, bukan per divisi). "Supervisor" = "SPV".
- Tata letak tiga kolom.

### 2026-07-20
- **Laporan Hasil Saya lintas periode**: laporan Final tetap bisa dibuka setelah periodenya ditutup.
- Hitungan "laporan belum difinalisasi" di dialog Kunci & Akhiri disamakan dengan sidebar (dulu 6 vs 10 karena
  penilai eksternal ikut terhitung).
- **Skor 360° Q1 2026 diimpor ulang dengan presisi tinggi** dari Looker (250 nilai aspek, 50 skor utama,
  1 penilaian baru; 3 pegawai yang belum bergabung saat Q1 sengaja di luar). Backup dibuat sebelumnya.
- **6 nilai KPI dikoreksi langsung di database** atas permintaan (Q1 dan Juni), tercatat di jejak audit.
- Akses Review & Finalisasi untuk non-HRD tahap 1 (lihat saja).
- Ditemukan selisih skor 360° antar-lembar di satu file ekspor (masuk RENCANA).

### 2026-07-17 s.d. 07-20 — akses HRD per bagian & konsol Manajemen Akses
- **Akses HRD per bagian** (diminta 2026-06-30): HRD bisa membatasi rekan HRD ke sebagian halaman admin.
  Kesimpulan diskusi: layak dan tidak membuat aplikasi "terlalu dinamis", karena yang berubah adalah data, bukan
  kode. Kuncinya **katalog bagian tetap** (bukan alamat bebas). Bagian berisi data sensitif tidak cukup hanya
  disembunyikan dari menu.
- **Struktur Organisasi** (bagan & daftar).
- **Konsol Manajemen Akses** dan **akses halaman berlingkup** (pertama: Monitor). Semua kontrol izin pindah dari
  Kelola Pegawai. Prinsip: **menambah**, bukan mengganti akses bawaan; audit = status + riwayat.

### 2026-07-16 s.d. 07-18 — analitik Monitor & Dashboard
- **Monitor Kinerja Pegawai** untuk HRD (filter periode + divisi, selisih divisi vs organisasi).
- **"Penyebab Perubahan"**: perubahan rata-rata dipecah menjadi perubahan skor pegawai yang sama vs pegawai
  masuk/keluar. Pergerakan 360° per aspek.
- **Peta warna + diagram lingkaran aspek/indikator per pegawai** (klik untuk menyaring). Profil aspek tim
  dibanding organisasi. Penataan bagian Ringkasan → Komposisi → Arah → Rincian.
- **Dashboard**: scatter KPI × 360°, distribusi per kuartal, legenda ambang, ambang coaching 85 → 80, tabel
  10 per halaman. Audit kegunaan Monitor & Dashboard ditutup.
- 2026-07-16: **ekspor Log Aktivitas**; tombol **Finalisasi Semua Ber-ACC**; Dashboard memisahkan pegawai
  yang baru punya satu sumbu (kemudian menjadi HRD Review); tes otomatis untuk otorisasi tombol-tombol penting;
  semua alamat email contoh diganti email asli; pengingat email dipastikan berjalan; Hitung Ulang dijalankan
  ulang setelah perbaikan 07-08; backup manual dijalankan.

### 2026-07-15
- **Koordinator bisa meng-ACC dan menginput KPI** pegawai binaannya. SPV kini hanya untuk pegawai tanpa koordinator.
- **SPV, Koordinator, dan Direksi boleh melihat umpan balik asli tanpa nama** (keputusan pengguna). Nama penilai
  tetap tidak pernah ditampilkan. Risiko: pada kelompok penilai sangat kecil, asal komentar bisa tertebak.
  Mudah dibalik bila perlu.
- Log Aktivitas dipaginasi di server (hemat kuota data). Audit KPI menjadi daftar rata terbaru di atas.
- **Izin HRD Admin hanya untuk divisi HRD**; pencabutan boleh untuk siapa pun.
- **Skor 360° Q1 2026 dari penilaian eksternal dimasukkan** agar tampil di Dashboard (50 pegawai). Jangan hitung
  ulang Q1. Dashboard Analisis 360° ditata sejajar.

### 2026-07-12
- **Peran Koordinator** (sebagai izin, bukan peran baru): awalnya hanya melihat Laporan Kinerja Tim binaannya.
  Menambah koordinator = mengubah data, tanpa deploy.
- **Ekspor dirampingkan** jadi 4 file multi-lembar, dan angka kini 2 desimal (dulu 1 desimal memotong nilai).

### 2026-07-10
- **Tanggal masuk/keluar pegawai.** Dashboard memilih anggota per periode berdasarkan masa kerja **atau** adanya
  data, jadi kuartal lampau tetap menampilkan pegawai yang kini sudah keluar.
- **Trend KPI seragam** dan status **"Belum terbaca"** (dikecualikan dari rata-rata, bukan berarti rendah).
- Kartu ringkasan tim bersama Laporan Tim & Monitor; Monitor dirombak jadi dashboard SPV.
- **Skor 360° per aspek kini berbobot** (sama dengan skor utama) dan 2 desimal.

### 2026-07-09
- **Hapus skor KPI dengan alasan wajib**, tercatat di audit.
- **Laporan SPV ditinjau Direksi.** Direksi hanya meninjau laporan SPV (atau pemimpin tim). Baris "Anda" dihapus
  dari Laporan Kinerja Tim; SPV melihat laporannya lewat Laporan Hasil Saya. Kolom KPI dan 360° ditambahkan.
- **Tinjauan Hasil Akhir untuk Direksi** (hanya baca, semua pegawai termasuk draf).
- **Ringkasan Umpan Balik Kualitatif** per pertanyaan esai, terpisah dari ringkasan aspek.

### 2026-07-08
- **Direksi boleh dinilai 360°**: tampil di Review & Ekspor dengan Skor Akhir = Skor 360°; tetap di luar
  Dashboard, 4-Box, KPI, kepatuhan, dan monitor.
- **Bug batas 1.000 baris.** Pengambilan data besar diam-diam terpotong di 1.000 baris tanpa pesan galat.
  Ekspor 360° hanya berisi 1.000 dari ±4.500 baris, dan Hitung Ulang memakai data terpotong sehingga
  **51 dari 52 Skor 360° salah**. Data mentah aman; skor pulih setelah Hitung Ulang. Pelajaran: semua
  pengambilan data yang bisa melebihi 1.000 baris wajib dipecah per halaman. Tanda "skor basi" hanya memeriksa
  waktu, bukan kebenaran angka, sehingga bug ini lolos tanpa tanda.

### 2026-06-30 s.d. 07-01 — aplikasi live
- **Undangan Massal terkirim** (2026-07-01); setiap akun punya sandi unik. Aplikasi resmi dipakai.
- **Keputusan: tidak ada "page-builder"** — HRD hanya bisa memberi akses ke halaman yang sudah ada.
- **Peninjau Lintas Divisi** (kemudian dipensiunkan 07-24).
- **Pegawai nonaktif yang punya data tetap tampil** di halaman pelaporan, agar hasil kuartal pegawai yang resign
  tidak hilang. Di halaman siklus mereka tetap disembunyikan. Pegawai nonaktif tidak bisa dipetakan dan tidak
  menerima email.
- Minta Koreksi untuk baris Ad-Hoc. Matriks 9-Box dihapus dari tampilan (rumus tetap ada). Radar aspek bernomor.
- Ekspor 360° gabungan dan ekspor ringkasan naratif. **Tutup/Buka Form**. **Hapus Periode**. Lampiran PDF
  panduan per peran di email undangan. 6 akun uji dihapus permanen (backup dulu).

## Juni 2026
- **2026-06-25:** skrip backup & pemulihan dibuat dan diuji. Email **Undangan & Info Akun** (sandi acak per orang,
  karena sandi tersimpan satu arah sehingga tak bisa dikirim ulang; saat trial hanya ke `@gmail.com` agar akun
  tanpa email asli tidak terkunci). Email dikirim dalam versi HTML + teks agar tidak masuk spam. Pemeriksaan
  keamanan otomatis 21/21 lolos. Pustaka Excel diperbarui untuk menutup celah keamanan.
  **Keputusan: aplikasi menegakkan kebijakan, bukan menambal kelalaian** — tidak ada penegasan "wajib tekan Kirim".
  Pengingat: tawarkan backup terjadwal saat Q2 berjalan (terwujud 2026-10-02).
- **2026-06-24:** penilai eksternal; perbaikan dropdown nama di HP; semua pemetaan buatan HRD selalu Wajib dan
  Ad-Hoc bisa dihapus pemiliknya; halaman awal pegawai = Daftar Penilaian; perbaikan formulir di HP; email
  pengingat lewat Gmail mulai aktif.
- **2026-06-23:** formulir penilaian diperkuat (simpan otomatis, konfirmasi kirim, layar sukses, **esai wajib**,
  nilai mudah dibaca, rail responsif); banner Garis Hubungan. **Keputusan: semua komentar dan semua esai wajib
  (mutlak).** Periode trial "Q1 2026 - V2" direset untuk demo: penilaian, hasil, dan permohonan dihapus; semua
  relasi dikembalikan ke Peer; pemetaan, aspek, esai, bobot, dan KPI dipertahankan; backup dulu. Catatan
  persiapan demo/trial dan peluncuran Q2 ditulis.
- **2026-06-19:** **izin HRD menjadi izin, bukan jabatan**, dengan mode ganda (login dimulai di mode posisi asli).
  Teks yang terlalu pucat dipergelap dan ukuran minimal 10px (label di dalam grafik dikecualikan agar tidak
  berdesakan). **Keputusan: aksesibilitas tidak didorong sampai dukungan pembaca layar**, karena pengguna tidak
  membutuhkannya.
- **Sebelumnya:** perpindahan dari aplikasi lama ke versi baru dengan database dan login nyata; tahap laporan
  bertahap (Draf → Ditinjau → Final) dan penutupan akses SPV ke data bernama; banner "Skor 360° perlu dihitung
  ulang"; Akun Saya untuk ganti sandi sendiri; konfirmasi di dalam aplikasi; salin pertanyaan dari periode
  sebelumnya; standar KPI per kuartal; peta warna KPI per divisi; indikator tenggat periode; palet warna skor
  terpadu; arsip aplikasi lama dihapus.

---

## Fitur yang dicabut (jangan dihidupkan lagi tanpa keputusan baru)
| Fitur | Dicabut | Pengganti |
|---|---|---|
| Punishment manual pada Skor Akhir | 2026-10-01 | Potongan keterlambatan −3 pada Skor 360° |
| Pilihan N/A | 2026-09-29 | Semua indikator wajib dinilai |
| Exposure Check (tidak layak menilai) | 2026-09-29 | Ajukan Hapus |
| Penambahan rekan Ad-Hoc instan | Q3 2026 | Ajukan Penilaian (persetujuan HRD) |
| Penilaian diri sendiri (Self) | Q3 2026 | — (data lama tetap tampil di laporan lama) |
| Jadwal otomatis potongan | 2026-09-29 (nonaktif) | Diterapkan saat halaman dibuka |
| Peninjau Lintas Divisi tersendiri | 2026-07-24 | Akses halaman Review & Finalisasi berlingkup |
| Halaman Beranda | 2026-08-08 | Halaman awal per peran |
| Matriks 9-Box & Papan Suksesi di dashboard | 2026-06-30 | Rumus 9-Box tetap ada |
| Label Skor Akhir "live" vs "tersimpan" | 2026-09-29 | Satu rumus; Final = angka tersimpan |
| Kunci periode permanen | dibatalkan 2026-09-29 | Periode terkunci boleh dibuka kembali |
