-- ============================================================================
-- 0031 — Bobot 360° KHUSUS per pegawai (override skema periode)
-- ----------------------------------------------------------------------------
-- Sebagian pegawai butuh bobot penilai berbeda dari skema default periode
-- (weight_schemes). Tabel ini menyimpan override PER (periode, pegawai): baris
-- ADA → computeResult360 memakai model+weights ini untuk pegawai itu; TIDAK ada
-- → pakai skema aktif periode. Rumus terkunci di lib/score360.ts TIDAK berubah —
-- ini hanya mengganti nilai bobot yang disuapkan per pegawai.
-- ============================================================================
create table employee_weight_overrides (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references periods(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  model       weight_model not null,
  weights     jsonb not null,                       -- {"atasan":..,"peer":..,...}
  updated_by  uuid references employees(id),
  updated_at  timestamptz not null default now(),
  unique (period_id, employee_id)
);

alter table employee_weight_overrides enable row level security;

-- Baca: semua (selaras weight_schemes — bobot bukan data sensitif). Tulis: HRD.
create policy ewo_read  on employee_weight_overrides for select using (true);
create policy ewo_write on employee_weight_overrides for all
  using (is_hrd()) with check (is_hrd());

create index ewo_period_idx on employee_weight_overrides (period_id);
