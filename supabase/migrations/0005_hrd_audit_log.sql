-- ============================================================================
-- 0005 — JEJAK AUDIT AKSI SENSITIF HRD
-- ----------------------------------------------------------------------------
-- Mencatat keputusan HRD yang berdampak luas: aktif/kunci periode, toggle 360,
-- ubah bobot, hitung ulang skor 360, finalisasi laporan, punishment, kelola akun
-- pegawai, pemetaan, koreksi relasi, kelola pertanyaan, paksa-selesai progress.
--
-- APPEND-ONLY: hanya ada policy SELECT (HRD/Direksi) & INSERT (HRD). Tanpa policy
-- UPDATE/DELETE → baris tak bisa diubah/dihapus dari klien (mirip kpi_audit).
-- ============================================================================
create table if not exists hrd_audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references employees(id) on delete set null, -- pelaku (HRD)
  actor_name   text,                                  -- snapshot nama (tahan rename/hapus)
  action       text not null,                         -- kode aksi, mis. 'period.lock'
  category     text not null default 'lain',          -- pengelompokan untuk filter UI
  summary      text not null,                         -- ringkasan manusiawi (Bahasa Indonesia)
  target_type  text,                                  -- 'employee' | 'period' | 'mapping' | ...
  target_id    text,                                  -- id entitas terkait (text agar fleksibel)
  target_label text,                                  -- snapshot label entitas (nama/label)
  meta         jsonb,                                 -- detail tambahan opsional
  created_at   timestamptz not null default now()
);
create index if not exists hrd_audit_log_created_idx  on hrd_audit_log (created_at desc);
create index if not exists hrd_audit_log_actor_idx    on hrd_audit_log (actor_id);
create index if not exists hrd_audit_log_category_idx on hrd_audit_log (category);

alter table hrd_audit_log enable row level security;

-- Baca: HRD & Direksi (pengawasan). Tulis: hanya HRD (pelaku). Immutable.
create policy hrd_audit_read on hrd_audit_log for select
  using (is_hrd() or is_direksi());
create policy hrd_audit_insert on hrd_audit_log for insert
  with check (is_hrd());
