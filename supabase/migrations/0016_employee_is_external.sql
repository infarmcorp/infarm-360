-- 0016_employee_is_external — penanda pegawai EKSTERNAL (vendor/freelance/mitra).
-- Eksternal HANYA bertindak sebagai PENILAI 360° (relasi Cross): mereka menilai
-- pegawai Infarm, tetapi TIDAK punya KPI/Skor Akhir/laporan dan DISEMBUNYIKAN dari
-- dashboard, daftar KPI, monitor, laporan, kepatuhan, suksesi, serta dari daftar
-- "yang bisa dinilai" (mereka bukan subjek penilaian).
-- Aditif & backward-compatible: baris lama default false (semua pegawai = internal).
alter table public.employees
  add column if not exists is_external boolean not null default false;
