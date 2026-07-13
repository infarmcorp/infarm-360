-- 0021_employee_coordinator
-- Peran "Koordinator": pegawai yang membawahi beberapa pegawai & diberi akses LIHAT-SAJA
-- "Laporan Kinerja Tim" untuk DAFTAR pegawai eksplisit yang dinaunginya (sebagian pegawai
-- lain tetap langsung ke SPV). Lihat CLAUDE.md (Pengembangan opsional) & app/(app)/laporan-tim.
--
-- PENTING — keamanan (pola Peninjau, migrasi 0018): kolom `is_coordinator` SENGAJA TIDAK
-- menyentuh is_hrd()/is_my_member. Pemegang grant tetap pegawai biasa di level RLS → TIDAK
-- bisa membaca KPI/laporan/umpan-balik L3 pegawai lain lewat API. Akses Laporan Kinerja Tim
-- diberikan HANYA lewat server (service_role) di jalur /laporan-tim & /laporan/[id] yang
-- berlingkup daftar `coordinator_team_members` koordinator ybs, DAN selalu membuang lapis 3
-- (komentar mentah per penilai). Jadi batas privasi NYATA, bukan sekadar sembunyi menu.
--
-- Aditif & backward-compatible (default false → semua pegawai lama tanpa grant ini).
alter table employees add column if not exists is_coordinator boolean not null default false;

-- Keanggotaan tim koordinator (1 koordinator → banyak pegawai). Cermin spv_team_members.
create table if not exists coordinator_team_members (
  coordinator_id uuid not null references employees(id) on delete cascade,
  employee_id    uuid not null references employees(id) on delete cascade,
  primary key (coordinator_id, employee_id)
);

alter table coordinator_team_members enable row level security;

-- Baca: HRD (mengelola) atau koordinator ybs (melihat daftar timnya). Tulis: HANYA HRD.
-- (Data laporan tim tetap dibaca via service_role di server; policy ini untuk kelengkapan
-- keamanan tabel — mencegah pegawai lain mengintip penetapan koordinator.)
drop policy if exists coord_team_read on coordinator_team_members;
create policy coord_team_read on coordinator_team_members for select
  using (is_hrd() or coordinator_id = auth.uid());

drop policy if exists coord_team_write on coordinator_team_members;
create policy coord_team_write on coordinator_team_members for all
  using (is_hrd()) with check (is_hrd());
