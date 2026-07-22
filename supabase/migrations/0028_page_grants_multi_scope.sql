-- 0028_page_grants_multi_scope
-- Lingkup MULTI untuk grant halaman (RBAC, lanjutan 0024/0025/0027). Sebuah grant kini boleh memiliki
-- BEBERAPA lingkup sekaligus (mis. "Selain divisi" + "Diri sendiri") — disimpan di kolom `scopes text[]`.
--
-- ADITIF & BACKWARD-COMPATIBLE (penting: kolom `scope` lama TETAP ADA):
--   - App yang sudah LIVE di `main` (grant Monitor) masih membaca kolom tunggal `scope` → JANGAN dihapus.
--     Kode baru menulis `scope = scopes[0]` (representatif) + `scopes = <daftar>` agar keduanya sinkron,
--     sehingga tak ada jendela rusak antara apply-migrasi dan deploy.
--   - Baris lama di-backfill: `scopes := array[scope]`.
--   - CHECK: tiap elemen ∈ {all, own_division, other_divisions, self} (subset). Array kosong = tanpa
--     akses (aman; `grantedAccess` mengembalikan null). Non-kosong ditegakkan di app (Zod).
-- Aman diterapkan ke DB live: hanya menambah kolom + backfill, tak mengubah data akses yang sudah ada.
alter table page_grants add column if not exists scopes text[] not null default '{}';

update page_grants set scopes = array[scope]
  where cardinality(scopes) = 0 and scope is not null;

alter table page_grants drop constraint if exists page_grants_scopes_valid;
alter table page_grants add constraint page_grants_scopes_valid
  check (scopes <@ array['all', 'own_division', 'other_divisions', 'self']::text[]);
