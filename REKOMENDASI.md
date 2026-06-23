# REKOMENDASI — Persiapan Demo, Trial & Peluncuran Q2

Catatan operasional & perencanaan (bukan teknis-kode). Sumber: diskusi 2026-06-23 menjelang
demo/trial penilaian pegawai dan peluncuran Q2. Untuk perubahan kode lihat **CLAUDE.md**;
untuk panduan pemakaian lihat **CARA-PENGGUNAAN.md**.

---

## 1. Status kesiapan aplikasi

- **Aplikasi inti: ~95% siap.** Alur penilaian (login → isi → auto-simpan → validasi wajib →
  Kirim → konfirmasi → layar sukses → pengingat sisa) sudah teruji di **localhost & URL produksi**.
- **Untuk demo/trial: ~90–94%.** Sisanya **operasional** (stagger, distribusi kredensial, kualitas
  demo), bukan kesiapan aplikasi.
- **Isu "blank di HP"** = masalah **perangkat tertentu** (jam/tanggal HP salah → sertifikat HTTPS
  gagal, atau jaringan), **bukan aplikasi** — HP lain bisa membuka. Bukan penghalang.

---

## 2. Persiapan sebelum membagikan ke pegawai

### a. Brief / pengumuman pegawai (template siap-tempel)
Sampaikan saat demo + saat membagikan link:

1. **Link aplikasi** + cara tahu **email login** Anda (siapa dihubungi bila lupa) — sandi awal
   bersama; **segera ganti** lewat **Akun Saya**.
2. **Anda menilai N orang** — kerjakan **semua** sampai muncul **layar sukses** tiap orang.
3. **Wajib:** semua **rating + komentar (min 4 karakter) + semua esai** terisi baru bisa Kirim.
4. **Coba minimal sekali tombol "Minta Koreksi"** bila relasi terasa keliru (bagian yang diuji;
   abaikan bila relasi sudah benar).
5. Isian **tersimpan otomatis** — boleh berhenti & lanjut nanti.
6. Bila **tidak bisa Kirim**, cek tab **"Umpan Balik Kualitatif"** (mungkin esai belum diisi).
7. **Isi bertahap** sesuai gelombang/jam divisi (lihat stagger di bawah).

### b. Checklist uji asap produksi (jalankan setelah deploy, ~5–10 menit, di HP + laptop)
1. Login → Daftar Penilaian tampil target + kartu "Wajib 0/Y" + banner Garis Hubungan.
2. Mulai Nilai → rail bisa di-geser di HP; rating tampil "Pilihan Anda: N · Label".
3. Isi 1 indikator → tunggu ~5 detik → "Tersimpan otomatis ✓" → refresh → isian tetap ada.
4. Isi semua rating+komentar, **biarkan esai kosong** → Kirim **ditolak**, lompat ke Kualitatif.
5. Isi esai → progres penuh → Kirim → konfirmasi → layar sukses + "masih ada N lagi".
6. Kembali ke Daftar → kartu wajib bertambah; coba **Minta Koreksi**; coba **Akun Saya** ganti sandi.

### c. Tes kredensial ke 2–3 orang dulu sebelum kirim massal (pastikan email/sandi & login benar).

---

## 3. Stagger pengisian (penentu beban terbesar)

Jangan beri "deadline jam yang sama untuk semua". Sebar beban:
- **Per divisi/gelombang** (mis. Sales pagi, Supply Chain siang, Finance & HRD sore), atau
- **Rentang waktu** ("isi kapan saja hari ini s.d. jam 16:00") — pengisian menyebar alami.
- **Pengingat harian** "sisa N penilaian" mendorong yang bertugas banyak agar tuntas.

Auto-simpan sudah mendukung berhenti & lanjut, jadi pengisian bertahap aman.

---

## 4. Kapasitas untuk peluncuran Q2

**Profil Q2:** 55 pegawai aktif · **600 pasang penilaian** total · rentang **7 hari** · 1 penilaian
≈ 13.000 karakter (10 komentar + 3 esai, tiap field bisa s.d. ~1.000 char).

| Besaran | Nilai | Verdict |
|---|---|---|
| Total teks | 600 × 13 KB ≈ **~7,6 MB** | — |
| Baris DB | ~8.400 (header+skor+esai) | — |
| Footprint DB + indeks | **~15–25 MB** = **~3–5% dari 500 MB free** | ✅ Aman |
| Konkurensi | ~55 penilai, tersebar 7 hari → puncak ringan | ✅ Aman |
| Egress | jauh di bawah 5 GB/bulan | ✅ Aman |

