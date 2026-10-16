-- 0049 — Tolak ACC laporan SENDIRI di tingkat database (audit kode no. 12, gelombang 2b poin 3).
--
-- Masalah: HRD ber-akses "Review & Finalisasi" (hrd_can('laporan')) lolos RLS final_reports untuk
-- laporan SIAPA PUN, dan trigger final_reports_guard_non_hrd (0045) langsung melewatinya — sehingga
-- HRD itu bisa meng-ACC laporannya sendiri lewat pemanggilan API langsung.
-- Server Action setSpvAcc kini menolak ini (dan menegakkan lingkup divisi/tim); trigger ini lapis
-- kedua di database untuk SEMUA pengguna yang login (termasuk HRD).
--
-- Cakupan sengaja sempit: hanya MENYALAKAN ACC (false/null → true) atas laporan milik pelaku sendiri.
--   - Mencabut ACC tetap boleh (app me-reset spv_acc=false saat laporan dikembalikan ke draf).
--   - service_role (auth.uid() kosong) tidak diblok — Server Action sudah menegakkan aturan yang sama.
-- Aturan divisi TIDAK di sini: database tak bisa membedakan HRD Mode SPV dari HRD Mode Admin.
--
-- Idempoten (create or replace + drop trigger if exists). Terapkan ke STAGING dulu (TEKNIS.md §1).

create or replace function final_reports_block_self_acc() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.employee_id = auth.uid()
     and coalesce(new.spv_acc, false)
     and new.spv_acc is distinct from old.spv_acc then
    raise exception 'Tidak dapat meng-ACC laporan sendiri' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_final_reports_block_self_acc on final_reports;
create trigger trg_final_reports_block_self_acc
  before update on final_reports
  for each row execute function final_reports_block_self_acc();
