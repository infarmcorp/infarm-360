-- ============================================================================
-- 0036 — DEADLINE PENILAIAN 360° + POTONGAN KETERLAMBATAN (−3 pada Skor 360° penilai)
--
-- Kebijakan (keputusan pengguna 2026-09-18):
--  * Form TIDAK ditutup otomatis saat deadline — pegawai tetap bisa mengisi/kirim.
--  * Status On Time / Late ditentukan dari WAKTU KIRIM PERTAMA vs deadline periode.
--  * Penilaian yang terlambat TETAP dihitung untuk pegawai yang dinilai.
--  * Penilai yang terlambat (≥1 penilaian WAJIB) → potongan FLAT −3 pada Skor 360° MILIKNYA
--    SENDIRI (bukan Skor Akhir; bukan per penilaian). Bila penilai tak punya Skor 360°
--    sendiri → potongan diabaikan. Potongan OTOMATIS masuk skor; HRD bisa memberi
--    pengecualian (sakit/cuti, dsb.) dengan alasan wajib.
--  Logika murni (siapa terlambat, besar potongan) ada di lib/late.ts (diuji).
--
-- Perubahan:
--  1) periods.assessment_deadline — batas waktu kirim penilaian 360° (null = tanpa deadline
--     → tak ada yang dihitung terlambat).
--  2) assessments.first_submitted_at — stempel waktu KIRIM PERTAMA, diisi TRIGGER (bukan
--     klien) dan tak bisa diubah sesudahnya. `submitted_at` yang lama tertimpa tiap "Edit" &
--     kirim ulang (dipakai deteksi skor basi), jadi tak bisa dipakai menilai ketepatan waktu:
--     tanpa kolom ini, orang yang kirim tepat waktu lalu merevisi komentar sesudah deadline
--     akan tercatat terlambat.
--  3) assessments.forced_by_hrd — penilaian ditandai selesai oleh HRD ("Paksa Selesai"),
--     bukan dikirim penilai → dikecualikan dari potongan. Diisi TRIGGER dari auth.uid().
--  4) result_360.score_raw + late_penalty — `score` kini = skor SETELAH potongan (semua
--     pembaca lama otomatis ikut), `score_raw` = hasil rumus murni, `late_penalty` = besar
--     potongan. Baris lama di-backfill score_raw = score (sebelum fitur ini tak ada potongan).
--  5) late_penalty_waivers — pengecualian potongan per pegawai per periode (HRD).
--
-- Keamanan: stempel waktu & flag paksa ditulis trigger, nilai kiriman klien DIABAIKAN —
-- penilai tak bisa memundurkan waktu kirimnya lewat API. Tulisan service_role (auth.uid()
-- null: skrip impor/restore) dipercaya apa adanya agar data historis tak tertimpa now().
-- ============================================================================

-- 1) Deadline periode ---------------------------------------------------------
alter table periods add column if not exists assessment_deadline timestamptz;
comment on column periods.assessment_deadline is
  'Batas waktu kirim penilaian 360°. Form tetap terbuka sesudahnya; kiriman pertama sesudah ini = Terlambat.';

-- 2) + 3) Stempel kirim pertama & flag paksa-selesai -------------------------
alter table assessments add column if not exists first_submitted_at timestamptz;
alter table assessments add column if not exists forced_by_hrd boolean not null default false;
comment on column assessments.first_submitted_at is
  'Waktu KIRIM PERTAMA (diisi trigger, immutable). Dasar status On Time / Late.';
comment on column assessments.forced_by_hrd is
  'true = ditandai selesai oleh HRD (Paksa Selesai), bukan dikirim penilai. Diisi trigger.';

-- Backfill: perkiraan terbaik untuk data lama = submitted_at (bisa sudah tertimpa edit ulang).
update assessments set first_submitted_at = submitted_at
  where status = 'submitted' and first_submitted_at is null and submitted_at is not null;

create or replace function assessments_stamp_submit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  now_ts timestamptz := now();
begin
  -- Jalur service_role / SQL langsung (skrip impor, restore, fixture uji): percayai nilai
  -- yang dikirim, tapi kiriman pertama tetap immutable & terisi bila kosong.
  if auth.uid() is null then
    if tg_op = 'UPDATE' and old.first_submitted_at is not null then
      new.first_submitted_at := old.first_submitted_at;
    end if;
    if new.status = 'submitted' and new.first_submitted_at is null then
      new.first_submitted_at := coalesce(new.submitted_at, now_ts);
    end if;
    return new;
  end if;

  -- Jalur pengguna (penilai / HRD via RLS): nilai dari klien DIABAIKAN.
  if tg_op = 'UPDATE' then
    new.first_submitted_at := old.first_submitted_at;
    new.forced_by_hrd := old.forced_by_hrd;
  else
    new.first_submitted_at := null;
    new.forced_by_hrd := false;
  end if;

  if new.status = 'submitted' then
    new.submitted_at := now_ts;
    if new.first_submitted_at is null then
      new.first_submitted_at := now_ts;
      -- Dikirim oleh orang lain selain penilai (hanya HRD yang bisa, lewat asmt_hrd) = Paksa Selesai.
      new.forced_by_hrd := auth.uid() <> new.assessor_id;
    end if;
  else
    new.submitted_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_assessments_stamp_submit on assessments;
create trigger trg_assessments_stamp_submit
  before insert or update on assessments
  for each row execute function assessments_stamp_submit();

-- 4) Skor 360° mentah vs setelah potongan -------------------------------------
alter table result_360 add column if not exists score_raw numeric(5,2);
alter table result_360 add column if not exists late_penalty numeric(5,2) not null default 0
  check (late_penalty >= 0);
comment on column result_360.score is
  'Skor 360° RESMI = max(0, score_raw − late_penalty). Dipakai seluruh aplikasi.';
comment on column result_360.score_raw is 'Skor 360° hasil rumus murni (weightedScore360), sebelum potongan.';
comment on column result_360.late_penalty is 'Potongan keterlambatan menilai (flat, lib/late.ts). 0 = tanpa potongan.';

update result_360 set score_raw = score where score_raw is null;

-- 5) Pengecualian potongan ----------------------------------------------------
create table if not exists late_penalty_waivers (
  employee_id uuid not null references employees(id) on delete cascade,
  period_id   uuid not null references periods(id) on delete cascade,
  reason      text not null check (length(trim(reason)) >= 3),
  set_by      uuid references employees(id),
  created_at  timestamptz not null default now(),
  primary key (employee_id, period_id)
);

alter table late_penalty_waivers enable row level security;

-- Baca berjenjang (selaras compliance_penalties): HRD, Direksi, pegawai ybs, SPV tim.
drop policy if exists lpw_read on late_penalty_waivers;
create policy lpw_read on late_penalty_waivers for select using (
  is_hrd() or is_direksi() or employee_id = auth.uid() or is_my_member(employee_id)
);
-- Tulis hanya HRD.
drop policy if exists lpw_write on late_penalty_waivers;
create policy lpw_write on late_penalty_waivers for all
  using (is_hrd()) with check (is_hrd());
