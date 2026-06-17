-- ============================================================================
-- Indeks pelengkap — higienis & future-proofing sebelum go-live.
-- Postgres mengindeks PK & UNIQUE otomatis, TAPI bukan kolom foreign key.
-- Migrasi ini menambah indeks pada kolom FK yang kerap jadi filter (where ...),
-- agar query tetap cepat saat data menumpuk (banyak kuartal / ribuan penilaian).
-- Semua idempoten (IF NOT EXISTS) — aman dijalankan berulang, tak mengubah data.
-- ============================================================================

-- assessments: filter utama oleh PENILAI saat employee buka "Daftar Penilaian Saya"
-- (assessor_id adalah FK → tak terindeks otomatis; (period_id,target_id) sudah ada).
create index if not exists idx_assessments_period_assessor
  on assessments (period_id, assessor_id);

-- culture_aspects per periode (form penilaian, kelola pertanyaan, dashboard).
create index if not exists idx_culture_aspects_period
  on culture_aspects (period_id);

-- indicators per aspek (.in('aspect_id', [...]) di banyak halaman).
create index if not exists idx_indicators_aspect
  on indicators (aspect_id);

-- qualitative_questions per periode.
create index if not exists idx_qual_questions_period
  on qualitative_questions (period_id);

-- final_reports: dibaca per periode & per (pegawai, periode) — PK adalah id acak.
create index if not exists idx_final_reports_period
  on final_reports (period_id);
create index if not exists idx_final_reports_emp_period
  on final_reports (employee_id, period_id);

-- succession_plans per periode.
create index if not exists idx_succession_period
  on succession_plans (period_id);

-- relation_correction_requests: badge "menunggu" per periode + status.
create index if not exists idx_corr_period_status
  on relation_correction_requests (period_id, status);

-- compliance_penalties & result_360: sering difilter per periode saja, tapi PK
-- dipimpin employee_id → tambahkan indeks period_id agar filter periode efisien.
create index if not exists idx_penalties_period
  on compliance_penalties (period_id);
create index if not exists idx_result360_period
  on result_360 (period_id);
