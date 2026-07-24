-- 0033_retire_cross_reviewer_to_grant
-- PENSIUN "Peninjau Hasil Lintas Divisi" (is_cross_reviewer, migrasi 0018) → jadi GRANT halaman biasa.
-- Sekarang peran ini = akses halaman "Review Hasil Akhir" (review) + lingkup "selain divisinya"
-- (other_divisions) + izin "Boleh meringkas" (can_edit=true, can_finalize=false) — lihat
-- docs/pengembangan/DESAIN-MANAJEMEN-AKSES.md §10.5. Route /peninjau + toggle khusus dihapus di kode;
-- migrasi ini memindahkan pemegang yang ADA agar tak kehilangan akses.
--
-- Idempoten & aman: ON CONFLICT DO NOTHING → tak menimpa grant 'review' yang mungkin sudah ada
-- (mis. HRD sudah memberi grant Review lebih luas ke orang yang sama).

-- 1) Materialisasi grant Review (Meringkas, selain divisinya) untuk tiap pemegang cross-reviewer.
insert into page_grants (employee_id, section, scope, scopes, can_edit, can_finalize, created_by)
select e.id, 'review', 'other_divisions', array['other_divisions'], true, false, null
from employees e
where e.is_cross_reviewer = true
on conflict (employee_id, section) do nothing;

-- 2) Matikan flag lama (kolom is_cross_reviewer dipertahankan tapi jadi vestigial → semua false).
update employees set is_cross_reviewer = false where is_cross_reviewer = true;
