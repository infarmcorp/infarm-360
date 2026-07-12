-- 0020_employee_activity_dates.sql
-- Riwayat kepegawaian RINGAN: tanggal masuk/aktif (`joined_on`) & tanggal nonaktif (`left_on`).
-- Model dua-kolom (satu rentang aktif berjalan) — bukan tabel riwayat penuh: rehire menimpa
-- `left_on` (dibersihkan saat diaktifkan lagi), `joined_on` = tgl masuk yang dipertahankan.
--
-- Cara isi (lihat app/(app)/admin/pegawai/actions.ts):
--   • create           → joined_on = hari ini (atau input HRD)
--   • Nonaktifkan       → left_on   = hari ini (otomatis, dapat dikoreksi via "Ubah")
--   • Aktifkan kembali  → left_on   = NULL (joined_on tetap; diisi hari ini bila kosong)
-- Keduanya DAPAT DIKOREKSI manual di form Ubah Pegawai (tgl sebenarnya kerap beda dari hari klik).
--
-- Tak sensitif → mengikuti RLS tabel employees yang ada (emp_manage = HRD tulis). Tanpa policy baru.

alter table employees add column if not exists joined_on date;
alter table employees add column if not exists left_on   date;

-- Backfill data lama: tgl masuk = tanggal record dibuat (proxy terbaik yang tersedia).
update employees set joined_on = created_at::date where joined_on is null;
