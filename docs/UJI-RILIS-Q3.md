# Uji Rilis Q3 2026 — daftar centang sebelum `dev` → `main`

> **File sementara.** Dipakai sekali untuk rilis setelah Q3 difinalisasi (±20 Oktober 2026). Hapus setelah
> rilis selesai dan hasilnya dicatat di [CHANGELOG.md](CHANGELOG.md).

Isi rilis ini: perbaikan audit **gelombang 1**, **gelombang 2**, dan **gelombang 2b** (termasuk **kunci laporan
Final**), nama penilai tak terkirim di tampilan HRD, Mode Maintenance, layar Review Penilaian, filter Divisi, dan
PDF panduan (apa adanya), ditambah perubahan database 0048 dan 0049. Fitur 13–16 Oktober sudah di production.

**Cara pakai**
- Bagian 0–15 dijalankan **2026-10-15** di **URL Preview `dev`** (53 lulus, 0 gagal).
- Bagian **16–21** (tambahan 2026-10-16) dijalankan di **URL Preview branch `release/q3-2026`**, yaitu kode yang
  benar-benar akan dirilis (gabungan `main` + `dev`). Preview memakai **database staging** (langkah 0.2) — jangan
  pernah menjalankan langkah bertanda ✏️ di production.
- ✏️ = langkah **mengubah data**. Pakai **pegawai uji**, bukan orang sungguhan. Kembalikan seperti semula
  setelah selesai (bagian 22).
- Centang `[x]` tiap langkah yang lulus. Bila gagal, tulis catatan singkat di bawah langkahnya.

---

## 0. Persiapan

### 0.1 Pasang migrasi 0048 & 0049 di STAGING
- [x] ✏️ Buka **project Supabase staging** (bukan production `beajoczjpywozavatzmf`) → **SQL Editor**.
- [x] ✏️ Tempel seluruh isi `supabase/migrations/0048_period_atomic_ops.sql` → **Run** → harus "Success".
- [x] ✏️ Tempel seluruh isi `supabase/migrations/0049_block_self_acc.sql` → **Run** → harus "Success".
- [x] Tempel isi `scripts/check-migrations.sql` (versi `dev`) → **Run** → baris **0048**, **0049**, dan **0050**
      bernilai `applied = true`. Baris nomor kecil yang `false` = tidak normal, laporkan.
- [x] Cek tambahan:
      ```sql
      select proname from pg_proc where proname in ('period_activate', 'period_delete');  -- harus 2 baris
      select tgname from pg_trigger where tgname = 'trg_final_reports_block_self_acc';    -- harus 1 baris
      ```

Keduanya aman dijalankan ulang (idempoten). Production menyusul **setelah** uji ini lulus dan sebelum/saat rilis.

### 0.2 Pastikan Preview memakai staging
- [x] Vercel → project → **Settings → Environment Variables** → `NEXT_PUBLIC_SUPABASE_URL`: entri scope
      **Preview** harus berisi URL project **staging**, bukan `https://beajoczjpywozavatzmf.supabase.co`.
      Sama untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Buka URL Preview `dev` → halaman login → dropdown nama berisi **data uji**, bukan nama pegawai nyata.

### 0.3 Akun & data uji (di staging)
- [x] Akun **HRD penuh** (Mode Admin), akun **HRD tanpa akses bagian Laporan**, akun **SPV**, akun
      **pemegang akses "Review & Finalisasi"** non-HRD, akun **Direksi**, akun **pegawai biasa**.
- [x] Satu **pegawai uji A** (anggota tim SPV, sedivisi dengan HRD) dan **pegawai uji B** (divisi lain).
- [x] Periode aktif dengan KPI, penilaian 360° terkirim, dan Skor 360° sudah dihitung.

---

## 1. Halaman Login (gelombang 1)
- [x] Dropdown nama tampil seperti biasa ("Nama · Divisi — Peran"); penyaring **Peran** berfungsi; memilih
      nama mengisi Peran otomatis.
