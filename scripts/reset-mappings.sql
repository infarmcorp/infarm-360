-- ============================================================================
-- RESET PEMETAAN — kosongkan HANYA pemetaan 360° (+ permohonan koreksi relasi
-- yang menempel padanya). Tak menyentuh pegawai, periode, pertanyaan, bobot,
-- maupun data hasil. Berguna untuk menyusun ulang pemetaan dari nol.
--
--  DISIMPAN  : semua kecuali di bawah.
--  DIHAPUS   : mappings, relation_correction_requests.
--
--  Idempoten & aman diulang. ⚠ TAK BISA DI-UNDO selain dari backup JSON yang
--  dibuat scripts/reset-mappings.mjs sebelum truncate.
-- ============================================================================

truncate table
  relation_correction_requests,
  mappings
restart identity cascade;
