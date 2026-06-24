-- 0015_mapping_is_adhoc — penanda eksplisit pemetaan Ad-Hoc (ditambah mandiri oleh penilai).
-- Memungkinkan penilai MENGHAPUS target ad-hoc miliknya tanpa rancu dengan penugasan HRD.
-- Aditif & backward-compatible: baris lama default false.
alter table public.mappings
  add column if not exists is_adhoc boolean not null default false;

-- Backfill: pemetaan lama hasil Ad-Hoc dapat dikenali dari pola pembuatannya
-- (relasi 'Cross' + Opsional). Sejak kebijakan "semua wajib", satu-satunya sumber
-- mandatory=false adalah Ad-Hoc, jadi penandaan ini aman.
update public.mappings
  set is_adhoc = true
  where is_adhoc = false and mandatory = false and relation = 'Cross';
