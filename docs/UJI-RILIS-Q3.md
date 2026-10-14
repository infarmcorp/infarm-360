# Uji Rilis Q3 2026 — daftar centang sebelum `dev` → `main`

> **File sementara.** Dipakai sekali untuk rilis setelah Q3 difinalisasi (±20 Oktober 2026). Hapus setelah
> rilis selesai dan hasilnya dicatat di [CHANGELOG.md](CHANGELOG.md).

Isi rilis ini: perbaikan audit **gelombang 1**, **gelombang 2**, dan **gelombang 2b** (termasuk **kunci laporan
Final**), ditambah Mode Maintenance, layar Review Penilaian, dan PDF panduan yang sudah lebih dulu ada di `dev`.

**Cara pakai**
- Uji di **URL Preview `dev`**, yang seharusnya memakai **database staging** (data uji, boleh diubah).
  Pastikan dulu lewat langkah 0.2 — jangan pernah menjalankan langkah bertanda ✏️ di production.
- ✏️ = langkah **mengubah data**. Pakai **pegawai uji**, bukan orang sungguhan. Kembalikan seperti semula
  setelah selesai (bagian 15).
- Centang `[x]` tiap langkah yang lulus. Bila gagal, tulis catatan singkat di bawah langkahnya.

---

## 0. Persiapan

### 0.1 Pasang migrasi 0048 & 0049 di STAGING
- [ ] ✏️ Buka **project Supabase staging** (bukan production `beajoczjpywozavatzmf`) → **SQL Editor**.
- [ ] ✏️ Tempel seluruh isi `supabase/migrations/0048_period_atomic_ops.sql` → **Run** → harus "Success".
- [ ] ✏️ Tempel seluruh isi `supabase/migrations/0049_block_self_acc.sql` → **Run** → harus "Success".
- [ ] Tempel isi `scripts/check-migrations.sql` (versi `dev`) → **Run** → baris **0048**, **0049**, dan **0050**
      bernilai `applied = true`. Baris nomor kecil yang `false` = tidak normal, laporkan.
- [ ] Cek tambahan:
      ```sql
      select proname from pg_proc where proname in ('period_activate', 'period_delete');  -- harus 2 baris
      select tgname from pg_trigger where tgname = 'trg_final_reports_block_self_acc';    -- harus 1 baris
      ```

Keduanya aman dijalankan ulang (idempoten). Production menyusul **setelah** uji ini lulus dan sebelum/saat rilis.

### 0.2 Pastikan Preview memakai staging
- [ ] Vercel → project → **Settings → Environment Variables** → `NEXT_PUBLIC_SUPABASE_URL`: entri scope
      **Preview** harus berisi URL project **staging**, bukan `https://beajoczjpywozavatzmf.supabase.co`.
      Sama untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY` dan `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Buka URL Preview `dev` → halaman login → dropdown nama berisi **data uji**, bukan nama pegawai nyata.

### 0.3 Akun & data uji (di staging)
- [ ] Akun **HRD penuh** (Mode Admin), akun **HRD tanpa akses bagian Laporan**, akun **SPV**, akun
      **pemegang akses "Review & Finalisasi"** non-HRD, akun **Direksi**, akun **pegawai biasa**.
- [ ] Satu **pegawai uji A** (anggota tim SPV, sedivisi dengan HRD) dan **pegawai uji B** (divisi lain).
- [ ] Periode aktif dengan KPI, penilaian 360° terkirim, dan Skor 360° sudah dihitung.

---

## 1. Halaman Login (gelombang 1)
- [ ] Dropdown nama tampil seperti biasa ("Nama · Divisi — Peran"); penyaring **Peran** berfungsi; memilih
      nama mengisi Peran otomatis.
- [ ] Pilih nama + sandi benar → masuk ke halaman awal sesuai peran.
- [ ] Pilih nama + sandi salah → "Sandi salah atau akun tidak ditemukan."
- [ ] "Masuk dengan email manual" → email + sandi benar → masuk; sandi salah → pesan yang sama.
- [ ] Logout → login lagi lewat dropdown → berhasil.
- [ ] Akun HRD: setelah login mulai di **mode posisi-asli**, bukan Mode Admin.
- [ ] DevTools → tab Network / View Source halaman login → cari "@" → **tidak ada** email pegawai.

