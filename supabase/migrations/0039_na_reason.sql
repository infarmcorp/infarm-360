-- ============================================================================
-- 0039 — ALASAN N/A (BR-05, dropdown final HRD 2026-09-28)
-- ----------------------------------------------------------------------------
-- Rater yang menandai N/A pada suatu indikator kini WAJIB memilih satu alasan
-- (dropdown 3 pilihan, "Lainnya" wajib keterangan). Disimpan terpisah dari
-- `comment` (evidence rating 1–5) — pola sama dengan `exposure_reason` (BR-03,
-- migrasi 0038): teks resolusi akhir, bukan enum kode.
-- ============================================================================

alter table assessment_indicator_scores add column if not exists na_reason text;
comment on column assessment_indicator_scores.na_reason is
  'BR-05 — alasan N/A (wajib diisi saat is_na=true). Teks hasil resolusi dropdown, mengikuti pola exposure_reason (BR-03).';
