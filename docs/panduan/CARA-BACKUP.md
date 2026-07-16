# Cara Backup & Pemulihan Data — Infarm 360°

Panduan ringkas mencadangkan (backup) dan memulihkan (restore) seluruh data aplikasi.
Database memakai **Supabase free tier** yang **nyaris tanpa backup otomatis**, jadi cadangan
manual ini penting — terutama **akhir tiap periode** dan **sebelum migrasi/reset**.

> **Syarat:** file `.env.local` ada di folder proyek (berisi `SUPABASE_DB_URL`). Sudah tersedia
> di laptop yang dipakai mengelola aplikasi.

---

## 1. Membuat Backup (rutin & aman)

Backup **hanya membaca** database — tak mengubah apa pun, boleh dijalankan kapan saja.

Buka terminal di folder proyek (VS Code: **Terminal → New Terminal**), jalankan **3 baris**:

```powershell
npm install --no-save pg
node scripts/backup.mjs
npm uninstall --no-save pg
```

Hasil tersimpan di folder baru:

```
backups/backup-<tanggal-jam>/
├── _manifest.json            (ringkasan: tanggal + jumlah baris per tabel)
├── <tabel>.json              (20 tabel aplikasi)
├── auth.users.json           (akun login + sandi TER-HASH)
└── auth.identities.json
```

- **Tiap kali dijalankan = folder baru** berisi **salinan LENGKAP** seluruh database saat itu
  (bukan tambahan/selisih). Tiap folder berdiri sendiri & bisa dipulihkan sendiri.
- Folder `backups/` **di-gitignore** → data pegawai mentah **tidak** ikut ter-upload ke GitHub.
- Ukuran kecil (~1 MB saat trial; perkiraan ~2–8 MB per backup saat periode penuh).

### ⚠️ WAJIB: salin ke luar laptop (aturan 3-2-1)
Backup masih **hanya di laptop**. Kalau laptop rusak/hilang, backup ikut hilang.
**Setelah backup, salin folder `backups/backup-...` ke Google Drive / hard disk eksternal.**

### Kapan backup?
- **Akhir tiap periode/kuartal** (setelah finalisasi, sebelum Kunci & Akhiri).
- **Sebelum** migrasi skema, reset, atau perubahan besar.
- Boleh juga berkala (mingguan) — ringan.

---

## 2. Melihat Data dalam Excel (opsional, untuk dibaca)

Folder backup berformat **JSON** (untuk pemulihan). Bila ingin **membaca** isinya di Excel:

```powershell
node scripts/backup-to-excel.mjs backups/backup-<tanggal-jam>
```

→ menghasilkan `backups/backup-<tanggal-jam>.xlsx` (1 sheet per tabel + sheet RINGKASAN).
Akun login (`auth.*`) **dikecualikan** (hash sandi tak masuk Excel).

> File `.xlsx` ini **untuk dibaca/arsip saja — TIDAK bisa di-restore.** Untuk pemulihan tetap
> pakai folder JSON. Untuk analisis rutin, lebih baik pakai menu **HRD → Ekspor Dataset** di
> aplikasi (Excel rapi, anonim untuk 360°).

---

## 3. Memulihkan (Restore) — hanya saat data hilang/rusak

⚠️ **Berisiko — menulis ke database.** Jalankan hanya saat benar-benar perlu (data terhapus,
migrasi gagal, reset keliru).

```powershell
npm install --no-save pg
node scripts/restore.mjs backups/backup-<tanggal-jam> PULIHKAN
npm uninstall --no-save pg
```

- Kata **`PULIHKAN`** wajib (pengaman agar tak jalan tak sengaja).
- Berjalan dalam **1 transaksi**: bila gagal di tengah → **batal total (rollback)**, DB tak separuh terisi.
- Opsi `--no-auth` (di akhir perintah) = pulihkan **data aplikasi saja**, tanpa akun login.

### Apa yang terjadi saat restore (penting)
Restore memakai **upsert** (masukkan/timpa), **bukan** hapus-semua-lalu-isi-ulang:

| Kejadian setelah backup | Saat di-restore |
|---|---|
| Baris **diubah** | dikembalikan ke nilai snapshot (perubahan tertimpa) |
| Baris **dihapus** | dimunculkan kembali dari snapshot |
| Baris **baru** ditambah sesudah backup | **TETAP ADA** (restore tak menghapusnya) |

→ Restore = **memulihkan data yang hilang/rusak**, **bukan** membatalkan semua aktivitas sejak
tanggal backup.

---

## Ringkasan perintah

| Tujuan | Perintah |
|---|---|
| **Backup** | `npm install --no-save pg` → `node scripts/backup.mjs` → `npm uninstall --no-save pg` |
| **JSON → Excel** (baca) | `node scripts/backup-to-excel.mjs backups/backup-<tanggal-jam>` |
| **Restore** | `npm install --no-save pg` → `node scripts/restore.mjs backups/backup-<tanggal-jam> PULIHKAN` → `npm uninstall --no-save pg` |

> Catatan: `pg` sengaja dipasang sementara lalu dilepas (bukan dependensi tetap proyek).
