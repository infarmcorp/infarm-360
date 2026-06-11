-- ============================================================================
-- Row Level Security — otorisasi berbasis peran (inti keamanan aplikasi)
--
-- Prinsip:
--   * Employee  : hanya datanya sendiri + penilaian yang ia berikan/terima.
--   * SPV       : + data anggota timnya (spv_team_members).
--   * HRD       : akses penuh (operasional sistem). Mode-SPV dibatasi tim sendiri.
--   * Direksi   : read-only luas + ACC promosi.
--   * Tulisan terkomputasi (result_360, kalibrasi) HANYA via service_role
--     dari Server Action — RLS sengaja tidak memberi INSERT/UPDATE ke client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper (SECURITY DEFINER agar tidak rekursif memicu RLS employees)
-- ----------------------------------------------------------------------------
create or replace function app_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from employees where id = auth.uid()
$$;

create or replace function is_hrd() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from employees where id = auth.uid()) = 'hrd', false)
$$;

create or replace function is_direksi() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from employees where id = auth.uid()) = 'direksi', false)
$$;

-- target adalah anggota tim SPV yang sedang login
create or replace function is_my_member(target uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from spv_team_members
    where spv_id = auth.uid() and employee_id = target
  )
$$;

-- ----------------------------------------------------------------------------
-- Aktifkan RLS di semua tabel
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'employees','spv_team_members','periods','period_months',
    'culture_aspects','indicators','qualitative_questions','weight_schemes',
    'mappings','relation_correction_requests','assessments',
    'assessment_indicator_scores','assessment_qual_answers',
    'kpi_scores','kpi_audit','result_360','final_reports','succession_plans'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- EMPLOYEES — semua boleh baca direktori; hanya HRD yang mengelola
-- ----------------------------------------------------------------------------
create policy emp_read   on employees for select using (true);
create policy emp_manage on employees for all
  using (is_hrd()) with check (is_hrd());

create policy team_read on spv_team_members for select
  using (is_hrd() or is_direksi() or spv_id = auth.uid() or employee_id = auth.uid());
create policy team_manage on spv_team_members for all
  using (is_hrd()) with check (is_hrd());

-- ----------------------------------------------------------------------------
-- Data referensi periode/pertanyaan/bobot — baca: semua; tulis: HRD
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'periods','period_months','culture_aspects','indicators',
    'qualitative_questions','weight_schemes'
  ] loop
    execute format($f$create policy %1$s_read on %1$I for select using (true)$f$, t);
    execute format($f$create policy %1$s_write on %1$I for all
      using (is_hrd()) with check (is_hrd())$f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- MAPPINGS — baca: yang terlibat / SPV tim / HRD / Direksi; tulis: HRD
-- ----------------------------------------------------------------------------
create policy map_read on mappings for select using (
  is_hrd() or is_direksi()
  or assessor_id = auth.uid() or target_id = auth.uid()
  or is_my_member(target_id)
);
create policy map_write on mappings for all
  using (is_hrd()) with check (is_hrd());

-- Permohonan koreksi relasi: pegawai mengajukan miliknya; HRD meninjau
create policy corr_read on relation_correction_requests for select using (
  is_hrd() or assessor_id = auth.uid() or target_id = auth.uid()
);
create policy corr_insert on relation_correction_requests for insert
  with check (assessor_id = auth.uid());
create policy corr_review on relation_correction_requests for update
  using (is_hrd()) with check (is_hrd());

-- ----------------------------------------------------------------------------
-- ASSESSMENTS — penilai kelola miliknya; target/SPV/HRD/Direksi boleh baca
-- ----------------------------------------------------------------------------
create policy asmt_read on assessments for select using (
  is_hrd() or is_direksi()
  or assessor_id = auth.uid() or target_id = auth.uid()
  or is_my_member(target_id)
);
-- Penilai hanya boleh tulis SAAT periode 'active' (server tetap re-validasi)
create policy asmt_write on assessments for all using (
  assessor_id = auth.uid()
  and exists (select 1 from periods p where p.id = period_id and p.status = 'active')
) with check (
  assessor_id = auth.uid()
  and exists (select 1 from periods p where p.id = period_id and p.status = 'active')
);
create policy asmt_hrd on assessments for all
  using (is_hrd()) with check (is_hrd());

-- Detail skor/komentar ikut hak akses header-nya
create policy ais_access on assessment_indicator_scores for all using (
  exists (select 1 from assessments a where a.id = assessment_id
          and (a.assessor_id = auth.uid() or is_hrd()))
) with check (
  exists (select 1 from assessments a where a.id = assessment_id
          and (a.assessor_id = auth.uid() or is_hrd()))
);
create policy ais_read on assessment_indicator_scores for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or is_direksi() or a.assessor_id = auth.uid()
    or a.target_id = auth.uid() or is_my_member(a.target_id)))
);
create policy aqa_access on assessment_qual_answers for all using (
  exists (select 1 from assessments a where a.id = assessment_id
          and (a.assessor_id = auth.uid() or is_hrd()))
) with check (
  exists (select 1 from assessments a where a.id = assessment_id
          and (a.assessor_id = auth.uid() or is_hrd()))
);
create policy aqa_read on assessment_qual_answers for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or is_direksi() or a.assessor_id = auth.uid()
    or a.target_id = auth.uid() or is_my_member(a.target_id)))
);