- [x] Pilih nama + sandi benar → masuk ke halaman awal sesuai peran.
- [x] Pilih nama + sandi salah → "Sandi salah atau akun tidak ditemukan."
- [x] "Masuk dengan email manual" → email + sandi benar → masuk; sandi salah → pesan yang sama.
- [x] Logout → login lagi lewat dropdown → berhasil.
- [x] Akun HRD: setelah login mulai di **mode posisi-asli**, bukan Mode Admin.
- [x] DevTools → tab Network / View Source halaman login → cari "@" → **tidak ada** email pegawai.

## 2. Menu (gelombang 1)
- [x] HRD Mode Admin → klik **Monitoring & Audit KPI** → langsung terbuka di **Riwayat & Audit**.

## 3. Detail laporan sebagai pemegang akses "Review & Finalisasi" (gelombang 1)
- [x] Buka detail laporan pegawai dalam lingkupnya → tampilan sama seperti sebelumnya; komentar anonim tetap ada.
- [x] DevTools → cari nama salah satu penilai pegawai itu di respons halaman → **tidak ditemukan**.

## 4. Dashboard Organisasi (gelombang 2 & 2b)
- [x] Diagram lingkaran KPI & badge peringkat tampil normal; tooltip menampilkan 2 desimal.
- [x] Kartu dengan selisih "vs periode lalu" tampil seperti biasa.

## 5. Monitor Kinerja (gelombang 2)
- [x] Sebagai SPV dan HRD Mode-SPV: tren, tabel, heatmap, batang distribusi tampil normal.
- [x] Selisih "vs rata-rata" tampil 2 desimal.

## 6. Sidebar tugas HRD (gelombang 2)
- [x] HRD Mode Admin: notifikasi "N laporan Final skornya berubah" muncul bila memang ada (tidak hilang
      tanpa sebab).

## 7. Ekspor Dataset (gelombang 2)
- [x] Unduh **semua kartu** untuk periode aktif → setiap file terunduh; jumlah baris wajar (bandingkan
      dengan ekspor sebelum rilis bila ada).

## 8. Kelola Pegawai (gelombang 2)
- [x] ✏️ Pindahkan pegawai uji ber-izin HRD dari HRD-GA ke divisi lain → **ditolak**: "Cabut izin HRD pegawai
      ini terlebih dahulu sebelum memindahkan divisinya."
- [x] ✏️ Cabut izin HRD-nya → ulangi → berhasil. Kembalikan divisi & izinnya setelah itu.
- [x] ✏️ Pindahkan pegawai uji biasa ke divisi lain → berhasil. Kembalikan.

## 9. Manajemen Akses (gelombang 2b)
- [x] ✏️ HRD penuh mencoba memberi akses halaman ke **dirinya sendiri** → ditolak "Anda tidak dapat memberi
      atau mengubah akses halaman untuk diri sendiri."
- [x] ✏️ Beri akses ke **satu peran** yang mencakup dirinya (mis. Koordinator, bila HRD itu koordinator) →
      berhasil, pesannya menyebut "Anda sendiri dikecualikan". Cabut lagi.
- [x] ✏️ Beri akses biasa ke pegawai uji (Lihat / Meringkas / Finalisasi) → tersimpan sesuai pilihan. Cabut lagi.

