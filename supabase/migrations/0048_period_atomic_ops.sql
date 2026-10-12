-- 0048 — Aktifkan & Hapus Periode dalam SATU transaksi (audit kode gelombang 2b, poin 2d).
--
-- Masalah: app menjalankan langkah-langkahnya terpisah lewat PostgREST, jadi bila salah satu gagal
-- di tengah jalan, data tertinggal setengah jadi:
--   - Aktifkan Periode: (1) akhiri semua periode lain, (2) aktifkan periode ini. Bila (2) gagal →
--     TIDAK ADA periode aktif sama sekali.
--   - Hapus Periode: (1) hapus jejak audit KPI, (2) hapus KPI, (3) hapus periode. Bila (2)/(3) gagal →
--     KPI/jejaknya sudah hilang sementara periodenya masih ada (dan Log Aktivitas tak tercatat).
-- Fungsi di bawah melakukan semuanya dalam satu transaksi: gagal di mana pun → SEMUA dibatalkan.
--
-- Perilaku SENGAJA sama dengan app saat ini (pemindahan murni, bukan perubahan aturan):
--   - period_activate mengakhiri SEMUA periode lain (bukan hanya yang aktif), seperti
--     `update({ status: 'ended' }).neq('id', …)` di activatePeriod.
--   - period_delete menolak periode aktif dan hanya menghapus KPI bulan yang UNIK milik periode ini
--     (bulan yang dipakai bersama periode lain tak disentuh), seperti uniqueMonthsOf + deletePeriod.
-- Otorisasi (HRD + bagian 'periode') & Log Aktivitas tetap di Server Action; fungsi hanya untuk
-- service_role (tak bisa dipanggil pengguna lewat API).
--
-- Idempoten: create or replace + revoke/grant. Aman diterapkan sebelum app memakainya (app lama tak
-- memanggilnya). Terapkan ke STAGING dulu (TEKNIS.md §1).

create or replace function period_activate(p_period uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  select label into v_label from periods where id = p_period for update;
  if not found then
    raise exception 'Periode tidak ditemukan' using errcode = 'P0002';
  end if;
  update periods set status = 'ended' where id <> p_period;
  update periods set status = 'active' where id = p_period;
  return v_label;
end $$;

-- Mengembalikan ringkasan untuk Log Aktivitas: label, bulan yang KPI-nya ikut dihapus, jumlah baris.
create or replace function period_delete(p_period uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_label  text;
  v_status text;
  v_yms    text[];
  v_kpi    integer := 0;
  v_audit  integer := 0;
begin
  select label, status into v_label, v_status from periods where id = p_period for update;
  if not found then
    raise exception 'Periode tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_status = 'active' then
    raise exception 'Periode aktif tidak bisa dihapus. "Kunci & Akhiri" dulu.' using errcode = '42501';
  end if;

  -- Bulan UNIK periode ini (KPI per ym tak cascade dari periods & bisa dipakai bersama).
  select coalesce(array_agg(pm.ym order by pm.ym), '{}') into v_yms
    from period_months pm
   where pm.period_id = p_period
     and not exists (select 1 from period_months o where o.ym = pm.ym and o.period_id <> p_period);

  if coalesce(array_length(v_yms, 1), 0) > 0 then
    delete from kpi_audit where ym = any (v_yms);
    get diagnostics v_audit = row_count;
    delete from kpi_scores where ym = any (v_yms);
    get diagnostics v_kpi = row_count;
  end if;

  -- Cascade ke months/aspek/indikator/pertanyaan/bobot/pemetaan/penilaian/result_360/laporan/suksesi.
  delete from periods where id = p_period;

  return jsonb_build_object(
    'label', v_label, 'months', to_jsonb(v_yms),
    'kpi_deleted', v_kpi, 'kpi_audit_deleted', v_audit
  );
end $$;

revoke all on function period_activate(uuid) from public, anon, authenticated;
revoke all on function period_delete(uuid)   from public, anon, authenticated;
grant execute on function period_activate(uuid) to service_role;
grant execute on function period_delete(uuid)   to service_role;
