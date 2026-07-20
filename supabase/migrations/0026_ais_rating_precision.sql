-- 0026_ais_rating_precision.sql
-- Lebarkan presisi assessment_indicator_scores.rating: numeric(3,2) → numeric(8,6).
--
-- ALASAN: impor ulang nilai aspek 360° Q1 2026 dengan presisi tinggi (mis. 4.727273, termasuk
-- desimal BERULANG seperti 4.72727272…) agar heatmap aspek Dashboard/Monitor eksak & cocok dgn
-- angka Looker. Skor aspek Q1 = rata-rata(rating) × 20; dengan 2 desimal, angka Looker tak bisa
-- direproduksi (selisih ~0.04). numeric(8,6) menampung 6 desimal (4.727273 → ×20 = 94.54546).
--
-- AMAN & ADITIF (pelebaran presisi, bukan penyempitan):
--   • Semua nilai lama (numeric(3,2), mis. 4.67) tetap valid & tak berubah (4.67 → 4.670000).
--   • numeric(8,6) = maks 99.999999 → rentang rating 1–5 muat penuh (5.000000).
--   • CHECK (rating >= 1 AND rating <= 5) adalah RENTANG → desimal 1.000000–5.000000 tetap lolos,
--     jadi constraint tak perlu diubah.
--   • Form penilaian & Zod tetap menulis bilangan bulat seperti biasa (5 → 5.000000, nilai sama).
--   • Rumus skor (weightedScore360/computeResult360) sudah pakai aritmetika float.
-- Idempoten: aman dijalankan ulang (ubah ke tipe yang sama = no-op efektif).
alter table public.assessment_indicator_scores
  alter column rating type numeric(8,6) using rating::numeric(8,6);