## 10. Flag Kepatuhan (potongan telat; gelombang 2b & perbaikan potongan nol)
- [x] ✏️ Tetapkan potongan pegawai uji (belum Final) menjadi −7 → Skor 360°-nya turun 7 dari skor mentah.
- [x] ✏️ Ubah ke **0** (alasan baru) → Skor 360° kembali ke skor mentah; tampilan menunjukkan 0.
- [x] Log Aktivitas HRD → entri "Mengecualikan …" dengan alasan baru.
- [x] ✏️ Ubah ke −5 → skor turun 5; log "Menetapkan … menjadi −5". Kosongkan alasan → kembali otomatis.
- [ ] ✏️ **Terapkan Potongan** → pesan "… Skor 360° diperbarui" (dan "N pegawai dilewati karena laporannya
      sudah Final" bila ada pegawai Final yang angkanya seharusnya berubah).
      > 2026-10-15: tombol tidak muncul karena tak ada potongan tertunda (pegawai Final memang tidak dihitung).
      > Potongan otomatis tetap terbukti jalan di 13 (lihat Hasil).

## 11. Pemetaan (gelombang 2b)
- [x] ✏️ **Periksa Validitas → Batalkan Validitas** satu penilaian terkirim (pegawai **belum Final**) → berhasil
      tanpa peringatan. **Pulihkan** lagi → berhasil.
- [ ] (Hanya bila mudah disimulasikan) Bila Hitung Ulang gagal, muncul peringatan kuning "… BELUM diperbarui …
      tekan Hitung Ulang Skor 360°".
      > Dilewati: butuh kegagalan database buatan; sudah dicakup tes otomatis.

## 12. Laporan Kinerja Tim — ACC (gelombang 2b)
- [x] ✏️ SPV meng-ACC laporan anggota timnya (sudah dirilis) → berhasil.
- [x] ✏️ HRD Mode-SPV meng-ACC pegawai **sedivisi** → berhasil.
- [x] ✏️ HRD **tanpa** akses bagian Laporan (Mode-SPV) meng-ACC pegawai sedivisi → berhasil (dulu gagal).
- [x] Log Aktivitas mencatat ACC tersebut.

## 13. Review & Finalisasi + KUNCI LAPORAN FINAL (gelombang 2b)
Pakai **pegawai uji A**.
- [x] ✏️ **Finalisasi Semua Ber-ACC** → pesan menyebut jumlah difinalisasi, dilewati (bila ada), dan
      **gagal disimpan** beserta namanya (bila ada).
- [x] ✏️ Finalisasi laporan **pegawai uji A** (bila belum Final). Lalu, selama Final:
  - [x] ✏️ **Input KPI** pegawai A (bulan periode ini) → ditolak "Laporan [nama] sudah Final. Buka Kembali
        laporannya dulu untuk mengubah data ini."
  - [x] ✏️ **Hapus KPI** pegawai A → ditolak dengan pesan yang sama.
  - [x] ✏️ Login sebagai penilai pegawai A → **Kirim / Kirim Ulang** penilaian untuknya → ditolak "Laporan
        [nama] sudah Final, penilaian untuknya tidak dapat dikirim atau diubah lagi." (Simpan draf yang belum
        pernah dikirim tetap boleh.)
  - [x] ✏️ **Pemetaan → Batalkan Validitas** penilaian untuk pegawai A → ditolak.
  - [x] ✏️ **Progress 360 → Paksa Selesai** untuk pegawai A → ditolak.
  - [x] ✏️ **Flag Kepatuhan → ubah potongan** pegawai A → ditolak.
  - [x] ✏️ **Bobot → bobot khusus** pegawai A → ditolak.
  - [x] ✏️ **Hitung Ulang Skor 360°** → berhasil untuk yang lain; pegawai A dilewati (disebut bila angkanya
        seharusnya berubah). Skor 360° pegawai A tidak berubah.
  - [x] ✏️ **Bobot periode** / **Kelola Pertanyaan** (mis. ubah teks indikator) / **matikan 360° periode** →
        ditolak "Sudah ada N laporan Final di periode ini. Buka Kembali laporan-laporan itu dulu …".
  - [x] Pegawai A login → laporan Final-nya tampil.
- [x] ✏️ Di detail laporan pegawai A klik **Buka Kembali (ke Draf)** → konfirmasi tampil: "ACC SPV/Direksi
      akan dihapus dan perlu diulang. Selama dibuka kembali, pegawai tidak bisa melihat laporannya." → setujui.
  - [x] Pegawai A login → laporannya **tidak** lagi tampil.
  - [x] Ulangi beberapa langkah "ditolak" di atas → kini **berhasil**.
  - [x] ✏️ Finalisasi lagi → berhasil; ACC perlu diulang.

