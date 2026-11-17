-- 0064 — Pengaturan AI: aturan umum + prompt Kesimpulan & Masukan Lain (EKSPERIMEN dev/staging, seperti 0060).
--
-- Prompt "Ringkas otomatis" kini mengikuti "Prompt Laporan PA Q3 2026 v2.0" (keputusan pemilik 2026-11-17):
--   rules_prompt — aturan umum (sumber data, angka, cara memproses komentar, anonimitas, komentar sensitif, gaya
--                  bahasa), otomatis ditempel di depan ketiga prompt tugas;
--   notes_prompt — Kesimpulan + Masukan Lain dari Penilai (isian PDF Pegawai) dalam satu panggilan.
-- Kosong (null) = bawaan di lib/ai/summary-prompt.ts. Ditulis hanya Server Action Pengaturan AI (service_role).
--
-- Idempoten. Hanya untuk database yang sudah punya ai_settings (0060). TIDAK wajib di production selama fitur AI
-- belum dirilis. Tanpa migrasi ini kedua prompt memakai bawaan kode dan tak bisa diubah di layar.

do $$
begin
  if to_regclass('public.ai_settings') is not null then
    alter table ai_settings add column if not exists rules_prompt text;
    alter table ai_settings add column if not exists notes_prompt text;
    if not exists (select 1 from pg_constraint where conname = 'ai_settings_rules_prompt_len') then
      alter table ai_settings add constraint ai_settings_rules_prompt_len check (rules_prompt is null or char_length(rules_prompt) <= 8000);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'ai_settings_notes_prompt_len') then
      alter table ai_settings add constraint ai_settings_notes_prompt_len check (notes_prompt is null or char_length(notes_prompt) <= 8000);
    end if;
  end if;
end $$;
