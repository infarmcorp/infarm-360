-- ============================================================================
-- 0042 — ANONIMITAS PENILAI + KPI HANYA LEWAT UI (keputusan HRD 2026-09-29)
--
-- Prasyarat: 0041 sudah diterapkan (idempoten — urutan tetap aman dijalankan ulang).
--
-- A. "Siapa menilai siapa" hanya boleh diketahui HRD (yang mengatur pemetaan). Pegawai hanya
--    boleh tahu SIAPA YANG IA NILAI, bukan siapa yang menilainya. Data mentah boleh dibuka ke
--    peran tertentu (SPV/Koordinator/Direksi/pemegang grant) HANYA dalam bentuk ANONIM — itu
--    disajikan server (service_role, blok bernama dibuang), bukan lewat RLS.
--      * assessments / assessment_indicator_scores / assessment_qual_answers (baca):
--        cabut cabang Direksi → hanya HRD + penilai (miliknya sendiri).
--      * mappings (baca): cabut cabang Direksi, target (dinilai siapa), & SPV-tim
--        → hanya HRD + penilai (baris di mana ia penilai).
--      * relation_correction_requests (baca): cabut cabang target (permohonan memuat assessor_id)
--        → hanya HRD + pengaju.
--
-- B. Perubahan KPI WAJIB lewat UI (Server Action) oleh leader yang berwenang, beserta
--    Komentar Audit — TIDAK boleh lewat API langsung:
--      * cabut kpi_write & kpiaudit_insert → tak ada pengguna (termasuk HRD) yang bisa menulis
--        kpi_scores / kpi_audit dengan anon key + JWT.
--      * fungsi kpi_save_with_audit / kpi_delete_with_audit: menulis skor + jejak audit dalam
--        SATU transaksi (tak ada lagi skor tanpa audit), menolak bulan di luar periode aktif,
--        & hanya bisa dieksekusi service_role (dipanggil Server Action setelah cek lingkup).
--    Baca KPI (kpi_read / kpiaudit_read) TIDAK berubah.
-- ============================================================================

-- A. Anonimitas ---------------------------------------------------------------
drop policy if exists asmt_read on assessments;
create policy asmt_read on assessments for select using (
  is_hrd() or assessor_id = auth.uid()
);

drop policy if exists ais_read on assessment_indicator_scores;
create policy ais_read on assessment_indicator_scores for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or a.assessor_id = auth.uid()))
);

drop policy if exists aqa_read on assessment_qual_answers;
create policy aqa_read on assessment_qual_answers for select using (
  exists (select 1 from assessments a where a.id = assessment_id and (
    is_hrd() or a.assessor_id = auth.uid()))
);

drop policy if exists map_read on mappings;
create policy map_read on mappings for select using (
  is_hrd() or assessor_id = auth.uid()
);

drop policy if exists corr_read on relation_correction_requests;
create policy corr_read on relation_correction_requests for select using (
  is_hrd() or assessor_id = auth.uid()
);

-- B. KPI hanya lewat UI ---------------------------------------------------------
drop policy if exists kpi_write on kpi_scores;
drop policy if exists kpiaudit_insert on kpi_audit;

create or replace function kpi_assert_active_month(p_ym text) returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from period_months pm join periods p on p.id = pm.period_id
    where pm.ym = p_ym and p.status = 'active'
  ) then
    raise exception 'Bulan % tidak berada dalam periode aktif', p_ym using errcode = '42501';
  end if;
end $$;

-- p_rows: [{ "employee_id": uuid, "score": number, "note": text|null }, ...]
create or replace function kpi_save_with_audit(p_actor uuid, p_ym text, p_rows jsonb) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  n integer := 0;
begin
  perform kpi_assert_active_month(p_ym);
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into kpi_scores (employee_id, ym, score, updated_by, updated_at)
    values ((r->>'employee_id')::uuid, p_ym, (r->>'score')::numeric, p_actor, now())
    on conflict (employee_id, ym) do update
      set score = excluded.score, updated_by = excluded.updated_by, updated_at = now();
    insert into kpi_audit (employee_id, ym, score, changed_by, note, action)
    values ((r->>'employee_id')::uuid, p_ym, (r->>'score')::numeric, p_actor,
            coalesce(nullif(trim(r->>'note'), ''), 'Input bulanan'), 'set');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Mengembalikan skor lama yang dihapus, atau NULL bila tak ada baris.
create or replace function kpi_delete_with_audit(p_actor uuid, p_employee uuid, p_ym text, p_note text) returns numeric
  language plpgsql security definer set search_path = public as $$
declare
  v_old numeric;
begin
  perform kpi_assert_active_month(p_ym);
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Alasan penghapusan wajib diisi' using errcode = '22023';
  end if;
  delete from kpi_scores where employee_id = p_employee and ym = p_ym returning score into v_old;
  if v_old is null then
    return null;
  end if;
  insert into kpi_audit (employee_id, ym, score, changed_by, note, action)
  values (p_employee, p_ym, v_old, p_actor, trim(p_note), 'delete');
  return v_old;
end $$;

-- Hanya server (service_role) yang boleh mengeksekusi — bukan anon/authenticated lewat API.
revoke all on function kpi_assert_active_month(text) from public, anon, authenticated;
revoke all on function kpi_save_with_audit(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function kpi_delete_with_audit(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function kpi_assert_active_month(text) to service_role;
grant execute on function kpi_save_with_audit(uuid, text, jsonb) to service_role;
grant execute on function kpi_delete_with_audit(uuid, uuid, text, text) to service_role;
