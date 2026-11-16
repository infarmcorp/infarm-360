-- 0061 — Laporkan Pelanggaran lepas dari formulir 360° (keputusan pemilik 2026-11-16).
--
-- 1. Saklar sendiri per periode: periods.violation_open. Sebelumnya laporan hanya bisa dikirim bila periode aktif
--    + 360° aktif + formulir 360° dibuka. Kini cukup periode aktif + saklar ini terbuka (diatur HRD di Kelola
--    Periode). Saat kolom baru DIBUAT, periode aktif yang formulirnya sedang terbuka ikut dibuka agar perilaku
--    tidak berubah di hari migrasi; menjalankan ulang file ini tidak menyentuh saklar lagi.
-- 2. Kategori = NAMA aspek budaya (outside_mapping_notes.category), bukan rujukan aspek milik satu periode.
--    Aspek budaya sama antarperiode (hanya indikatornya berganti), jadi laporan baru tak terikat ke aspek periode
--    tertentu dan tak menghalangi HRD mengubah/menghapus aspek. Laporan lama tetap memakai aspect_id (trigger
--    outside_note_aspect_in_period tetap berlaku hanya untuknya).
--
-- Anonimitas tidak berubah: tetap tanpa kolom penulis & tanpa waktu kirim.
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1). Tanpa migrasi ini aplikasi memakai gerbang lama
-- (360° aktif + formulir dibuka) dan kategori lama (aspek periode aktif).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'periods' and column_name = 'violation_open'
  ) then
    alter table periods add column violation_open boolean not null default false;
    update periods set violation_open = true where status = 'active' and has_360 and form_open;
  end if;
end $$;

alter table outside_mapping_notes add column if not exists category text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outside_mapping_notes_category_len') then
    alter table outside_mapping_notes add constraint outside_mapping_notes_category_len
      check (category is null or char_length(btrim(category)) between 1 and 100);
  end if;
end $$;

-- Kategori: tepat salah satu — "Lainnya" (tanpa aspek & tanpa nama), ATAU budaya kerja (nama aspek, atau
-- rujukan aspek untuk laporan sebelum 0061).
alter table outside_mapping_notes drop constraint if exists outside_mapping_notes_category;
alter table outside_mapping_notes add constraint outside_mapping_notes_category
  check (
    (is_other and aspect_id is null and category is null)
    or (not is_other and (aspect_id is not null or category is not null))
  );
