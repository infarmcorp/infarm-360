-- 0030_employee_access_reviewed
-- Fase 3 Manajemen Akses: penanda "akses pegawai baru sudah ditinjau HRD".
-- Section "Pegawai Baru" di konsol menampilkan pegawai yang joined_on masih dalam jendela (mis. ≤30
-- hari) DAN belum ditinjau. HRD menekan "Tandai sudah ditinjau" → set access_reviewed_at = now() →
-- kartu hilang meski masih dalam jendela. NULL = belum ditinjau (default).
--
-- ADITIF & aman: kolom nullable tanpa default → tak mengubah baris yang ada.

alter table employees add column if not exists access_reviewed_at timestamptz;
