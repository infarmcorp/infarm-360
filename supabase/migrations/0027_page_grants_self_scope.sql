-- 0027_page_grants_self_scope
-- Tambah nilai lingkup 'self' (Diri sendiri) ke page_grants.scope (RBAC, lanjutan 0024/0025).
--   'self' → pemegang grant HANYA melihat/menyentuh CATATAN DIRINYA SENDIRI (employee_id = dirinya).
-- Berbeda dari tiga nilai lama yang berbasis DIVISI ('all'/'own_division'/'other_divisions'): 'self'
-- disaring per-ID, bukan per-dept. Penegakan ada di server pada tiap halaman target (cabang khusus
-- `eq('id', <pemegang>)`); helper dept (deptScopeFilter/applyDeptScope) FAIL-CLOSED untuk 'self'
-- (op 'none' → tak cocok siapa pun) agar tak pernah bocor bila sebuah halaman lupa cabang self.
-- Aditif & backward-compatible: hanya memperlebar CHECK; grant lama tak terpengaruh. Aman ke DB live.
alter table page_grants drop constraint if exists page_grants_scope_check;
alter table page_grants add constraint page_grants_scope_check
  check (scope in ('all', 'own_division', 'other_divisions', 'self'));
