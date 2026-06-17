-- ============================================================================
-- 0006 — PANDUAN PENILAIAN PER INDIKATOR (paritas legacy FormAssess)
-- ----------------------------------------------------------------------------
-- description   : penjelasan perilaku indikator (kotak biru di form Mulai Nilai).
-- rating_guide  : panduan tiap level rating, jsonb {"1":"…","2":"…",…,"5":"…"}.
-- Keduanya OPSIONAL & dikelola HRD di "Kelola Pertanyaan". RLS indikator tak berubah.
-- ============================================================================
alter table indicators add column if not exists description  text;
alter table indicators add column if not exists rating_guide jsonb;
