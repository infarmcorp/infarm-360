-- 0065 — Bidang Koordinator (keputusan pemilik 2026-11-18).
--
-- Koordinator kini punya keterangan bidang (mis. "Konten", "Purchasing", "Warehouse"), diisi HRD penuh di
-- Manajemen Akses. Dipakai sebagai nama folder pada Transfer PDF ke Drive (Review & Finalisasi):
--   <Periode> / <Divisi> / Koordinator <Bidang> - <Nama> / PDF pegawai binaannya.
-- Hanya label — tidak menyentuh izin, RLS, skor, atau lingkup tim. Ditulis lewat Server Action HRD penuh
-- (setCoordinatorArea) seperti kolom employees lain; tak ada policy baru.
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1). Tanpa migrasi ini Manajemen Akses & Transfer PDF tetap
-- jalan; bidang tidak bisa disimpan ("belum aktif") dan folder koordinator bernama "Koordinator - <Nama>".

alter table employees add column if not exists coordinator_area text;

do $$ begin
  alter table employees add constraint employees_coordinator_area_len
    check (coordinator_area is null or char_length(coordinator_area) between 1 and 60);
exception when duplicate_object then null; end $$;
