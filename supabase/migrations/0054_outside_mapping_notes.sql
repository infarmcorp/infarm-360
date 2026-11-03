-- 0054 — Catatan di Luar Pemetaan (outside_mapping_notes).
--
-- Pegawai menyampaikan informasi/kejadian kepada HRD tentang rekan DI LUAR pemetaannya: pilih rekan + satu
-- aspek budaya, tulis isi (≥ 20 karakter). Tanpa rating, tanpa pertanyaan HRD. Dipakai mulai Q4 2026.
-- BUKAN Ad-Hoc (Ad-Hoc instan tetap dicabut): tidak menyentuh mappings/assessments/assessment_indicator_scores,
-- tidak masuk Skor 360°, Skor Akhir, Progress 360, Kepatuhan, potongan keterlambatan, atau tugas.
--
-- ANONIM SECARA SKEMA (keputusan pemilik, 2026-11-03):
--   - TANPA kolom penulis dalam bentuk apa pun (id/email/hash/token) dan TANPA waktu kirim (created_at).
--   - id = uuid acak (gen_random_uuid, v4) — tak boleh dipakai mengurutkan; aplikasi mengurutkan menurut isi.
--   - Sisa risiko di luar database (log permintaan Vercel/Supabase mencatat waktu & sesi) → TEKNIS.md §5.
--
-- Akses: RLS AKTIF TANPA policy + hak tabel dicabut dari anon/authenticated → hanya service_role.
--   Tulis: Server Action submitOutsideNote (validasi + Zod di server). Baca: hanya HRD Mode Admin di detail
--   laporan (lib/outside-notes.ts). Aplikasi tetap jalan tanpa migrasi ini (kirim menampilkan "belum aktif").
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1).

create table if not exists outside_mapping_notes (
  id        uuid primary key default gen_random_uuid(),
  period_id uuid not null references periods(id) on delete cascade,
  target_id uuid not null references employees(id) on delete cascade,
  -- NO ACTION (bukan cascade): aspek yang sudah punya catatan tak bisa terhapus diam-diam; hapus periode
  -- tetap jalan karena catatannya ikut terhapus dalam statement yang sama.
  aspect_id uuid not null references culture_aspects(id) on delete no action,
  body      text not null,
  constraint outside_mapping_notes_body_len check (char_length(btrim(body)) between 20 and 2000)
);

create index if not exists outside_mapping_notes_target on outside_mapping_notes (period_id, target_id);
create index if not exists outside_mapping_notes_aspect on outside_mapping_notes (aspect_id);

-- Aspek wajib milik periode catatan (pengaman kedua di bawah validasi server).
create or replace function outside_note_aspect_in_period() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from culture_aspects a where a.id = new.aspect_id and a.period_id = new.period_id) then
    raise exception 'Aspek bukan milik periode catatan' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_outside_note_aspect_in_period on outside_mapping_notes;
create trigger trg_outside_note_aspect_in_period
  before insert or update on outside_mapping_notes
  for each row execute function outside_note_aspect_in_period();

alter table outside_mapping_notes enable row level security;
-- Sengaja TANPA policy apa pun: anon/authenticated tak bisa membaca maupun menulis.
revoke all on table outside_mapping_notes from anon, authenticated;
