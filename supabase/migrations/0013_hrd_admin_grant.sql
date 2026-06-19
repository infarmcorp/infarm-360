-- ============================================================================
-- 0013 — Pisahkan IZIN "HRD Admin" dari kolom role (grant terpisah)
--
-- "HRD Admin" adalah KAPABILITAS (boleh mengoperasikan aplikasi), bukan jabatan.
-- Sebelumnya hanya bisa diwakili oleh role='hrd' tunggal → orang yang juga SPV/
-- employee harus mengorbankan posisi aslinya. Kolom grant ini memisahkannya:
--   - role         = posisi dasar (employee | spv | direksi | [hrd lama])
--   - is_hrd_admin = izin tambahan mengoperasikan aplikasi sebagai HRD Admin
--
-- is_hrd() kini = punya grant ATAU role='hrd' (backward-compatible: tak ada yang
-- berubah sampai grant dinyalakan; HRD lama tetap HRD). Default false → aditif &
-- aman diterapkan ke data live.
-- ============================================================================

alter table employees add column if not exists is_hrd_admin boolean not null default false;

create or replace function is_hrd() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_hrd_admin or role = 'hrd' from employees where id = auth.uid()),
    false)
$$;
