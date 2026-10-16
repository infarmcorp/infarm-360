-- 0052 — Riwayat laporan (final_report_history): jejak setiap perubahan ACC, status, dan Skor Akhir.
--
-- Latar (kasus 2026-10-15/16): HRD yakin sudah ACC, tetapi tak ada bukti di database. Log aktivitas
-- (hrd_audit_log) dicatat oleh APLIKASI dan bersifat best-effort, jadi tak bisa menjadi bukti mutlak.
-- Riwayat ini dicatat oleh TRIGGER database pada final_reports — apa pun jalurnya (HRD, SPV,
-- Koordinator, Direksi, service_role, SQL langsung) setiap perubahan spv_acc / status / final_score
-- tersimpan beserta nilai lama, nilai baru, dan waktunya (sampai detik).
--
--   - Pelaku = auth.uid() saat itu. Penulisan lewat service_role (jalur server: ACC Koordinator/
--     Direksi, grant, dsb.) tak membawa auth.uid() → actor_id NULL; aplikasi melengkapinya dari
--     hrd_audit_log pada pegawai & waktu yang sama (lib/report-history.ts).
--   - Baca: HRD (is_hrd) saja. Tulis: hanya trigger (security definer) — tanpa policy insert/update/
--     delete untuk anon/authenticated → append-only dari sisi aplikasi.
--   - Baris awal: satu "snapshot" keadaan semua laporan saat migrasi dijalankan, agar riwayat punya
--     titik awal yang diketahui (hanya bila tabel masih kosong).
-- Aplikasi tetap jalan tanpa migrasi ini (panel riwayat menampilkan "belum aktif").
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1).

create table if not exists final_report_history (
  id          bigint generated always as identity primary key,
  report_id   uuid not null,
  employee_id uuid not null references employees(id) on delete cascade,
  period_id   uuid not null references periods(id) on delete cascade,
  changed_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  kind        text not null default 'change' check (kind in ('change', 'created', 'snapshot')),
  old_status  text,
  new_status  text,
  old_acc     boolean,
  new_acc     boolean,
  old_score   numeric(5,2),
  new_score   numeric(5,2)
);

create index if not exists final_report_history_emp_period
  on final_report_history (employee_id, period_id, changed_at);
create index if not exists final_report_history_period
  on final_report_history (period_id, changed_at);

alter table final_report_history enable row level security;
drop policy if exists frh_read on final_report_history;
create policy frh_read on final_report_history for select using (is_hrd());

create or replace function final_reports_track_history() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm  text;
begin
  if tg_op = 'UPDATE'
     and new.status      is not distinct from old.status
     and new.spv_acc     is not distinct from old.spv_acc
     and new.final_score is not distinct from old.final_score then
    return new; -- perubahan lain (ringkasan/konten) tak dicatat di sini
  end if;
  if uid is not null then
    select name into nm from employees where id = uid;
  end if;
  insert into final_report_history
    (report_id, employee_id, period_id, actor_id, actor_name, kind,
     old_status, new_status, old_acc, new_acc, old_score, new_score)
  values
    (new.id, new.employee_id, new.period_id, uid, nm,
     case when tg_op = 'INSERT' then 'created' else 'change' end,
     case when tg_op = 'UPDATE' then old.status::text end, new.status::text,
     case when tg_op = 'UPDATE' then old.spv_acc end, new.spv_acc,
     case when tg_op = 'UPDATE' then old.final_score end, new.final_score);
  return new;
end $$;

drop trigger if exists trg_final_reports_history on final_reports;
create trigger trg_final_reports_history
  after insert or update on final_reports
  for each row execute function final_reports_track_history();

-- Titik awal: keadaan semua laporan saat migrasi (sekali, bila tabel kosong).
insert into final_report_history
  (report_id, employee_id, period_id, actor_name, kind, new_status, new_acc, new_score)
select fr.id, fr.employee_id, fr.period_id, 'snapshot awal (migrasi 0052)', 'snapshot',
       fr.status::text, fr.spv_acc, fr.final_score
from final_reports fr
where not exists (select 1 from final_report_history);