## 14. Kelola Siklus Periode (gelombang 2b, migrasi 0048)
- [x] ✏️ (Setelah 0.1) **Aktifkan** periode lain, lalu aktifkan kembali periode semula → selalu tepat **satu**
      periode aktif; Log Aktivitas mencatat keduanya.
- [ ] ✏️ (Opsional, hanya periode uji kosong) **Hapus Periode** yang tidak aktif → berhasil; bila periode itu
      punya laporan Final → ditolak "… untuk menghapus periode ini."
      > Dilewati: tidak bisa dibatalkan dan tak ada periode uji kosong.

## 15. Penutup (putaran 2026-10-15)
- [x] ✏️ Kembalikan data uji: buka kembali/finalisasi ulang seperlunya, potongan & akses ke semula.
- [x] Catat hasil (lulus/gagal + catatan) dan sampaikan sebelum PR rilis `dev` → `main` dibuat.

---

**Tambahan 2026-10-16 — jalankan di URL Preview `release/q3-2026`.**

## 16. Nama penilai tidak terkirim di tampilan HRD (anonimitas, butir A)
Cari dulu nama 1–2 penilai pegawai uji A di **Pemetaan** (satu-satunya tempat siapa-menilai-siapa tampil).
- [ ] HRD Mode Admin → Review & Finalisasi → detail laporan **pegawai uji A** → komentar anonim tampil seperti
      biasa; tidak ada blok umpan balik per penilai bernama.
- [ ] DevTools → tab **Network** → muat ulang halaman → cari nama penilai tadi di respons halaman → **tidak ditemukan**.
- [ ] Buka detail laporan **akun HRD itu sendiri** → komentar anonim **tetap tampil** (disengaja); nama penilainya
      di respons halaman → **tidak ditemukan**.

## 17. Bagian yang bentrok saat penggabungan (kokpit, finalisasi massal, Hitung Ulang)
Tiga bagian ini dibuat dua kali (versi production dan versi `dev`) lalu digabung. Pastikan perilaku keduanya ada.
- [ ] Review & Finalisasi tampil sebagai **3 langkah berjajar** (① Hitung Skor 360° → ② Finalisasi Laporan → ③ Kabari
      Pegawai). Tombol Finalisasi yang nonaktif menyebut sebabnya ("Menunggu ACC (N)", "Masih ada draf (N)",
      "✓ Semua sudah Final").
- [ ] ✏️ Siapkan minimal satu pegawai uji **Final** dan satu yang **belum Final**, lalu ubah satu penilaian untuk
      pegawai yang belum Final (supaya ① aktif) → **Hitung Ulang** → pesan "Skor 360° dihitung ulang untuk N
      pegawai." disertai "M pegawai dilewati karena laporannya sudah Final" bila angka pegawai Final seharusnya berubah.
- [ ] Menu **⋯ → Hitung ulang paksa** → dialog berbunyi "… Pegawai yang laporannya sudah Final dilewati (laporan
      Final terkunci; Buka Kembali dulu bila angkanya memang harus berubah)." → **Batal**.
- [ ] ✏️ Siapkan 2 pegawai uji yang laporannya dirilis dan sudah di-ACC → **Finalisasi N Laporan** → pesan
      "N laporan difinalisasi." (bila ada, menyebut yang dilewati, dan yang **gagal disimpan** dengan teks merah).
- [ ] Log Aktivitas HRD → entri finalisasi massal **menyebut nama** pegawai yang difinalisasi (dan yang dilewati/gagal).
- [ ] Detail laporan salah satu pegawai tadi → panel **Riwayat Laporan** mencatat finalisasinya beserta jamnya.
- [ ] ✏️ DevTools → Network → **Offline** → klik **ACC** (Laporan Kinerja Tim, akun SPV) atau **Simpan Draf** →
      muncul pesan "Gagal terhubung ke server — perubahan TIDAK tersimpan. Muat ulang halaman lalu coba lagi."
      Kembalikan ke **Online**.
