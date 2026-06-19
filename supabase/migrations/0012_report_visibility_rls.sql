-- ============================================================================
-- 0012 — Tutup akses SPV ke umpan balik 360° MENTAH (lapis 3)
--
-- Sebelumnya asmt_read / ais_read / aqa_read mengizinkan is_my_member(target_id),
-- sehingga SPV bisa membaca penilaian 360° anggota timnya HINGGA KOMENTAR PER
-- PENILAI BESERTA NAMA, sejak draf — bertentangan dengan integritas/anonimitas
-- 360°. Kebijakan baru: SPV TIDAK PERNAH membaca tabel mentah ini.
--
-- SPV tetap bisa melihat DETAIL AGREGAT (radar/skor per aspek + ringkasan aspek
-- HRD) saat status 'in_review' — tetapi itu dihitung di SERVER via service_role
-- (lihat lib/report.ts → loadTeamReportForSpv) yang HANYA mengembalikan agregat
-- anonim, bukan lewat akses tabel mentah ini. Jadi pencabutan di sini adalah
-- batas keamanan sebenarnya (defense-in-depth) untuk lapis 3.
--
-- Pembaca yang dipertahankan: HRD, Direksi, penilai-atas-dirinya (assessor self),
-- dan target-atas-dirinya (target self). Tulis & policy lain TIDAK diubah.
-- Prasyarat: 0011 (enum 'in_review') sudah commit.
-- ============================================================================

-- assessments: header penilaian
drop policy if exists asmt_read on assessments;
create policy asmt_read on assessments for select using (
  is_hrd() or is_direksi()
  or assessor_id = auth.uid() or target_id = auth.uid()
);

-- assessment_indicator_scores: rating + komentar per indikator
drop policy if exists ais_read on assessment_indicator_scores;
create policy ais_read on assessment_indicator_scores for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or is_direksi() or a.assessor_id = auth.uid()
    or a.target_id = auth.uid()))
);

-- assessment_qual_answers: jawaban esai kualitatif
drop policy if exists aqa_read on assessment_qual_answers;
create policy aqa_read on assessment_qual_answers for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or is_direksi() or a.assessor_id = auth.uid()
    or a.target_id = auth.uid()))
);
