-- ============================================================================
-- 0041 — PENGETATAN RLS hasil audit 2026-09-29
--
-- Celah: RLS lebih longgar daripada aplikasi, sehingga pengguna yang memanggil API Supabase
-- langsung (anon key + JWT miliknya) bisa melewati validasi Server Action. Perbaikan:
--
--  1) assessments (asmt_write): penilai hanya boleh menulis penilaian untuk pasangan yang
--     punya PEMETAAN AKTIF (termasuk pemetaan Ad-Hoc yang sudah disetujui HRD). Sebelumnya
--     cukup "assessor = saya" → bisa menyuntik nilai untuk rekan mana pun; computeResult360
--     menganggap pasangan tanpa pemetaan sebagai 'Peer'.
--  2) assessments (trigger): penilaian yang SUDAH terkirim tak bisa diturunkan ke draf / dihapus
--     oleh penilai (hanya HRD / service_role). Pegawai tetap bisa mengedit & kirim ulang.
--  3) final_reports (trigger): pengguna NON-HRD (SPV lewat fr_spv_acc) hanya boleh mengubah
--     kolom spv_acc, dan hanya setelah laporan dirilis (bukan 'draft'). Sebelumnya fr_spv_acc
--     mengizinkan SPV mengubah final_score/status/content anggota timnya.
--  4) kpi_scores (kpi_write): tulis hanya untuk bulan yang termasuk PERIODE AKTIF. Sebelumnya
--     cek periode hanya di Server Action → KPI periode terkunci bisa diubah lewat API.
--  5) assessments / assessment_indicator_scores / assessment_qual_answers (baca): cabut cabang
--     "target = saya". Pegawai yang dinilai tak boleh membaca baris mentah (assessor_id = nama
--     penilai) — laporannya disajikan server (anonim, hanya saat finalized; app/(app)/laporan).
--
-- Jalur service_role (auth.uid() null: server action ber-otorisasi, skrip impor/restore) tak
-- terpengaruh. HRD (is_hrd()) tetap penuh. Idempoten — aman dijalankan ulang.
-- ============================================================================

-- 1) Penilai hanya menulis penilaian yang punya pemetaan aktif -----------------
drop policy if exists asmt_write on assessments;
create policy asmt_write on assessments for all using (
  assessor_id = auth.uid()
  and exists (select 1 from periods p where p.id = assessments.period_id and p.status = 'active')
  and exists (
    select 1 from mappings m
    where m.period_id = assessments.period_id
      and m.assessor_id = assessments.assessor_id
      and m.target_id = assessments.target_id
      and m.is_active
  )
) with check (
  assessor_id = auth.uid()
  and exists (select 1 from periods p where p.id = assessments.period_id and p.status = 'active')
  and exists (
    select 1 from mappings m
    where m.period_id = assessments.period_id
      and m.assessor_id = assessments.assessor_id
      and m.target_id = assessments.target_id
      and m.is_active
  )
);

-- 2) Penilaian terkirim tak bisa diturunkan / dihapus oleh non-HRD ---------------
create or replace function assessments_keep_submitted() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_hrd() then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and old.status = 'submitted' and new.status <> 'submitted' then
    raise exception 'Penilaian yang sudah terkirim tidak dapat dikembalikan ke draf' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.status = 'submitted' then
    raise exception 'Penilaian yang sudah terkirim tidak dapat dihapus' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_assessments_keep_submitted on assessments;
create trigger trg_assessments_keep_submitted
  before update or delete on assessments
  for each row execute function assessments_keep_submitted();

-- 3) Non-HRD hanya boleh mengubah spv_acc pada laporan yang sudah dirilis --------
create or replace function final_reports_guard_non_hrd() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_hrd() then
    return new;
  end if;
  if new.employee_id  is distinct from old.employee_id
  or new.period_id    is distinct from old.period_id
  or new.final_score  is distinct from old.final_score
  or new.status       is distinct from old.status
  or new.content      is distinct from old.content
  or new.finalized_by is distinct from old.finalized_by
  or new.pdf_path     is distinct from old.pdf_path then
    raise exception 'Hanya ACC yang boleh diubah pada laporan ini' using errcode = '42501';
  end if;
  if new.spv_acc is distinct from old.spv_acc and old.status = 'draft' then
    raise exception 'Laporan belum dirilis HRD — ACC belum bisa diberikan' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_final_reports_guard_non_hrd on final_reports;
create trigger trg_final_reports_guard_non_hrd
  before update on final_reports
  for each row execute function final_reports_guard_non_hrd();

-- 4) KPI hanya bisa ditulis untuk bulan periode aktif ---------------------------
drop policy if exists kpi_write on kpi_scores;
create policy kpi_write on kpi_scores for all using (
  (is_hrd() or is_my_member(employee_id) or (is_spv() and employee_id = auth.uid()))
  and exists (
    select 1 from period_months pm join periods p on p.id = pm.period_id
    where pm.ym = kpi_scores.ym and p.status = 'active'
  )
) with check (
  (is_hrd() or is_my_member(employee_id) or (is_spv() and employee_id = auth.uid()))
  and exists (
    select 1 from period_months pm join periods p on p.id = pm.period_id
    where pm.ym = kpi_scores.ym and p.status = 'active'
  )
);

-- 5) Pegawai yang dinilai tak lagi membaca baris 360° mentah (identitas penilai) ---
drop policy if exists asmt_read on assessments;
create policy asmt_read on assessments for select using (
  is_hrd() or is_direksi() or assessor_id = auth.uid()
);

drop policy if exists ais_read on assessment_indicator_scores;
create policy ais_read on assessment_indicator_scores for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or is_direksi() or a.assessor_id = auth.uid()))
);

drop policy if exists aqa_read on assessment_qual_answers;
create policy aqa_read on assessment_qual_answers for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or is_direksi() or a.assessor_id = auth.uid()))
);
