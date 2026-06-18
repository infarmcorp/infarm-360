-- ============================================================================
-- 0008 — SPV boleh input/edit KPI capaian DIRINYA SENDIRI
--
-- Sebelumnya RLS kpi_write / kpiaudit_insert hanya mengizinkan is_hrd() atau
-- is_my_member(employee_id) → SPV tak bisa menulis KPI untuk dirinya (SPV bukan
-- anggota timnya sendiri). Kebijakan: SPV juga harus mencatat capaian KPI pribadi.
--
-- Cakupan dipilih least-privilege: hanya DIRI SENDIRI (employee_id = auth.uid()),
-- bukan seluruh divisi — SPV tidak boleh mengubah KPI rekan SPV lain.
-- ============================================================================

-- Helper peran SPV (SECURITY DEFINER agar tak rekursif memicu RLS employees).
create or replace function is_spv() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from employees where id = auth.uid()) = 'spv', false)
$$;

-- kpi_scores: + (SPV menulis KPI dirinya sendiri). kpi_read sudah mencakup
-- employee_id = auth.uid() sehingga SPV bisa membaca skornya sendiri.
drop policy if exists kpi_write on kpi_scores;
create policy kpi_write on kpi_scores for all using (
  is_hrd() or is_my_member(employee_id) or (is_spv() and employee_id = auth.uid())
) with check (
  is_hrd() or is_my_member(employee_id) or (is_spv() and employee_id = auth.uid())
);

-- kpi_audit: append-only; izinkan SPV menulis jejak audit untuk dirinya sendiri.
drop policy if exists kpiaudit_insert on kpi_audit;
create policy kpiaudit_insert on kpi_audit for insert with check (
  changed_by = auth.uid()
  and (is_hrd() or is_my_member(employee_id) or (is_spv() and employee_id = auth.uid()))
);
