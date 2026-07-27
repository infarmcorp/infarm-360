-- 0034_employee_nickname
-- Nama panggilan (opsional) untuk pegawai — dipakai menampilkan nama RINGKAS di tampilan padat
-- (Dashboard Organisasi, Monitor, heatmap, movers, tabel talenta) tanpa mengubah `name` (nama
-- lengkap resmi yang tetap dipakai di dokumen/PDF & Kelola Pegawai).
--
-- Semantik: NULL / kosong → jatuh ke nama lengkap (`name`). Berisi → dipakai sebagai label ringkas.
-- Aditif & backward-compatible (kolom nullable tanpa default → tak mengubah baris yang ada).
alter table employees add column if not exists nickname text;
