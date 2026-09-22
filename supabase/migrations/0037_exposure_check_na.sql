-- ============================================================================
-- 0037 — EXPOSURE CHECK (BR-03) + N/A HANDLING (BR-05), Assessment 360° Q3 2026
-- ----------------------------------------------------------------------------
-- BR-03: sebelum menilai, rater wajib memastikan exposure kerja terhadap ratee —
--   Eligible / Partially Eligible / Not Eligible. Not Eligible → kewajiban gugur,
--   tidak dihitung tunggakan, tidak dihitung skor, tidak kena penalty keterlambatan.
--   Disimpan di `assessments.exposure_status` (bukan enum status baru, agar orthogonal
--   terhadap draft/submitted — Not Eligible tak pernah mencapai status 'submitted').
--   Terkunci setelah dikonfirmasi (app-level, lihat setExposureStatus); koreksi lewat
--   HRD menyusul di Tahap 2.
--
-- BR-05: rater boleh memilih N/A per indikator (tak punya exposure/evidence cukup).
--   N/A BUKAN nilai 0 dan dikecualikan dari perhitungan skor — logika hitung skor
--   (admin/360/actions.ts) sudah melewati rating NULL, dan N/A selalu disimpan dengan
--   rating NULL, sehingga otomatis terkecualikan tanpa perubahan tambahan di sana.
-- ============================================================================

alter table assessments add column if not exists exposure_status text
  check (exposure_status in ('eligible', 'partially_eligible', 'not_eligible'));
alter table assessments add column if not exists exposure_confirmed_at timestamptz;
comment on column assessments.exposure_status is
  'BR-03 Exposure Check — dipilih rater sebelum menilai. NULL = belum dicek. not_eligible = kewajiban gugur (tak dihitung tunggakan/skor/penalty).';
comment on column assessments.exposure_confirmed_at is 'Waktu Exposure Check dikonfirmasi rater.';

alter table assessment_indicator_scores add column if not exists is_na boolean not null default false;
comment on column assessment_indicator_scores.is_na is
  'BR-05 N/A Handling — true = rater memilih N/A (tak punya exposure/evidence cukup untuk indikator ini). Rating selalu NULL saat is_na=true; bukan nilai 0, dikecualikan dari skor.';
