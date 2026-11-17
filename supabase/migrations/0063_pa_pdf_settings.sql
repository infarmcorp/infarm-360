-- 0063 — Pengaturan PDF Pegawai per periode (keputusan pemilik 2026-11-17).
--
-- PDF Pegawai (format "Laporan Performance Appraisal", tombol Unduh PDF Pegawai di detail laporan HRD)
-- memuat tanggal laporan dan tenggat 4 langkah tindak lanjut. Isinya diatur HRD sekali per periode:
--   periods.pa_pdf = { "reportDate": "YYYY-MM-DD", "tenggat": [4 teks] }
-- Kosong (null) = aplikasi memakai bawaan yang dihitung dari tanggal akhir periode.
-- Hanya diubah server (Server Action HRD Mode Admin, service_role) — tak ada policy tulis baru.
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1). Tanpa migrasi ini halaman PDF tetap jalan
-- dengan jadwal bawaan; hanya tombol simpan pengaturan yang menampilkan "belum aktif".

alter table periods add column if not exists pa_pdf jsonb;
