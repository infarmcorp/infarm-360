-- 0014 — stempel waktu peninjauan koreksi relasi
-- ----------------------------------------------------------------------------
-- Menambah `reviewed_at` ke relation_correction_requests: kapan HRD MENYETUJUI/menolak
-- permohonan koreksi (berbeda dari `created_at` = kapan pegawai mengajukan).
--
-- Dipakai mendeteksi "Skor 360° basi": koreksi relasi yang DI-ACC SETELAH result_360
-- terakhir dihitung mengubah kelas bobot penilaian → skor jadi usang sampai Hitung Ulang.
-- Banner di Review Hasil Akhir membandingkan reviewed_at > result_360.computed_at.
--
-- Aditif & backward-compatible (nullable; baris lama = NULL → tak memicu peringatan).
alter table relation_correction_requests
  add column if not exists reviewed_at timestamptz;
