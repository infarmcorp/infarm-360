-- ============================================================================
-- 0046 — PEMBATALAN VALIDITAS PENILAIAN (Screen 06/07, keputusan pengguna 2026-10-01)
--
-- Penilaian yang sudah TERKIRIM tak lagi bisa dihapus lewat Pemetaan. Bila rater ternyata tidak
-- layak menilai, HRD (bagian Pemetaan) "Membatalkan Validitas" dengan alasan wajib:
--  - status assessments → 'invalidated' (nilai enum baru). Semua hitungan skor memakai
--    status = 'submitted', jadi penilaian ini otomatis KELUAR dari Skor 360°, aspek, laporan, ekspor.
--  - Jawaban & evidence TETAP tersimpan sebagai arsip audit (tak dihapus).
--  - Kewajiban rater atas pasangan ini gugur (tak dihitung tunggakan / potongan telat) — di sisi kode.
--  - Dicatat: invalidated_at, invalidated_by, invalid_reason (+ Log Aktivitas HRD dari Server Action).
-- Pembatalan bisa DIPULIHKAN HRD (status kembali 'submitted', kolom pembatalan dikosongkan).
--
-- Penulisan hanya lewat service_role dari Server Action ber-otorisasi (canSection 'pemetaan').
-- Trigger di bawah menolak pengguna non-HRD mengubah/menghapus penilaian yang dibatalkan atau
-- mengisi kolom pembatalan lewat API langsung. Idempoten. Terapkan SETELAH 0045.
-- ============================================================================

alter type assessment_status add value if not exists 'invalidated';

alter table assessments add column if not exists invalidated_at timestamptz;
alter table assessments add column if not exists invalidated_by uuid references employees(id) on delete set null;
alter table assessments add column if not exists invalid_reason text;

comment on column assessments.invalidated_at is 'Waktu HRD membatalkan validitas penilaian terkirim (status invalidated). Null = valid.';
comment on column assessments.invalid_reason is 'Alasan wajib pembatalan validitas oleh HRD.';

-- Isi penilaian yang dibatalkan tak bisa lagi ditulis penilai (perbandingan via ::text karena nilai
-- enum baru belum boleh dipakai sebagai literal enum di transaksi yang sama).
create or replace function assessment_writable(aid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assessments a join periods p on p.id = a.period_id
    where a.id = aid
      and a.assessor_id = auth.uid()
      and a.status::text <> 'invalidated'
      and p.status = 'active' and p.has_360 and p.form_open
      and exists (
        select 1 from mappings m
        where m.period_id = a.period_id and m.assessor_id = a.assessor_id
          and m.target_id = a.target_id and m.is_active
      )
  )
$$;

-- Pengguna (non-service_role) tak boleh membuat/mengubah/menghapus status 'invalidated' atau kolom
-- pembatalan, kecuali HRD bagian Pemetaan (aplikasi sendiri menulis lewat service_role).
create or replace function assessments_guard_invalidation() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or hrd_can('pemetaan') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.status::text = 'invalidated' then
      raise exception 'Penilaian yang dibatalkan validitasnya tidak dapat dihapus' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status::text = 'invalidated' then
    raise exception 'Penilaian ini telah dibatalkan validitasnya oleh HRD' using errcode = '42501';
  end if;
  if new.status::text = 'invalidated'
     or new.invalidated_at is not null or new.invalidated_by is not null or new.invalid_reason is not null then
    raise exception 'Pembatalan validitas hanya dapat dilakukan HRD' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_assessments_guard_invalidation on assessments;
create trigger trg_assessments_guard_invalidation
  before insert or update or delete on assessments
  for each row execute function assessments_guard_invalidation();