-- ----------------------------------------------------------------------------
-- KPI — input/edit oleh SPV-tim atau HRD; pegawai lihat skornya sendiri
-- ----------------------------------------------------------------------------
create policy kpi_read on kpi_scores for select using (
  is_hrd() or is_direksi() or employee_id = auth.uid() or is_my_member(employee_id)
);
create policy kpi_write on kpi_scores for all using (
  is_hrd() or is_my_member(employee_id)
) with check (
  is_hrd() or is_my_member(employee_id)
);

-- Audit append-only: boleh INSERT (oleh SPV-tim/HRD) & SELECT; TANPA update/delete
create policy kpiaudit_read on kpi_audit for select using (
  is_hrd() or is_direksi() or employee_id = auth.uid() or is_my_member(employee_id)
);
create policy kpiaudit_insert on kpi_audit for insert with check (
  changed_by = auth.uid() and (is_hrd() or is_my_member(employee_id))
);
-- (sengaja tidak ada policy UPDATE/DELETE → audit tidak bisa diubah dari client)

-- ----------------------------------------------------------------------------
-- HASIL 360 & FINAL REPORT — baca berjenjang; tulis sensitif via service_role
-- ----------------------------------------------------------------------------
-- result_360: hanya hasil FINAL yang terlihat pegawai (kalibrasi via server).
create policy r360_read on result_360 for select using (
  is_hrd() or is_direksi() or employee_id = auth.uid() or is_my_member(employee_id)
);
-- TANPA policy tulis untuk client → hanya service_role (Server Action) yang menulis.

create policy fr_read on final_reports for select using (
  is_hrd() or is_direksi()
  or is_my_member(employee_id)
  -- pegawai hanya melihat laporannya yang SUDAH final (Laporan Hasil Saya)
  or (employee_id = auth.uid() and status = 'finalized')
);
-- SPV boleh set ACC untuk timnya; HRD edit/finalisasi. Komputasi skor via server.
create policy fr_spv_acc on final_reports for update
  using (is_my_member(employee_id)) with check (is_my_member(employee_id));
create policy fr_hrd on final_reports for all
  using (is_hrd()) with check (is_hrd());

-- ----------------------------------------------------------------------------
-- PROMOSI & SUKSESI — HRD mengajukan; Direksi merespon; pegawai tak melihat
-- ----------------------------------------------------------------------------
create policy succ_read on succession_plans for select using (is_hrd() or is_direksi());
create policy succ_hrd  on succession_plans for all
  using (is_hrd()) with check (is_hrd());
create policy succ_dir  on succession_plans for update
  using (is_direksi()) with check (is_direksi());