- [ ] `scripts/check-migrations.sql` (versi branch rilis) di staging → baris **0048–0052** semuanya `applied = true`.

## 18. Mode Maintenance
Mode Maintenance **hanya berlaku di production**; Preview dan staging tidak pernah terkunci.
- [ ] Buka `<URL Preview>/maintenance` → otomatis diarahkan ke halaman awal; aplikasi berjalan normal.
- [ ] Setelah rilis (di production, di luar jam pengisian): jalankan langkah **B** dan **C** di TEKNIS.md §3.3
      (siapkan saklar, uji nyala → halaman "Sedang Maintenance", uji tautan developer, matikan lagi).

## 19. Layar Review Penilaian (sebelum kirim)
Pakai **akun penilai uji** dan penilaian untuk **pegawai uji yang belum Final**.
- [ ] Buka penilaian yang belum lengkap → tombol utama "**Lengkapi Penilaian (N tersisa)**".
- [ ] ✏️ Lengkapi semua nilai, bukti perilaku (≥ 20 karakter), dan esai → tombol berubah menjadi "**Review Penilaian**".
- [ ] Klik → layar ringkasan per aspek (nilai + key point); klik baris → bukti perilaku tampil; jawaban esai tampil;
      **tidak ada** rata-rata skor.
- [ ] Klik **Edit** → kembali ke pertanyaan terkait; ✏️ ubah satu jawaban → Review lagi → perubahan terlihat.
- [ ] ✏️ **Kirim Penilaian 360°** → konfirmasi → layar sukses.
- [ ] Ulangi alur di **HP** → tampilan rapi, tombol terjangkau.
- [ ] (Bila ada periode uji yang deadlinenya lewat) di daftar Penilaian, penilaian terkirim bertombol **Lihat**;
      dibuka → judul "Lihat Penilaian", tidak bisa dikirim ulang.

## 20. Filter Divisi di Monitoring & Audit KPI
- [ ] HRD Mode Admin → Monitoring & Audit KPI → filter **Divisi** di bawah judul → pilih satu divisi → tab
      **Rekapitulasi Kuartal** dan **Riwayat & Audit** hanya berisi divisi itu.
- [ ] Pindah tab dan ganti periode → pilihan divisi tetap terbawa. "Seluruh Divisi" → semua kembali.
- [ ] Akun pemegang akses halaman Monitoring berlingkup **satu** divisi → filter tidak muncul, hanya divisinya.
      Ubah `?dept=` di alamat ke divisi lain → data divisi lain **tidak** tampil.

## 21. Fitur yang sudah di production tetap jalan setelah digabung
- [ ] Kelola Pegawai → ikon folder per baris (Folder Laporan) bisa dibuka.
- [ ] Review & Finalisasi → dialog **Email Rilis Laporan** terbuka; ✏️ **kirim uji ke email sendiri** → email masuk.
- [ ] Tabel berhalaman (mis. Review & Finalisasi, Laporan Kinerja Tim) → pindah halaman/filter → ukuran tabel tidak bergeser.

## 22. Penutup
- [ ] ✏️ Kembalikan data uji (bagian 16–21): buka kembali/finalisasi ulang seperlunya, penilaian & ACC ke semula.
- [ ] Catat hasil bagian 16–21 di file ini.
- [ ] Saat rilis: merge PR rilis → jalankan **0048** lalu **0049** di **production** (cara sama dengan 0.1, lalu
      `scripts/check-migrations.sql`) → kirim [PESAN-HRD-RILIS-Q3.md](PESAN-HRD-RILIS-Q3.md) ke HRD.
- [ ] Setelah merge: buat PR **sinkron `main` → `dev`**.
