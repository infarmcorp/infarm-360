-- 0024_page_grants
-- RBAC data-driven (Jalur B, pola Peninjau/Koordinator): HRD Admin memberi akses HALAMAN tertentu
-- kepada pegawai non-HRD (SPV/Koordinator/Direksi/Employee) dengan LINGKUP data:
--   'all'             → seluruh pegawai
--   'own_division'    → hanya divisi pemegang grant
--   'other_divisions' → semua pegawai SELAIN divisi pemegang grant
--
-- SIFAT: AUGMENT (menambah akses), TIDAK mengubah akses default per-peran (SPV/Koordinator tetap
-- lihat timnya lewat Monitor/Laporan Kinerja Tim seperti biasa). Aditif & backward-compatible:
-- TABEL BARU — tak menyentuh tabel/policy lama, tak ada migrasi data. Aman diterapkan ke DB live.
--
-- ⚠️ KEAMANAN: penegakan lingkup ADA DI SERVER (service_role berfilter) pada halaman targetnya —
-- BUKAN sekadar sembunyi menu. Grant ini SENGAJA TIDAK menyalakan is_hrd()/is_my_member, jadi RLS
-- pemegang grant TAK berubah (ia tetap tak bisa membaca data mentah orang lain lewat API). Batas
-- data NYATA muncul karena halaman membaca via service_role dengan filter lingkup (pola sama dgn
-- /peninjau & Koordinator). Jangan pernah menyiratkan halaman yang belum ditegakkan lingkupnya.

create table if not exists page_grants (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  section      text not null,           -- katalog GRANTABLE_PAGES (dikunci di lib/auth/roles.ts)
  scope        text not null default 'all' check (scope in ('all', 'own_division', 'other_divisions')),
  created_at   timestamptz not null default now(),
  created_by   uuid references employees(id) on delete set null,
  unique (employee_id, section)         -- satu grant per (orang, halaman); scope diubah = update
);

create index if not exists page_grants_employee_idx on page_grants (employee_id);

-- RLS: pemegang grant boleh MEMBACA baris grant-nya sendiri (untuk menyalakan menu & mengambil
-- lingkupnya). HRD boleh membaca semua. PENULISAN (insert/update/delete) HANYA lewat server
-- (service_role) di Server Action HRD — tak ada policy tulis untuk pengguna biasa.
alter table page_grants enable row level security;

drop policy if exists page_grants_self_read on page_grants;
create policy page_grants_self_read on page_grants
  for select using (employee_id = auth.uid() or is_hrd());
