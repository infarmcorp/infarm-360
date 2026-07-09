-- ============================================================================
-- 0019 — Penanda aksi pada jejak audit KPI (dukung "Hapus KPI" oleh SPV)
--
-- Sebelumnya kpi_audit hanya mencatat pemberian/perubahan skor (semuanya tampil
-- sebagai angka). Fitur baru: SPV boleh MENGHAPUS skor KPI (kpi_scores) tim/dirinya,
-- dan penghapusan itu WAJIB tercatat di audit. Karena kpi_audit.score NOT NULL,
-- baris penghapusan disimpan dengan score = NILAI LAMA yang dihapus, dan dibedakan
-- lewat kolom baru `action`:
--   'set'    = input / edit skor (perilaku lama; default backward-compatible)
--   'delete' = penghapusan skor (score = nilai terakhir sebelum dihapus)
--
-- Tidak ada perubahan RLS: policy kpi_write sudah `for all` (mencakup DELETE) dan
-- terbatas ke tim/diri sendiri (migrasi 0008); kpiaudit_insert sudah mengizinkan
-- SPV menulis jejak untuk tim/dirinya.
-- ============================================================================

alter table kpi_audit
  add column if not exists action text not null default 'set';

alter table kpi_audit
  drop constraint if exists kpi_audit_action_check;
alter table kpi_audit
  add constraint kpi_audit_action_check check (action in ('set', 'delete'));

comment on column kpi_audit.action is
  'set = input/edit skor; delete = penghapusan skor (score = nilai lama yang dihapus)';