**Kesimpulan: Supabase free-tier MAMPU menghimpun seluruh data Q2** — baik storage maupun
konkurensi. Kekhawatiran "tak bisa menghimpun" tidak berdasar dari sisi data (volume ditentukan
**jumlah pasangan**, bukan jumlah pegawai).

### Beban per penilai (risiko nyata, bukan kapasitas)
Rata-rata 600 ÷ 55 ≈ **~11 penilaian/orang** (rentang 10–20). Yang kebagian **20** menulis
~**260.000 karakter** dalam 7 hari. Dengan aturan **semua wajib**, ini beban berat → andalkan
**auto-simpan**, **stagger**, **pengingat**, dan **enforcement punishment** untuk yang tak selesai.

> **Keputusan terkunci:** aturan **semua komentar + semua esai WAJIB** bersifat **mutlak**
> (kebijakan penilaian). Tidak dilonggarkan. Ketidakselesaian ditangani lewat **punishment**.

---

## 5. Penyimpanan & cadangan data

### "Bisakah simpan ke file lokal?" — Tidak cocok
Aplikasi jalan di **Vercel (serverless)** yang **tak punya disk permanen** (filesystem sementara,
terhapus tiap pemanggilan, tak dibagi antar-instance). Data dari banyak HP harus berkumpul di
**satu tempat terpusat** — peran itu **justru dijalankan Supabase**. "File lokal" hanya ada di satu
perangkat → tak bisa menghimpun dari banyak orang. Menggantinya = menghilangkan fungsi inti.

### Pilihan keandalan (urut rekomendasi)
1. **Tetap Supabase free + ekspor Excel harian sebagai cadangan** — gratis, sudah ada di
   `/admin/ekspor` (dataset kuantitatif + kualitatif + rekap). Data tak pernah hanya di satu tempat.
2. **Supabase Pro (~$25/bln)** — **opsional**; bukan untuk kapasitas (free cukup), tapi untuk
   **backup otomatis** + tanpa auto-pause + headroom compute. Pertimbangkan untuk **data Q2 asli**
   (bukan disposable) demi keandalan & pemulihan.
3. **Self-host Postgres (VPS)** — kontrol penuh tapi beban operasional besar; tetap DB terpusat,
   bukan "file lokal".

**Untuk Q2:** free-tier + **ekspor harian** sudah memadai; Pro hanya bila ingin backup otomatis.

---

## 6. Checklist HRD pasca-deadline (enforcement & finalisasi)

1. **Progress 360** → identifikasi pegawai yang **belum selesai** (berbasis Wajib).
2. **Flag Kepatuhan / Punishment** → terapkan poin ke yang tak selesai (mengurangi Skor Akhir).
   *Aplikasi tidak menghukum otomatis — HRD yang menetapkan.*
3. **Pemetaan → Koreksi Relasi** → proses ACC permohonan koreksi (bisa banyak, karena pegawai
   diminta cek relasi).
4. Setelah koreksi di-ACC → **Bobot & Kalkulasi → "Hitung Ulang Skor 360°"** (banner "skor basi"
   mengingatkan bila ada perubahan setelah hitung terakhir).
5. **Review Hasil Akhir** → Simpan Draf → **Rilis ke SPV** → **Finalisasi** (lihat alur visibilitas
   bertahap di CARA-PENGGUNAAN.md).

---

## 7. Catatan reset periode trial (Q1 2026 - V2)

Per 2026-06-23 periode trial **Q1 2026 - V2** telah **direset agar siap demo**:
- **Dihapus:** assessments (+ skor & esai cascade), result_360, permohonan koreksi relasi.
- **Dikembalikan:** semua relasi mapping → **Peer** (kondisi awal demo "semua Peer").
- **Dipertahankan:** pemetaan (106), aspek (5), pertanyaan esai (3), bobot, bulan & **KPI**.
- **Backup** residu disimpan di `backups/` (gitignored) sebelum penghapusan.

Cara reset: script sementara via `service_role` (pola: backup JSON → delete by `period_id` →
update relasi → verifikasi). Periode trial ini **akan dibuang** setelah demo (data disposable).

---

## 8. Daftar item operasional yang belum tuntas (non-kode)

- 🔑 Distribusi email/sandi via app script + instruksi per-role (rencana ada).
- 🔑 Demo penggunaan ke pegawai (tunjukkan: transisi ke esai, layar sukses, Minta Koreksi).
- 🔑 Stagger gelombang + pengingat harian.
- 🔑 Prosedur ekspor/backup harian selama periode aktif.
- 🔑 Pertimbangan Supabase Pro untuk Q2 asli (backup otomatis) — opsional.
