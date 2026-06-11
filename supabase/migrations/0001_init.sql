-- ============================================================================
-- Infarm 360° Performance Appraisal — Skema Awal
-- Diturunkan dari src/types.ts & src/data.ts (kondisi as-is) menuju Supabase.
--
-- Konvensi:
--   * PK pakai uuid; "emp_code" (EMP001/SPV001/dst) disimpan sebagai bisnis-key.
--   * Semua tabel RLS ON. Lihat 0002_policies.sql untuk kebijakan akses.
--   * Tulisan/skor sensitif (skor 360 final, kalibrasi, finalisasi report)
--     ditulis dari Server Action via service_role yang mem-bypass RLS.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type user_role        as enum ('employee', 'spv', 'hrd', 'direksi');
create type period_status     as enum ('active', 'ended');
create type assessment_status as enum ('draft', 'submitted');   -- UI: draft/pending/done
create type relation_kind     as enum ('Atasan', 'Peer', 'Cross', 'Self', 'Bawahan');
create type correction_status as enum ('pending', 'approved', 'rejected');
create type report_status     as enum ('draft', 'finalized');
create type weight_model      as enum ('4class', '2class');     -- Model 4-Kelas / 2-Kelas
create type succession_status as enum ('draft', 'submitted', 'approved', 'rejected');

