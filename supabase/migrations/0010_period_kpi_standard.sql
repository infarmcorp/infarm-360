-- ============================================================================
-- 0010 — Target/Standar KPI per periode (untuk metrik dashboard "% di atas standar")
--
-- Angka ini MURNI metrik pelaporan: dipakai kartu "KPI Di Atas Standar (≥N)" di
-- Dashboard Organisasi (tab Analisis Hasil KPI) untuk menghitung persentase pegawai
-- yang mencapai/ melampaui target. HRD bisa mengubahnya per kuartal (selaras has_360).
--
-- PENTING: ini BUKAN ambang rumus skor. Tidak menyentuh kpiBandOf/finalScoreOf/
-- playerClassOf (terkunci di lib/scoring.ts). Jangan disuntikkan ke perhitungan skor.
-- ============================================================================

alter table periods
  add column if not exists kpi_standard smallint not null default 80
  check (kpi_standard between 0 and 100);
