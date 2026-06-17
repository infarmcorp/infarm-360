-- ============================================================================
-- RESET DATA — kosongkan seluruh data HASIL/transaksi, pertahankan KONFIGURASI.
--
--  DISIMPAN  : employees, spv_team_members, periods, period_months,
--              culture_aspects, indicators, qualitative_questions,
--              weight_schemes, mappings  (+ akun login/auth tak tersentuh)
--  DIHAPUS   : seluruh penilaian, KPI, skor 360°, punishment, laporan final,
--              suksesi, koreksi relasi, dan log audit HRD.
--
--  Idempoten & aman diulang. TRUNCATE me-reset identity (kpi_audit, hrd_audit_log).
--  CASCADE hanya merembet ke anak FK tabel di daftar ini (skor/jawaban penilaian).
--  ⚠ TAK BISA DI-UNDO — jalankan lewat scripts/reset-data.mjs yang backup dulu.
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
  hrd_audit_log
restart identity cascade;
