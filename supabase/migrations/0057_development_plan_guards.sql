-- 0057 — Pengaman database Rencana Pengembangan (audit celah 2026-11-03).
--
-- 1. Kolom periods.dev_plan_closed_at / dev_plan_due hanya boleh diubah SERVER (Server Action setPlanWindow, gerbang
--    bagian "Rencana Pengembangan"). Sebelumnya policy periods_write (hrd_can('periode')) membuat HRD yang hanya
--    berbagian Kelola Periode bisa menutup/membuka rencana lewat API langsung. Server (service_role) & SQL Editor
--    tak membawa auth.uid() → tetap boleh.
-- 2. Prioritas rencana hanya berubah saat rencana Draf / Perlu Perbaikan (Direksi: kapan saja — tanpa alur), dicek
--    DATABASE, bukan hanya server: menutup celah waktu Simpan vs Kirim dari dua tab (atasan bisa menyetujui isi yang
--    berbeda dari yang dibacanya).
-- 3. dev_plan_replace_items: ganti seluruh prioritas dalam SATU transaksi dengan mengunci baris rencana (FOR UPDATE)
--    — Kirim (UPDATE status) menunggu sampai penggantian selesai, jadi tak ada isi setengah-tersimpan. Hanya
--    service_role. Kode punya cadangan cara lama bila fungsi belum ada (rpcMissing).
--
-- Idempoten. Terapkan ke STAGING dulu (TEKNIS.md §1), sesudah 0056.

-- 1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function periods_guard_dev_plan_cols() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if; -- server (service_role) / SQL Editor
  if tg_op = 'INSERT' then
    if new.dev_plan_closed_at is not null or new.dev_plan_due is not null then
      raise exception 'Pengaturan Rencana Pengembangan hanya lewat aplikasi' using errcode = 'insufficient_privilege';
    end if;
  elsif new.dev_plan_closed_at is distinct from old.dev_plan_closed_at or new.dev_plan_due is distinct from old.dev_plan_due then
    raise exception 'Pengaturan Rencana Pengembangan hanya lewat aplikasi' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_periods_guard_dev_plan_cols on periods;
create trigger trg_periods_guard_dev_plan_cols
  before insert or update on periods
  for each row execute function periods_guard_dev_plan_cols();

-- 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function dev_plan_items_guard() returns trigger
language plpgsql as $$
declare
  v_status text;
  v_role   text;
begin
  select p.status, e.role into v_status, v_role
    from development_plans p join employees e on e.id = p.employee_id
   where p.id = coalesce(new.plan_id, old.plan_id);
  -- Rencana sudah terhapus (cascade hapus periode/pegawai) → biarkan.
  if not found then return coalesce(new, old); end if;
  if v_role <> 'direksi' and v_status not in ('draft', 'revision') then
    raise exception 'Prioritas hanya bisa diubah saat rencana Draf atau Perlu Perbaikan' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_dev_plan_items_guard on development_plan_items;
create trigger trg_dev_plan_items_guard
  before insert or update or delete on development_plan_items
  for each row execute function dev_plan_items_guard();

-- 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- p_items: [{ area, target, actions, due_text, companion, success_indicator }] (urutan = urutan prioritas).
create or replace function dev_plan_replace_items(p_plan uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_role   text;
begin
  select p.status, e.role into v_status, v_role
    from development_plans p join employees e on e.id = p.employee_id
   where p.id = p_plan
   for update of p;
  if not found then raise exception 'Rencana tidak ditemukan'; end if;
  if v_role <> 'direksi' and v_status not in ('draft', 'revision') then
    raise exception 'Prioritas hanya bisa diubah saat rencana Draf atau Perlu Perbaikan' using errcode = 'check_violation';
  end if;
  delete from development_plan_items where plan_id = p_plan;
  insert into development_plan_items (plan_id, order_idx, area, target, actions, due_text, companion, success_indicator)
  select p_plan, (x.ord - 1)::int,
         coalesce(x.item->>'area', ''), coalesce(x.item->>'target', ''), coalesce(x.item->>'actions', ''),
         coalesce(x.item->>'due_text', ''), coalesce(x.item->>'companion', ''), coalesce(x.item->>'success_indicator', '')
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as x(item, ord);
  update development_plans set updated_at = now() where id = p_plan;
end $$;

revoke all on function dev_plan_replace_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function dev_plan_replace_items(uuid, jsonb) to service_role;
