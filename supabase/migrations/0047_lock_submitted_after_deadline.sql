-- ============================================================================
-- 0047 — PENILAIAN TERKIRIM TERKUNCI SETELAH DEADLINE (Decision 01, Screen 01 & 04; 2026-10-01)
--
-- Rater boleh mengedit penilaian yang sudah DIKIRIM hanya sampai deadline periode
-- (periods.assessment_deadline). Sesudah deadline penilaian terkirim menjadi read-only ("Lihat").
-- Penilaian yang BELUM terkirim (draf / belum mulai) tetap boleh diselesaikan & dikirim sesudah
-- deadline — tercatat Terlambat (BR-07/BR-08). Periode tanpa deadline → tak ada penguncian.
--
-- Aplikasi sudah menolak di Server Action; migrasi ini membuat DATABASE menolak hal yang sama
-- untuk pemanggilan API langsung. HRD (bagian Progress, mis. Paksa Selesai) & service_role tak
-- terpengaruh. Idempoten. Terapkan SETELAH 0046 (memuat ulang assessment_writable versi 0046).
-- ============================================================================

-- Terkirim + deadline lewat? (dipakai fungsi & trigger di bawah)
create or replace function assessment_locked_after_deadline(a_status text, a_period uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select a_status = 'submitted' and exists (
    select 1 from periods p
    where p.id = a_period and p.assessment_deadline is not null and now() > p.assessment_deadline
  )
$$;

-- Isi penilaian (skor/esai) tak bisa ditulis bila penilaian terkirim sudah melewati deadline.
create or replace function assessment_writable(aid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assessments a join periods p on p.id = a.period_id
    where a.id = aid
      and a.assessor_id = auth.uid()
      and a.status::text <> 'invalidated'
      and not assessment_locked_after_deadline(a.status::text, a.period_id)
      and p.status = 'active' and p.has_360 and p.form_open
      and exists (
        select 1 from mappings m
        where m.period_id = a.period_id and m.assessor_id = a.assessor_id
          and m.target_id = a.target_id and m.is_active
      )
  )
$$;

-- Kepala penilaian: pengguna non-HRD tak boleh mengubah/menghapus penilaian terkirim sesudah deadline.
create or replace function assessments_guard_deadline_lock() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or hrd_can('progress') then
    return coalesce(new, old);
  end if;
  if assessment_locked_after_deadline(old.status::text, old.period_id) then
    raise exception 'Deadline sudah lewat — penilaian yang sudah terkirim tidak dapat diubah lagi' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_assessments_guard_deadline_lock on assessments;
create trigger trg_assessments_guard_deadline_lock
  before update or delete on assessments
  for each row execute function assessments_guard_deadline_lock();
