-- ============================================================================
-- 0011 — Status laporan baru: 'in_review' (HRD merilis hasil ke SPV)
--
-- Alur visibilitas laporan: draft (HRD garap, SPV hanya lihat angka Skor Akhir)
--   → in_review (HRD RILIS ke SPV: SPV boleh lihat detail agregat + ringkasan
--     aspek HRD, TANPA komentar mentah; diskusi terjadi di luar aplikasi)
--   → finalized (pegawai melihat laporannya).
--
-- PENTING (jalankan TERPISAH dari 0012): nilai enum baru TIDAK BOLEH dipakai di
-- transaksi yang sama saat ia dibuat (Postgres). 0012 (yang merujuk 'in_review'
-- di policy) harus dijalankan SETELAH transaksi ini commit. apply-migration.mjs
-- membungkus tiap file dalam satu transaksi → cukup terapkan 0011 lalu 0012.
-- ============================================================================

alter type report_status add value if not exists 'in_review' before 'finalized';
