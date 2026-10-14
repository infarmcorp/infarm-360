-- 0050 — Folder Laporan (Google Drive) per pegawai.
--
-- Tombol "Unduh PDF" di Laporan Hasil Saya membuka folder Drive milik pegawai (berisi PDF laporan
-- semua kuartal, disiapkan HRD). Satu folder per pegawai, dipakai lintas kuartal → satu baris per
-- pegawai (bukan per periode).
--
-- Tabel TERPISAH dari employees karena emp_read terbaca luas; URL folder hanya untuk HRD & pemiliknya.
--   - Baca : HRD (is_hrd). Pegawai TIDAK membaca lewat RLS — halaman Laporan Hasil Saya memuatnya via
--            service_role dan HANYA bila pegawai punya laporan Final (gerbang di server).
--   - Tulis: HRD berakses bagian Kelola Pegawai (hrd_can('pegawai')), lewat Server Action setReportFolder.
-- Siapa yang BISA MEMBUKA folder diatur di Google Drive (berbagi terbatas, peran Pelihat) — bukan di sini.
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1).

create table if not exists employee_report_folders (
  employee_id uuid primary key references employees(id) on delete cascade,
  url         text not null
              check (url ~ '^https://drive\.google\.com/' and char_length(url) <= 500),
  updated_by  uuid references employees(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table employee_report_folders enable row level security;

drop policy if exists erf_read on employee_report_folders;
create policy erf_read on employee_report_folders for select using (is_hrd());

drop policy if exists erf_write on employee_report_folders;
create policy erf_write on employee_report_folders for all
  using (hrd_can('pegawai')) with check (hrd_can('pegawai'));
