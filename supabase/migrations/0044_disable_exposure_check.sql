-- ============================================================================
-- 0044 — EXPOSURE CHECK (BR-03) DICABUT TOTAL (keputusan pengguna 2026-09-29)
--
-- Fitur Exposure Check (Eligible / Partially / Not Eligible) sudah dihapus dari UI & Server
-- Action. Migrasi ini menutup jalur terakhir: pengguna yang memanggil API Supabase langsung
-- (RLS asmt_write mengizinkan penilai menulis baris penilaiannya) tak lagi bisa mengisi kolom
-- exposure_*. Trigger mengosongkan kolom itu untuk SEMUA tulisan pengguna (termasuk HRD);
-- jalur service_role (auth.uid() null: skrip impor/restore) tak diubah.
--
-- Kolom tetap ada (data historis = 0 baris terisi saat dicabut); sisa nilai lama, bila ada,
-- ikut dikosongkan di bawah agar tak memengaruhi apa pun.
-- Idempoten — aman dijalankan ulang. Tak bergantung pada 0041–0043.
-- ============================================================================

create or replace function assessments_block_exposure() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.exposure_status := null;
    new.exposure_confirmed_at := null;
    new.exposure_reason := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_assessments_block_exposure on assessments;
create trigger trg_assessments_block_exposure
  before insert or update on assessments
  for each row execute function assessments_block_exposure();

update assessments
   set exposure_status = null, exposure_confirmed_at = null, exposure_reason = null
 where exposure_status is not null or exposure_confirmed_at is not null or exposure_reason is not null;

comment on column assessments.exposure_status is
  'TIDAK DIPAKAI — Exposure Check (BR-03) dicabut 2026-09-29; dikosongkan trigger trg_assessments_block_exposure.';
