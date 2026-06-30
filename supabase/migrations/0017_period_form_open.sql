-- 0017_period_form_open — pisahkan "form penilaian terbuka" dari has_360.
--
-- has_360  = apakah komponen 360° DIHITUNG ke Skor Akhir (blend 50/50 vs 100% KPI).
-- form_open = apakah pegawai BOLEH mengisi/kirim penilaian 360°.
--
-- Memungkinkan HRD MENUTUP form (membekukan pengisian) untuk review/finalisasi
-- TANPA mematikan 360° di skor & TANPA menyembunyikan tombol Hitung Ulang.
-- Aditif & backward-compatible: default true → perilaku lama (form terbuka selama has_360).
alter table periods add column if not exists form_open boolean not null default true;
