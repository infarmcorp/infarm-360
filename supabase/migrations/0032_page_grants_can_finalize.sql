-- 0032_page_grants_can_finalize
-- Level izin KE-3 untuk grant halaman "Menu Administrator" (RBAC, lanjutan 0025). Memisahkan
-- kemampuan MERINGKAS dari kemampuan FINALISASI, agar ada peran "boleh tulis Ringkasan Aspek tapi
-- TIDAK boleh finalisasi" (menggantikan is_cross_reviewer / halaman /peninjau — lihat
-- docs/pengembangan/DESAIN-MANAJEMEN-AKSES.md §10.5).
--
-- Tiga tingkat (halaman 'administrator'; halaman 'pemantauan' selalu lihat-saja, mengabaikan flag):
--   can_edit=false                    → LIHAT SAJA
--   can_edit=true,  can_finalize=false → BOLEH MERINGKAS (tulis Ringkasan Aspek/Kualitatif; TANPA
--                                        finalisasi / rilis ke SPV / kembalikan ke draf)
--   can_edit=true,  can_finalize=true  → BOLEH FINALISASI (semua di atas + finalisasi/rilis/draf)
--
-- ⚠️ Penegakan ADA DI SERVER (admin/laporan/actions.ts): saveAspectSummaries/saveQualSummaries butuh
-- can_edit; saveOrFinalizeReport(finalize)/releaseToSpv/kembalikan-draf butuh can_finalize. Tulis via
-- service_role bila pemegang bukan is_hrd().
--
-- Aditif & backward-compatible. BACKFILL: grant edit LAMA di-set can_finalize=true agar tak ada yang
-- diam-diam kehilangan kemampuan finalisasi yang sudah dimilikinya (perilaku sebelum migrasi ini).
alter table page_grants add column if not exists can_finalize boolean not null default false;

-- Backfill sekali: pertahankan perilaku lama (edit lama = boleh finalisasi).
update page_grants set can_finalize = true where can_edit = true and can_finalize = false;
