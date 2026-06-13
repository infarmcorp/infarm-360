-- ============================================================================
-- Sifat Penilaian pada mapping: Wajib / Opsional.
-- Menambal fitur "Sifat" yang ditambahkan ke tipe Mapping setelah 0001.
-- true = Wajib (dasar Flag Kepatuhan keterlambatan), false = Opsional.
-- ============================================================================

alter table mappings add column if not exists mandatory boolean not null default true;
comment on column mappings.mandatory is 'Sifat Penilaian: true=Wajib, false=Opsional';
