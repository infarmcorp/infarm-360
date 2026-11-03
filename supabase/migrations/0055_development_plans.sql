-- 0055 — Rencana Pengembangan & persetujuan (Tahap 1), dari PDF laporan bagian 5, 7, 8.
--
-- Pegawai mengisi Rencana Pengembangan (prioritas: area, target, langkah, tenggat, pendamping, indikator) untuk
-- kuartal SESUDAH periode laporannya (laporan Q3 → "Rencana Pengembangan Q4"). Atasan langsung berkomentar
-- (Konfirmasi Kinerja + Dukungan wajib; Konteks & Harapan opsional) lalu Setujui / Minta Perbaikan; HRD (posisi HRD,
-- Mode Admin) menyetujui terakhir → Disepakati (terkunci). Direksi punya rencana tanpa alur persetujuan.
--
--   - Rencana MELEKAT ke periode LAPORAN (source_period_id), bukan periode aktif: terbuka bila laporan pegawai di
--     periode itu Final dan HRD belum menutup rencana periode itu (periods.dev_plan_closed_at). Periode yang sudah
--     dikunci/diakhiri TIDAK menutupnya — 1-on-1 berlangsung di kuartal berikutnya.
--   - periods.dev_plan_due = "Batas rencana disepakati" (informasi saja; keterlambatan tidak dicatat).
--   - Tidak menyentuh skor, final_reports, atau kunci laporan Final.
--
-- Akses: baca = pemilik, HRD (is_hrd), Direksi (is_direksi). Atasan membaca rencana timnya lewat server
-- (service_role, setelah cek atasan). TULIS hanya lewat Server Action (service_role) — tanpa policy tulis.
-- Aplikasi tetap jalan tanpa migrasi ini (halaman menampilkan "belum aktif").
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1).

alter table periods add column if not exists dev_plan_closed_at timestamptz;
alter table periods add column if not exists dev_plan_due date;

create table if not exists development_plans (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references employees(id) on delete cascade,
  source_period_id     uuid not null references periods(id) on delete cascade,
  status               text not null default 'draft'
                       check (status in ('draft', 'waiting_supervisor', 'revision', 'waiting_hrd', 'agreed')),
  -- Komentar Atasan Langsung (PDF bagian 7).
  sup_confirmation     text,
  sup_context          text,
  sup_support          text,
  sup_hope             text,
  revision_reason      text,
  -- Persetujuan (PDF bagian 8): id + nama saat itu + waktu.
  employee_signed_at   timestamptz,
  supervisor_id        uuid references employees(id) on delete set null,
  supervisor_name      text,
  supervisor_signed_at timestamptz,
  hrd_id               uuid references employees(id) on delete set null,
  hrd_name             text,
  hrd_signed_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint development_plans_one_per_period unique (employee_id, source_period_id)
);
create index if not exists development_plans_period on development_plans (source_period_id, status);

create table if not exists development_plan_items (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references development_plans(id) on delete cascade,
  order_idx         int  not null default 0,
  area              text not null default '',
  target            text not null default '',
  actions           text not null default '',
  due_text          text not null default '',
  companion         text not null default '',
  success_indicator text not null default '',
  constraint development_plan_items_len check (
    char_length(area) <= 500 and char_length(target) <= 1000 and char_length(actions) <= 2000 and
    char_length(due_text) <= 200 and char_length(companion) <= 200 and char_length(success_indicator) <= 1000)
);
create index if not exists development_plan_items_plan on development_plan_items (plan_id, order_idx);

alter table development_plans enable row level security;
alter table development_plan_items enable row level security;

drop policy if exists dp_read on development_plans;
create policy dp_read on development_plans for select
  using (employee_id = auth.uid() or is_hrd() or is_direksi());

drop policy if exists dpi_read on development_plan_items;
create policy dpi_read on development_plan_items for select
  using (exists (select 1 from development_plans p where p.id = plan_id
                 and (p.employee_id = auth.uid() or is_hrd() or is_direksi())));

-- Tulis hanya service_role (Server Action). Tanpa policy insert/update/delete + hak tulis dicabut.
revoke insert, update, delete on table development_plans from anon, authenticated;
revoke insert, update, delete on table development_plan_items from anon, authenticated;
