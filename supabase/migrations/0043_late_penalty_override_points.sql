-- ============================================================================
-- 0043 — NILAI POTONGAN KETERLAMBATAN yang DITETAPKAN HRD (keputusan HRD 2026-09-29)
--
-- Potongan keterlambatan menilai tetap OTOMATIS −3 (lib/late.ts). HRD kini bisa MENGUBAH
-- nilainya per pegawai per periode dengan alasan (mis. −1 karena pertimbangan khusus), tak
-- hanya mengecualikan penuh. Tabel late_penalty_waivers (0036) dipakai sebagai "penetapan HRD":
--   points = nilai potongan yang berlaku untuk pegawai itu (0 = dikecualikan penuh).
-- Baris lama (pengecualian) otomatis bernilai 0 → perilaku lama tak berubah.
--
-- Kode aplikasi kompatibel sebelum & sesudah migrasi ini (membaca tanpa kolom bila belum ada;
-- menyimpan nilai selain 0 baru bisa setelah diterapkan).
-- ============================================================================

alter table late_penalty_waivers
  add column if not exists points numeric(5,2) not null default 0;

alter table late_penalty_waivers
  drop constraint if exists late_penalty_waivers_points_check;
alter table late_penalty_waivers
  add constraint late_penalty_waivers_points_check check (points >= 0 and points <= 100);

comment on column late_penalty_waivers.points is
  'Nilai potongan keterlambatan yang DITETAPKAN HRD (menggantikan −3 otomatis). 0 = dikecualikan penuh.';
