-- ============================================================================
-- Punishment Kepatuhan — pengurangan poin per pegawai per kuartal.
-- Menambal fitur yang ditambahkan setelah 0001/0002 (compliancePenalties di SPA).
-- Skor Akhir = blend KPI+360 DIKURANGI points (min 0), dihitung di server.
-- ============================================================================

create table compliance_penalties (
  employee_id uuid not null references employees(id) on delete cascade,
  period_id   uuid not null references periods(id) on delete cascade,
  points      numeric(5,2) not null default 0 check (points >= 0),
  reason      text,
  set_by      uuid references employees(id),   -- HRD yang menetapkan
  updated_at  timestamptz not null default now(),
  primary key (employee_id, period_id)
);

alter table compliance_penalties enable row level security;

-- Baca berjenjang (selaras kpi_scores/result_360): HRD, Direksi, pegawai ybs, SPV tim.
create policy penalty_read on compliance_penalties for select using (
  is_hrd() or is_direksi() or employee_id = auth.uid() or is_my_member(employee_id)
);

-- Tulis hanya HRD (punishment adalah kebijakan HRD).
create policy penalty_write on compliance_penalties for all
  using (is_hrd()) with check (is_hrd());
