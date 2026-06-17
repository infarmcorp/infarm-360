-- ============================================================================
-- RESET PENUH — sisakan HANYA data pegawai. Mengosongkan SELURUH konfigurasi
-- (periode, bulan, aspek, indikator, esai, bobot, pemetaan) + semua data hasil.
--
--  DISIMPAN  : employees, spv_team_members  (+ akun login/auth tak tersentuh)
--  DIHAPUS   : semua tabel lain — aplikasi kembali ke kondisi "baru" yang hanya
--              berisi daftar pegawai; siklus harus disusun ulang dari awal
--              (buat periode → pertanyaan → bobot → pemetaan).
--
--  Idempoten & aman diulang. ⚠ TAK BISA DI-UNDO selain dari backup JSON yang
--  dibuat scripts/reset-full.mjs sebelum truncate.
-- ============================================================================

truncate table
  assessment_indicator_scores,
  assessment_qual_answers,
  assessments,
  kpi_scores,
  kpi_audit,
  result_360,
  compliance_penalties,
  final_reports,
  succession_plans,
  relation_correction_requests,
  hrd_audit_log,
  mappings,
  weight_schemes,
  indicators,
  culture_aspects,
  qualitative_questions,
  period_months,
  periods
restart identity cascade;
