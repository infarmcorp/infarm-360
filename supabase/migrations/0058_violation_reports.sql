-- 0058 — Laporkan Pelanggaran (perluasan Catatan di Luar Pemetaan, 0054). Keputusan pemilik 2026-11-10.
--
-- Fitur yang sama dengan nama baru di layar. Tabel TETAP `outside_mapping_notes` (aturan anonimitas & isolasi
-- 0054 tidak berubah). Tambahan isian dari pelapor:
--   - incident_date : tanggal KEJADIAN yang ditulis pelapor (wajib untuk laporan baru). Ini bukan waktu kirim —
--                     tabel tetap TANPA created_at / kolom penulis.
--   - is_other      : kategori "Lainnya (di luar budaya kerja)" → aspect_id kosong.
--   - note          : catatan opsional (≤ 1000 karakter).
-- Baca pindah dari rincian komentar laporan ke halaman HRD "Laporan Pelanggaran" (+ ekspor Bahan Laporan).
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1). Tanpa migrasi ini: kirim laporan menampilkan "sedang
-- diperbarui", halaman HRD menampilkan catatan lama tanpa tanggal/kategori Lainnya/catatan.

alter table outside_mapping_notes add column if not exists incident_date date;
alter table outside_mapping_notes add column if not exists is_other boolean not null default false;
alter table outside_mapping_notes add column if not exists note text;
alter table outside_mapping_notes alter column aspect_id drop not null;

do $$
begin
  -- Kategori: tepat salah satu — aspek budaya periode itu, ATAU "Lainnya".
  if not exists (select 1 from pg_constraint where conname = 'outside_mapping_notes_category') then
    alter table outside_mapping_notes add constraint outside_mapping_notes_category
      check ((is_other and aspect_id is null) or (not is_other and aspect_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'outside_mapping_notes_note_len') then
    alter table outside_mapping_notes add constraint outside_mapping_notes_note_len
      check (note is null or char_length(btrim(note)) between 1 and 1000);
  end if;
  -- Tanggal kejadian wajib untuk baris BARU saja: NOT VALID → baris lama (sebelum 0058) tak diperiksa.
  if not exists (select 1 from pg_constraint where conname = 'outside_mapping_notes_incident_date') then
    alter table outside_mapping_notes add constraint outside_mapping_notes_incident_date
      check (incident_date is not null) not valid;
  end if;
end $$;

-- Aspek wajib milik periode catatan — kecuali kategori "Lainnya" (aspect_id kosong).
create or replace function outside_note_aspect_in_period() returns trigger
language plpgsql as $$
begin
  if new.aspect_id is null then
    return new;
  end if;
  if not exists (select 1 from culture_aspects a where a.id = new.aspect_id and a.period_id = new.period_id) then
    raise exception 'Aspek bukan milik periode catatan' using errcode = 'check_violation';
  end if;
  return new;
end $$;
