-- 0056 — Rencana Pengembangan Tahap 2: catatan sesi 1-on-1 & tinjauan bulanan HRD (development_plan_sessions).
--
-- Setelah rencana DISEPAKATI, atasan mencatat sesi 1-on-1 (PDF bagian 6 baris 3, "tinjauan kemajuan dua mingguan"):
-- tanggal, catatan sesi, status umum (Sesuai rencana / Tertinggal) + kemajuan per prioritas. Pegawai menambah
-- tanggapan atas tiap sesi. HRD mencatat tinjauan bulanan (baris 4). Keputusan pemilik 2026-11-03: aplikasi HANYA
-- mencatat — terlambat atau tidaknya jadwal TIDAK dihitung/ditandai.
--
-- Akses: baca = sama dengan rencana (pemilik, HRD, Direksi lewat RLS; atasan lewat server). Tulis hanya service_role
-- (Server Action pengembangan/actions.ts). Aplikasi tetap jalan tanpa migrasi ini ("belum aktif").
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1), sesudah 0055.

create table if not exists development_plan_sessions (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid not null references development_plans(id) on delete cascade,
  kind             text not null check (kind in ('one_on_one', 'hrd_monthly')),
  session_date     date not null,
  author_id        uuid references employees(id) on delete set null,
  author_name      text,
  summary          text not null,
  overall_status   text check (overall_status in ('on_track', 'behind')),
  -- [{ "item_id": uuid, "status": "on_track"|"behind"|"done", "note": text }] — divalidasi Zod di server.
  item_progress    jsonb not null default '[]'::jsonb,
  employee_note    text,
  employee_note_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint development_plan_sessions_len check (
    char_length(btrim(summary)) between 1 and 4000 and coalesce(char_length(employee_note), 0) <= 2000)
);
create index if not exists development_plan_sessions_plan on development_plan_sessions (plan_id, session_date);

alter table development_plan_sessions enable row level security;
drop policy if exists dps_read on development_plan_sessions;
create policy dps_read on development_plan_sessions for select
  using (exists (select 1 from development_plans p where p.id = plan_id
                 and (p.employee_id = auth.uid() or is_hrd() or is_direksi())));
revoke insert, update, delete on table development_plan_sessions from anon, authenticated;