-- ----------------------------------------------------------------------------
-- EMPLOYEES  (profil; id = auth.users.id)
-- ----------------------------------------------------------------------------
create table employees (
  id         uuid primary key references auth.users(id) on delete cascade,
  emp_code   text not null unique,                 -- 'EMP001'
  name       text not null,
  dept       text not null,
  role       user_role not null default 'employee',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Keanggotaan tim SPV (many-to-many: 1 pegawai bisa dinilai >1 SPV — lih. SPV_TEAMS)
create table spv_team_members (
  spv_id      uuid not null references employees(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  primary key (spv_id, employee_id)
);
create index on spv_team_members (employee_id);

-- ----------------------------------------------------------------------------
-- PERIODS (kuartal) + bulan-bulannya
-- ----------------------------------------------------------------------------
create table periods (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                 -- 'Q3-2026'
  label      text not null,                        -- 'Q3 2026'
  start_date date not null,
  end_date   date not null,
  status     period_status not null default 'active',
  has_360    boolean not null default false,
  created_at timestamptz not null default now()
);

create table period_months (
  period_id uuid not null references periods(id) on delete cascade,
  ym        text not null,                         -- '2026-07'
  primary key (period_id, ym)
);

-- ----------------------------------------------------------------------------
-- KELOLA PERTANYAAN — aspek budaya, indikator kuantitatif, esai kualitatif
-- ----------------------------------------------------------------------------
create table culture_aspects (
  id         uuid primary key default gen_random_uuid(),
  period_id  uuid not null references periods(id) on delete cascade,
  name       text not null,                        -- ASPEK[] (5 aspek)
  order_idx  int  not null default 0
);

create table indicators (                          -- Q_QUANT (rating 1-5)
  id         uuid primary key default gen_random_uuid(),
  aspect_id  uuid not null references culture_aspects(id) on delete cascade,
  text       text not null,
  order_idx  int  not null default 0,
  is_active  boolean not null default true
);

create table qualitative_questions (               -- Q_QUAL (esai bebas)
  id         uuid primary key default gen_random_uuid(),
  period_id  uuid not null references periods(id) on delete cascade,
  text       text not null,
  order_idx  int  not null default 0
);

-- Bobot penilai per periode (Kelola Bobot — Model 4-Kelas / 2-Kelas)
create table weight_schemes (
  id         uuid primary key default gen_random_uuid(),
  period_id  uuid not null references periods(id) on delete cascade,
  model      weight_model not null,
  weights    jsonb not null,                       -- {"Atasan":0.4,"Peer":0.3,...}
  is_active  boolean not null default false,
  updated_by uuid references employees(id),
  updated_at timestamptz not null default now()
);
create unique index one_active_weight_per_period
  on weight_schemes (period_id) where is_active;

-- ----------------------------------------------------------------------------
-- PEMETAAN (mapping) penilai ↔ yang dinilai + permohonan koreksi relasi
-- ----------------------------------------------------------------------------
create table mappings (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references periods(id) on delete cascade,
  assessor_id uuid not null references employees(id) on delete cascade,  -- penilai
  target_id   uuid not null references employees(id) on delete cascade,  -- yang dinilai
  relation    relation_kind not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (period_id, assessor_id, target_id)
);
create index on mappings (period_id, assessor_id);
create index on mappings (period_id, target_id);

create table relation_correction_requests (
  id           uuid primary key default gen_random_uuid(),
  mapping_id   uuid references mappings(id) on delete set null,
  period_id    uuid not null references periods(id) on delete cascade,
  assessor_id  uuid not null references employees(id),
  target_id    uuid not null references employees(id),
  old_relation relation_kind,
  new_relation relation_kind,
  reason       text not null,
  status       correction_status not null default 'pending',
  reviewed_by  uuid references employees(id),
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PENILAIAN 360 — header + skor/komentar per indikator + jawaban kualitatif
-- ----------------------------------------------------------------------------
create table assessments (
  id           uuid primary key default gen_random_uuid(),
  period_id    uuid not null references periods(id) on delete cascade,
  assessor_id  uuid not null references employees(id) on delete cascade,
  target_id    uuid not null references employees(id) on delete cascade,
  status       assessment_status not null default 'draft',
  is_adhoc     boolean not null default false,     -- Hak Penilaian Ad-Hoc Mandiri
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (period_id, assessor_id, target_id)
);
create index on assessments (period_id, target_id);

create table assessment_indicator_scores (         -- q (rating) + qr (komentar/indikator)
  assessment_id uuid not null references assessments(id) on delete cascade,
  indicator_id  uuid not null references indicators(id) on delete cascade,
  rating        smallint check (rating between 1 and 5),
  comment       text,
  primary key (assessment_id, indicator_id)
);

create table assessment_qual_answers (             -- t (jawaban esai kualitatif)
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id   uuid not null references qualitative_questions(id) on delete cascade,
  answer        text,
  primary key (assessment_id, question_id)
);

-- ----------------------------------------------------------------------------
-- KPI — skor terkini per bulan + jejak audit (append-only)
-- ----------------------------------------------------------------------------
create table kpi_scores (
  employee_id uuid not null references employees(id) on delete cascade,
  ym          text not null,                       -- '2026-07'
  score       numeric(5,2) not null check (score between 0 and 100),
  updated_by  uuid references employees(id),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, ym)
);

create table kpi_audit (                            -- KPIHistory[*][month][] — tak boleh diedit
  id          bigint generated always as identity primary key,
  employee_id uuid not null references employees(id) on delete cascade,
  ym          text not null,
  score       numeric(5,2) not null,
  changed_by  uuid references employees(id),
  changed_at  timestamptz not null default now(),
  note        text                                 -- 'Komentar Ringkas Audit'
);
create index on kpi_audit (employee_id, ym);

-- ----------------------------------------------------------------------------
-- HASIL 360 (komputasi server) + FINAL REPORT + PROMOSI/SUKSESI
-- ----------------------------------------------------------------------------
create table result_360 (
  employee_id uuid not null references employees(id) on delete cascade,
  period_id   uuid not null references periods(id) on delete cascade,
  score       numeric(5,2),                        -- INITIAL_SCORE_360
  computed_at timestamptz not null default now(),
  primary key (employee_id, period_id)
);

create table final_reports (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  period_id    uuid not null references periods(id) on delete cascade,
  content      jsonb not null default '{}',        -- narasi, follow-up, komentar SPV, dll
  final_score  numeric(5,2),                       -- Skor Kalibrasi Akhir
  status       report_status not null default 'draft',
  spv_acc      boolean not null default false,     -- Laporan Kinerja Tim: ACC SPV
  finalized_by uuid references employees(id),
  pdf_path     text,                               -- Supabase Storage
  updated_at   timestamptz not null default now(),
  unique (employee_id, period_id)
);

create table succession_plans (                     -- Promosi & Penyesuaian
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  period_id       uuid not null references periods(id) on delete cascade,
  plan            text not null,                    -- Rencana Suksesi (Rekomendasi HRD)
  justification   text,                             -- Catatan Justifikasi & Rencana Detail
  status          succession_status not null default 'draft',
  proposed_by     uuid references employees(id),    -- HRD
  direksi_id      uuid references employees(id),    -- yang merespon
  direksi_comment text,
  created_at      timestamptz not null default now()
);
