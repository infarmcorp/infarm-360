-- ============================================================================
-- CEK STATUS MIGRASI — jalankan di Supabase SQL Editor project mana pun
-- (production ATAU staging) untuk melihat migrasi 0001–0040 mana yang SUDAH
-- diterapkan ke database tsb, tanpa perlu mengingat riwayatnya secara manual.
--
-- Cara pakai: copy-paste seluruh isi file ini ke SQL Editor → Run. Kolom
-- "applied = false" pada baris paling atas (nomor kecil) TIDAK NORMAL — berarti
-- ada migrasi awal yang terlewat. Baris "applied = false" di nomor besar
-- (mendekati akhir) WAJAR bila memang belum sempat dijalankan — jalankan
-- file .sql-nya di supabase/migrations/ sesuai nomor sebelum PR/merge.
--
-- Catatan: tidak mendeteksi 0033 (migrasi DATA, bukan skema) — lihat catatan
-- di bawah tabel.
-- ============================================================================

select * from (values
  ('0001', 'tabel employees',                              to_regclass('public.employees') is not null),
  ('0002', 'kebijakan RLS emp_read',                        exists(select 1 from pg_policies where tablename='employees' and policyname='emp_read')),
  ('0003', 'tabel compliance_penalties',                    to_regclass('public.compliance_penalties') is not null),
  ('0004', 'kolom mappings.mandatory',                       exists(select 1 from information_schema.columns where table_name='mappings' and column_name='mandatory')),
  ('0005', 'tabel hrd_audit_log',                            to_regclass('public.hrd_audit_log') is not null),
  ('0006', 'kolom indicators.rating_guide',                  exists(select 1 from information_schema.columns where table_name='indicators' and column_name='rating_guide')),
  ('0007', 'indeks idx_assessments_period_assessor',         exists(select 1 from pg_indexes where indexname='idx_assessments_period_assessor')),
  ('0008', 'kebijakan RLS kpi_write',                        exists(select 1 from pg_policies where tablename='kpi_scores' and policyname='kpi_write')),
  ('0009', 'kebijakan RLS fr_read',                          exists(select 1 from pg_policies where tablename='final_reports' and policyname='fr_read')),
  ('0010', 'kolom periods.kpi_standard',                     exists(select 1 from information_schema.columns where table_name='periods' and column_name='kpi_standard')),
  ('0011', 'enum report_status berisi in_review',            exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='report_status' and e.enumlabel='in_review')),
  ('0012', 'kebijakan RLS asmt_read',                        exists(select 1 from pg_policies where tablename='assessments' and policyname='asmt_read')),
  ('0013', 'kolom employees.is_hrd_admin',                   exists(select 1 from information_schema.columns where table_name='employees' and column_name='is_hrd_admin')),
  ('0014', 'kolom relation_correction_requests.reviewed_at', exists(select 1 from information_schema.columns where table_name='relation_correction_requests' and column_name='reviewed_at')),
  ('0015', 'kolom mappings.is_adhoc',                        exists(select 1 from information_schema.columns where table_name='mappings' and column_name='is_adhoc')),
  ('0016', 'kolom employees.is_external',                    exists(select 1 from information_schema.columns where table_name='employees' and column_name='is_external')),
  ('0017', 'kolom periods.form_open',                        exists(select 1 from information_schema.columns where table_name='periods' and column_name='form_open')),
  ('0018', 'kolom employees.is_cross_reviewer',               exists(select 1 from information_schema.columns where table_name='employees' and column_name='is_cross_reviewer')),
  ('0019', 'kolom kpi_audit.action',                          exists(select 1 from information_schema.columns where table_name='kpi_audit' and column_name='action')),
  ('0020', 'kolom employees.joined_on',                       exists(select 1 from information_schema.columns where table_name='employees' and column_name='joined_on')),
  ('0021', 'kolom employees.is_coordinator',                  exists(select 1 from information_schema.columns where table_name='employees' and column_name='is_coordinator')),
  ('0022', 'assessment_indicator_scores.rating jadi numeric', exists(select 1 from information_schema.columns where table_name='assessment_indicator_scores' and column_name='rating' and data_type='numeric')),
  ('0023', 'kolom employees.hrd_sections',                    exists(select 1 from information_schema.columns where table_name='employees' and column_name='hrd_sections')),
  ('0024', 'tabel page_grants',                               to_regclass('public.page_grants') is not null),
  ('0025', 'kolom page_grants.can_edit',                      exists(select 1 from information_schema.columns where table_name='page_grants' and column_name='can_edit')),
  ('0026', 'rating presisi numeric(8,6)',                     exists(select 1 from information_schema.columns where table_name='assessment_indicator_scores' and column_name='rating' and numeric_scale=6)),
  ('0027', 'constraint page_grants_scope_check',              exists(select 1 from information_schema.table_constraints where table_name='page_grants' and constraint_name='page_grants_scope_check')),
  ('0028', 'kolom page_grants.scopes',                        exists(select 1 from information_schema.columns where table_name='page_grants' and column_name='scopes')),
  ('0029', 'constraint page_grants_scopes_valid',             exists(select 1 from information_schema.table_constraints where table_name='page_grants' and constraint_name='page_grants_scopes_valid')),
  ('0030', 'kolom employees.access_reviewed_at',              exists(select 1 from information_schema.columns where table_name='employees' and column_name='access_reviewed_at')),
  ('0031', 'tabel employee_weight_overrides',                 to_regclass('public.employee_weight_overrides') is not null),
  ('0032', 'kolom page_grants.can_finalize',                  exists(select 1 from information_schema.columns where table_name='page_grants' and column_name='can_finalize')),
  ('0034', 'kolom employees.nickname',                        exists(select 1 from information_schema.columns where table_name='employees' and column_name='nickname')),
  ('0035', 'kolom periods.mapping_published',                 exists(select 1 from information_schema.columns where table_name='periods' and column_name='mapping_published')),
  ('0036', 'kolom assessments.first_submitted_at',            exists(select 1 from information_schema.columns where table_name='assessments' and column_name='first_submitted_at')),
  ('0037', 'kolom assessments.exposure_status',               exists(select 1 from information_schema.columns where table_name='assessments' and column_name='exposure_status')),
  ('0038', 'kolom assessments.exposure_reason',                exists(select 1 from information_schema.columns where table_name='assessments' and column_name='exposure_reason')),
  ('0039', 'kolom assessment_indicator_scores.na_reason',      exists(select 1 from information_schema.columns where table_name='assessment_indicator_scores' and column_name='na_reason')),
  ('0040', 'kolom indicators.rating_key_points',               exists(select 1 from information_schema.columns where table_name='indicators' and column_name='rating_key_points'))
) as t(migrasi, penanda_skema, applied)
order by migrasi;

-- 0033 (retire_cross_reviewer_to_grant) TIDAK ikut di atas — itu migrasi DATA
-- (memindahkan is_cross_reviewer=true ke baris page_grants), bukan perubahan
-- skema, jadi tak bisa dideteksi lewat information_schema. Cek manual:
--   select count(*) from employees where is_cross_reviewer = true;
-- Hasil 0 di database yang SUDAH lama dipakai (bukan database baru/kosong)
-- adalah tanda kuat 0033 sudah pernah dijalankan.