## 2. Menu (gelombang 1)
- [ ] HRD Mode Admin → klik **Monitoring & Audit KPI** → langsung terbuka di **Riwayat & Audit**.

## 3. Detail laporan sebagai pemegang akses "Review & Finalisasi" (gelombang 1)
- [ ] Buka detail laporan pegawai dalam lingkupnya → tampilan sama seperti sebelumnya; komentar anonim tetap ada.
- [ ] DevTools → cari nama salah satu penilai pegawai itu di respons halaman → **tidak ditemukan**.

## 4. Dashboard Organisasi (gelombang 2 & 2b)
- [ ] Diagram lingkaran KPI & badge peringkat tampil normal; tooltip menampilkan 2 desimal.
- [ ] Kartu dengan selisih "vs periode lalu" tampil seperti biasa.

## 5. Monitor Kinerja (gelombang 2)
- [ ] Sebagai SPV dan HRD Mode-SPV: tren, tabel, heatmap, batang distribusi tampil normal.
- [ ] Selisih "vs rata-rata" tampil 2 desimal.

## 6. Sidebar tugas HRD (gelombang 2)
- [ ] HRD Mode Admin: notifikasi "N laporan Final skornya berubah" muncul bila memang ada (tidak hilang
      tanpa sebab).

## 7. Ekspor Dataset (gelombang 2)
- [ ] Unduh **semua kartu** untuk periode aktif → setiap file terunduh; jumlah baris wajar (bandingkan
      dengan ekspor sebelum rilis bila ada).

## 8. Kelola Pegawai (gelombang 2)
- [ ] ✏️ Pindahkan pegawai uji ber-izin HRD dari HRD-GA ke divisi lain → **ditolak**: "Cabut izin HRD pegawai
      ini terlebih dahulu sebelum memindahkan divisinya."
- [ ] ✏️ Cabut izin HRD-nya → ulangi → berhasil. Kembalikan divisi & izinnya setelah itu.
- [ ] ✏️ Pindahkan pegawai uji biasa ke divisi lain → berhasil. Kembalikan.

## 9. Manajemen Akses (gelombang 2b)
- [ ] ✏️ HRD penuh mencoba memberi akses halaman ke **dirinya sendiri** → ditolak "Anda tidak dapat memberi
      atau mengubah akses halaman untuk diri sendiri."
- [ ] ✏️ Beri akses ke **satu peran** yang mencakup dirinya (mis. Koordinator, bila HRD itu koordinator) →
      berhasil, pesannya menyebut "Anda sendiri dikecualikan". Cabut lagi.
- [ ] ✏️ Beri akses biasa ke pegawai uji (Lihat / Meringkas / Finalisasi) → tersimpan sesuai pilihan. Cabut lagi.

