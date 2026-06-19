-- ============================================================================
-- 0009 — SPV boleh MEMBACA laporan akhir (final_reports) DIRINYA SENDIRI
--
-- Sebelumnya fr_read hanya mengizinkan pegawai membaca laporannya sendiri bila
-- status = 'finalized'. Akibatnya di halaman "Laporan Kinerja Tim" baris SPV
-- untuk dirinya sendiri tidak bisa menampilkan Skor Akhir/Status selama masih
-- draf (SPV bukan anggota timnya sendiri → is_my_member juga tak berlaku).
--
-- Kebijakan: SPV boleh melihat laporan kinerja pribadinya, termasuk DRAF, agar
-- bisa memantau (sejalan dgn 0008 yang mengizinkan SPV input KPI dirinya).
-- Cakupan least-privilege: hanya is_spv() + DIRI SENDIRI (employee_id = auth.uid()).
--
-- CATATAN: ini HANYA membuka BACA. Tidak ada izin tulis/ACC untuk laporan sendiri
-- (fr_spv_acc tetap pakai is_my_member yang mengecualikan diri sendiri) — SPV
-- tidak boleh meng-ACC laporannya sendiri (integritas: ACC = persetujuan atasan).
-- ============================================================================

drop policy if exists fr_read on final_reports;
create policy fr_read on final_reports for select using (
  is_hrd() or is_direksi()
  or is_my_member(employee_id)
  -- pegawai biasa hanya melihat laporannya yang SUDAH final (Laporan Hasil Saya)
  or (employee_id = auth.uid() and status = 'finalized')
  -- SPV boleh melihat laporan dirinya termasuk draf (untuk pemantauan)
  or (is_spv() and employee_id = auth.uid())
);
