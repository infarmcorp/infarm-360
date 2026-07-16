-- 0022_ais_rating_numeric.sql
-- Lebarkan tipe kolom assessment_indicator_scores.rating: smallint → numeric(3,2).
--
-- ALASAN: mendukung backfill nilai aspek 360° DESIMAL (mis. hasil 360° eksternal Q1 2026
-- yang dinilai di luar aplikasi, nilai per-aspek berupa desimal seperti 4,67). Dashboard
-- menghitung skor aspek = rata-rata(rating) × 20; dengan rating bulat, desimal tak bisa
-- direproduksi eksak.
--
-- AMAN & ADITIF (pelebaran tipe, bukan penyempitan):
--   • Rating bulat 1–5 yang sudah ada tetap valid (5 → 5.00, nilai sama; tak ada data hilang).
--   • CHECK (rating >= 1 AND rating <= 5) adalah RENTANG → desimal 1.00–5.00 tetap lolos,
--     jadi constraint tak perlu diubah.
--   • Form penilaian & validasi Zod tetap menulis bilangan bulat seperti biasa.
--   • Rumus skor (weightedScore360/computeResult360) sudah memakai aritmetika float.
-- Idempoten: aman dijalankan ulang (mengubah ke tipe yang sama = no-op efektif).
alter table public.assessment_indicator_scores
  alter column rating type numeric(3,2) using rating::numeric(3,2);