## 10. Flag Kepatuhan (potongan telat; gelombang 2b & perbaikan potongan nol)
- [ ] ✏️ Tetapkan potongan pegawai uji (belum Final) menjadi −7 → Skor 360°-nya turun 7 dari skor mentah.
- [ ] ✏️ Ubah ke **0** (alasan baru) → Skor 360° kembali ke skor mentah; tampilan menunjukkan 0.
- [ ] Log Aktivitas HRD → entri "Mengecualikan …" dengan alasan baru.
- [ ] ✏️ Ubah ke −5 → skor turun 5; log "Menetapkan … menjadi −5". Kosongkan alasan → kembali otomatis.
- [ ] ✏️ **Terapkan Potongan** → pesan "… Skor 360° diperbarui" (dan "N pegawai dilewati karena laporannya
      sudah Final" bila ada pegawai Final yang angkanya seharusnya berubah).

## 11. Pemetaan (gelombang 2b)
- [ ] ✏️ **Periksa Validitas → Batalkan Validitas** satu penilaian terkirim (pegawai **belum Final**) → berhasil
      tanpa peringatan. **Pulihkan** lagi → berhasil.
- [ ] (Hanya bila mudah disimulasikan) Bila Hitung Ulang gagal, muncul peringatan kuning "… BELUM diperbarui …
      tekan Hitung Ulang Skor 360°".

## 12. Laporan Kinerja Tim — ACC (gelombang 2b)
- [ ] ✏️ SPV meng-ACC laporan anggota timnya (sudah dirilis) → berhasil.
- [ ] ✏️ HRD Mode-SPV meng-ACC pegawai **sedivisi** → berhasil.
- [ ] ✏️ HRD **tanpa** akses bagian Laporan (Mode-SPV) meng-ACC pegawai sedivisi → berhasil (dulu gagal).
- [ ] Log Aktivitas mencatat ACC tersebut.

## 13. Review & Finalisasi + KUNCI LAPORAN FINAL (gelombang 2b)
Pakai **pegawai uji A**.
- [ ] ✏️ **Finalisasi Semua Ber-ACC** → pesan menyebut jumlah difinalisasi, dilewati (bila ada), dan
      **gagal disimpan** beserta namanya (bila ada).
- [ ] ✏️ Finalisasi laporan **pegawai uji A** (bila belum Final). Lalu, selama Final:
  - [ ] ✏️ **Input KPI** pegawai A (bulan periode ini) → ditolak "Laporan [nama] sudah Final. Buka Kembali
        laporannya dulu untuk mengubah data ini."
  - [ ] ✏️ **Hapus KPI** pegawai A → ditolak dengan pesan yang sama.
  - [ ] ✏️ Login sebagai penilai pegawai A → **Kirim / Kirim Ulang** penilaian untuknya → ditolak "Laporan
        [nama] sudah Final, penilaian untuknya tidak dapat dikirim atau diubah lagi." (Simpan draf yang belum
        pernah dikirim tetap boleh.)
  - [ ] ✏️ **Pemetaan → Batalkan Validitas** penilaian untuk pegawai A → ditolak.
  - [ ] ✏️ **Progress 360 → Paksa Selesai** untuk pegawai A → ditolak.
  - [ ] ✏️ **Flag Kepatuhan → ubah potongan** pegawai A → ditolak.
  - [ ] ✏️ **Bobot → bobot khusus** pegawai A → ditolak.
  - [ ] ✏️ **Hitung Ulang Skor 360°** → berhasil untuk yang lain; pegawai A dilewati (disebut bila angkanya
        seharusnya berubah). Skor 360° pegawai A tidak berubah.
  - [ ] ✏️ **Bobot periode** / **Kelola Pertanyaan** (mis. ubah teks indikator) / **matikan 360° periode** →
        ditolak "Sudah ada N laporan Final di periode ini. Buka Kembali laporan-laporan itu dulu …".
  - [ ] Pegawai A login → laporan Final-nya tampil.
- [ ] ✏️ Di detail laporan pegawai A klik **Buka Kembali (ke Draf)** → konfirmasi tampil: "ACC SPV/Direksi
      akan dihapus dan perlu diulang. Selama dibuka kembali, pegawai tidak bisa melihat laporannya." → setujui.
  - [ ] Pegawai A login → laporannya **tidak** lagi tampil.
  - [ ] Ulangi beberapa langkah "ditolak" di atas → kini **berhasil**.
  - [ ] ✏️ Finalisasi lagi → berhasil; ACC perlu diulang.

## 14. Kelola Siklus Periode (gelombang 2b, migrasi 0048)
- [ ] ✏️ (Setelah 0.1) **Aktifkan** periode lain, lalu aktifkan kembali periode semula → selalu tepat **satu**
      periode aktif; Log Aktivitas mencatat keduanya.
- [ ] ✏️ (Opsional, hanya periode uji kosong) **Hapus Periode** yang tidak aktif → berhasil; bila periode itu
      punya laporan Final → ditolak "… untuk menghapus periode ini."

## 15. Penutup
- [ ] ✏️ Kembalikan data uji: buka kembali/finalisasi ulang seperlunya, potongan & akses ke semula.
- [ ] Catat hasil (lulus/gagal + catatan) dan sampaikan sebelum PR rilis `dev` → `main` dibuat.
- [ ] Saat rilis: jalankan 0048 & 0049 di **production** (cara sama dengan 0.1) dan kirim pesan perubahan ke HRD.
