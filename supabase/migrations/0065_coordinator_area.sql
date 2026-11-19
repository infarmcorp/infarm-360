-- 0065 — Bidang Koordinator (keputusan pemilik 2026-11-18/19).
--
-- Koordinator punya keterangan bidang (mis. "Konten", "Purchasing", "Warehouse"), diisi HRD penuh di
-- Manajemen Akses dan ditampilkan di daftar koordinator. Hanya label — tidak menyentuh izin, RLS, skor, atau
-- lingkup tim. Ditulis lewat Server Action HRD penuh (setCoordinatorArea) seperti kolom employees lain; tak ada
-- policy baru. (Awalnya untuk nama folder Transfer PDF ke Drive; fitur itu dicabut 2026-11-19, bidang dipertahankan.)
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1). Tanpa migrasi ini Manajemen Akses tetap jalan; bidang
-- tidak bisa disimpan ("belum aktif").

alter table employees add column if not exists coordinator_area text;

do $$ begin
  alter table employees add constraint employees_coordinator_area_len
    check (coordinator_area is null or char_length(coordinator_area) between 1 and 60);
exception when duplicate_object then null; end $$;
