-- ============================================================================
-- 0038 — ALASAN NOT ELIGIBLE (BR-03, dropdown final HRD 2026-09-28)
-- ----------------------------------------------------------------------------
-- Rater yang memilih Not Eligible pada Exposure Check kini WAJIB memilih satu
-- alasan (dropdown 4 pilihan, "Lainnya" wajib keterangan). Disimpan sebagai teks
-- resolusi akhir (isi pilihan, atau keterangan bebas bila "Lainnya") — pola sama
-- dengan `relation_correction_requests.reason` (BR-04), bukan enum kode.
-- ============================================================================

alter table assessments add column if not exists exposure_reason text;
comment on column assessments.exposure_reason is
  'BR-03 — alasan Not Eligible (wajib diisi saat exposure_status=not_eligible). Teks hasil resolusi dropdown, mengikuti pola relation_correction_requests.reason.';
