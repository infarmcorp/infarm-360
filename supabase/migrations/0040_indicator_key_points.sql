-- ============================================================================
-- 0040 — KEY POINT PER LEVEL BARS (Screen 03 mockup UI/UX, 2026-09-28)
-- ----------------------------------------------------------------------------
-- Mockup Screen 03 (Notion) menunjukkan tiap level BARS (1–5) punya DUA bagian:
--   1) key point  — label pendek (mis. "Belum terlihat", "Sesuai ekspektasi"),
--                   KHUSUS per indikator (bukan label generik sama untuk semua
--                   indikator — lihat BR-06 Catatan Developer di Notion).
--   2) deskripsi  — penjelasan panjang (sudah ada: indicators.rating_guide).
-- Kolom baru ini menampung (1); (2) tetap di rating_guide, tak berubah.
-- ============================================================================

alter table indicators add column if not exists rating_key_points jsonb;
comment on column indicators.rating_key_points is
  'Key point (label pendek) BARS per level 1-5, jsonb {"1":"…",...,"5":"…"}, KHUSUS per indikator. Berpasangan dengan rating_guide (deskripsi panjang). Opsional — form penilaian jatuh ke label generik bila kosong.';
