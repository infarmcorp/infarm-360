-- 0059 — Rencana Pengembangan: baca Direksi dibatasi ke timnya (keputusan pemilik 2026-11-11).
--
-- Sebelumnya (0055/0056) policy baca memuat `is_direksi()` → Direksi bisa membaca rencana SEMUA pegawai lewat API,
-- padahal aplikasi kini hanya memberi Direksi rencananya sendiri + rencana yang ia atasi (Pantauan dicabut).
-- Database disamakan dengan aplikasi (`canViewPlan` / `resolveSupervisor`, lib/dev-plan.ts): Direksi membaca
-- rencana milik pegawai yang atasannya Direksi = posisi SPV atau pemimpin tim (`spv_team_members.spv_id`),
-- bukan Direksi. Pemilik & is_hrd() tidak berubah. Aplikasi membaca lewat service_role, jadi tak ada yang rusak.
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1), sesudah 0055–0056.

create or replace function dev_plan_direksi_reads(owner uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_direksi() and exists (
    select 1 from employees e
    where e.id = owner and e.role <> 'direksi'
      and (e.role = 'spv' or exists (select 1 from spv_team_members s where s.spv_id = owner))
  )
$$;
revoke all on function dev_plan_direksi_reads(uuid) from public, anon;
grant execute on function dev_plan_direksi_reads(uuid) to authenticated;

drop policy if exists dp_read on development_plans;
create policy dp_read on development_plans for select
  using (employee_id = auth.uid() or is_hrd() or dev_plan_direksi_reads(employee_id));

drop policy if exists dpi_read on development_plan_items;
create policy dpi_read on development_plan_items for select
  using (exists (select 1 from development_plans p where p.id = plan_id
                 and (p.employee_id = auth.uid() or is_hrd() or dev_plan_direksi_reads(p.employee_id))));

drop policy if exists dps_read on development_plan_sessions;
create policy dps_read on development_plan_sessions for select
  using (exists (select 1 from development_plans p where p.id = plan_id
                 and (p.employee_id = auth.uid() or is_hrd() or dev_plan_direksi_reads(p.employee_id))));
