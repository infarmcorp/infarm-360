-- 0029_page_grants_coordinator_team_scope
-- Fase 2 Manajemen Akses: lingkup baru 'coordinator_team' — pemegang grant (koordinator) hanya
-- melihat anggota TIM NAUNGANNYA (coordinator_team_members), bukan seluruh divisi. Dipakai saat
-- HRD memberi akses ke PERAN "Koordinator" secara massal.
--
-- ADITIF & BACKWARD-COMPATIBLE: hanya memperlebar dua CHECK (scopes[] baru + scope tunggal lama)
-- agar menerima nilai 'coordinator_team'. Tak mengubah data yang ada.

-- 1) CHECK daftar lingkup baru (0028): tambahkan 'coordinator_team' ke himpunan sah.
alter table page_grants drop constraint if exists page_grants_scopes_valid;
alter table page_grants add constraint page_grants_scopes_valid
  check (scopes <@ array['all', 'own_division', 'other_divisions', 'self', 'coordinator_team']::text[]);

-- 2) CHECK kolom tunggal lama `scope` (0027): setPageGrant menulis scope = scopes[0], jadi kolom lama
--    juga harus menerima 'coordinator_team'.
alter table page_grants drop constraint if exists page_grants_scope_check;
alter table page_grants add constraint page_grants_scope_check
  check (scope in ('all', 'own_division', 'other_divisions', 'self', 'coordinator_team'));
