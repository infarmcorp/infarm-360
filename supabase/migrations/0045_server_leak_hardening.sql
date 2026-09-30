-- ============================================================================
-- 0045 — MENUTUP SISA CELAH SERVER hasil audit 2026-09-30
--
-- Semua celah di bawah hanya bisa dipakai lewat pemanggilan API langsung (anon key + sesi login
-- sendiri), bukan lewat tombol aplikasi. Aplikasi sudah menolak; migrasi ini membuat DATABASE
-- menolak hal yang sama, sehingga aturan tak bisa dilewati.
--
--  A) Akses HRD per BAGIAN ditegakkan di DB (hrd_sections, migrasi 0023). Sebelumnya pembatasan
--     hanya di menu/halaman: HRD yang dibatasi ke satu bagian tetap is_hrd() penuh untuk MENULIS.
--     Kini tulis tabel admin butuh hrd_can('<bagian>'); BACA tidak berubah (is_hrd()).
--  B) Izin (HRD Admin, bagian HRD, Koordinator + timnya) dan akun HRD/Direksi hanya boleh diubah
--     HRD berakses PENUH; tak seorang pun mengubah izinnya sendiri. (#5/#6)
--  C) Isi penilaian (rating/komentar/esai) hanya bisa ditulis saat periode aktif, 360° dibuka,
--     form terbuka, dan pemetaan aktif — dulu cukup "penilaian milik saya", sehingga penilaian
--     periode terkunci / laporan final bisa diubah diam-diam. Indikator/pertanyaan wajib milik
--     periode penilaian itu. (#2)
--  D) Penilaian baru berstatus TERKIRIM hanya bila SEMUA indikator aktif ber-rating 1–5 + evidence
--     ≥ 20 karakter dan semua esai terisi; penilaian tanpa pemetaan aktif ditolak. (#1, #14)
--  E) Permohonan koreksi/penambahan/penghapusan pemetaan hanya bisa DIBUAT berstatus menunggu,
--     untuk pemetaan milik pemohon sendiri, tanpa relasi Self, di periode aktif. (#4)
--  F) ACC laporan oleh SPV: hanya periode aktif, bukan pegawai berkoordinator, dan DICATAT di
--     Log Aktivitas (termasuk yang dikirim lewat API). (#8)
--  G) Respons Direksi atas rencana suksesi: hanya status/komentar, hanya rencana yang sudah
--     diajukan, atas nama dirinya sendiri. (#9)
--  H) KPI tak bisa diberikan ke pegawai eksternal. (#10)
--  I) Invarian konfigurasi: total bobot kelas = 100; relasi Self hanya untuk menilai diri sendiri.
--     (#12) "Maksimal satu periode aktif" SENGAJA tak dijadikan batasan DB: skrip verify:rls membuat
--     periode uji aktif sementara di samping periode nyata. Aplikasi (activatePeriod) sudah
--     mengakhiri periode lain sebelum mengaktifkan yang baru.
--
-- Jalur service_role (auth.uid() null: Server Action ber-otorisasi, skrip impor/restore) tak
-- terpengaruh. Idempoten — aman dijalankan ulang. Terapkan SETELAH 0044.
-- Data produksi sudah dicek 2026-09-30 (read-only): bobot total 100, tak ada
-- relasi Self yang salah, tak ada KPI pegawai eksternal → batasan I aman ditambahkan.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------------

-- HRD yang boleh MENULIS bagian `sec`: HRD (posisi/izin) + hrd_sections kosong (penuh) atau memuatnya.
create or replace function hrd_can(sec text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select (role = 'hrd' or coalesce(is_hrd_admin, false))
       and (hrd_sections is null or cardinality(hrd_sections) = 0 or sec = any(hrd_sections))
    from employees where id = auth.uid()
  ), false)
$$;

-- HRD berakses penuh (tanpa pembatasan bagian) — selaras isFullHrd() di lib/auth/roles.ts.
create or replace function is_full_hrd() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select (role = 'hrd' or coalesce(is_hrd_admin, false))
       and (hrd_sections is null or cardinality(hrd_sections) = 0)
    from employees where id = auth.uid()
  ), false)
$$;

-- Penilai boleh menulis ISI penilaian ini sekarang? (periode aktif + 360° + form terbuka + pemetaan aktif)
create or replace function assessment_writable(aid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assessments a join periods p on p.id = a.period_id
    where a.id = aid
      and a.assessor_id = auth.uid()
      and p.status = 'active' and p.has_360 and p.form_open
      and exists (
        select 1 from mappings m
        where m.period_id = a.period_id and m.assessor_id = a.assessor_id
          and m.target_id = a.target_id and m.is_active
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- A) Tulis tabel admin per bagian HRD. Kebijakan "for all" lama (juga melayani baca) dipecah:
--    baca tetap lewat kebijakan *_read yang sudah ada (semuanya memuat is_hrd()), tulis lewat
--    tiga kebijakan baru (insert/update/delete) dengan syarat bagian.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
    ('periods',                   'periods_write',         $c$hrd_can('periode')$c$),
    ('period_months',             'period_months_write',   $c$hrd_can('periode')$c$),
    ('culture_aspects',           'culture_aspects_write', $c$hrd_can('pertanyaan')$c$),
    ('indicators',                'indicators_write',      $c$hrd_can('pertanyaan')$c$),
    ('qualitative_questions',     'qualitative_questions_write', $c$hrd_can('pertanyaan')$c$),
    ('weight_schemes',            'weight_schemes_write',  $c$hrd_can('bobot')$c$),
    ('employee_weight_overrides', 'ewo_write',             $c$hrd_can('bobot')$c$),
    -- Kelola Pegawai ikut menonaktifkan/mengaktifkan pemetaan saat pegawai (non)aktif.
    ('mappings',                  'map_write',             $c$(hrd_can('pemetaan') or hrd_can('pegawai'))$c$),
    ('employees',                 'emp_manage',            $c$hrd_can('pegawai')$c$),
    ('spv_team_members',          'team_manage',           $c$hrd_can('pegawai')$c$),
    ('coordinator_team_members',  'coord_team_write',      $c$is_full_hrd()$c$),
    ('assessments',               'asmt_hrd',              $c$hrd_can('progress')$c$),
    ('final_reports',             'fr_hrd',                $c$hrd_can('laporan')$c$),
    ('succession_plans',          'succ_hrd',              $c$hrd_can('suksesi')$c$),
    ('compliance_penalties',      'penalty_write',         $c$hrd_can('kepatuhan')$c$),
    ('late_penalty_waivers',      'lpw_write',             $c$hrd_can('kepatuhan')$c$)
  ) v(tbl, old_policy, cond) loop
    execute format('drop policy if exists %I on %I', r.old_policy, r.tbl);
    execute format('drop policy if exists %I on %I', r.tbl || '_hrd_ins', r.tbl);
    execute format('drop policy if exists %I on %I', r.tbl || '_hrd_upd', r.tbl);
    execute format('drop policy if exists %I on %I', r.tbl || '_hrd_del', r.tbl);
    execute format('create policy %I on %I for insert with check (%s)', r.tbl || '_hrd_ins', r.tbl, r.cond);
    execute format('create policy %I on %I for update using (%s) with check (%s)', r.tbl || '_hrd_upd', r.tbl, r.cond, r.cond);
    execute format('create policy %I on %I for delete using (%s)', r.tbl || '_hrd_del', r.tbl, r.cond);
  end loop;
end $$;

-- Tinjau permohonan pemetaan: bagian Pemetaan.
drop policy if exists corr_review on relation_correction_requests;
create policy corr_review on relation_correction_requests for update
  using (hrd_can('pemetaan')) with check (hrd_can('pemetaan'));

-- ---------------------------------------------------------------------------
-- B) Izin & akun ber-hak istimewa hanya diubah HRD berakses penuh
-- ---------------------------------------------------------------------------
create or replace function employees_guard_privileges() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  full_hrd boolean;
  old_priv boolean;
  new_priv boolean;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  full_hrd := is_full_hrd();

  if tg_op = 'INSERT' then
    new_priv := new.role in ('hrd', 'direksi') or coalesce(new.is_hrd_admin, false)
             or coalesce(new.is_coordinator, false) or coalesce(cardinality(new.hrd_sections), 0) > 0;
    if new_priv and not full_hrd then
      raise exception 'Akun HRD/Direksi/Koordinator hanya dapat dibuat HRD Admin berakses penuh' using errcode = '42501';
    end if;
    return new;
  end if;

  old_priv := old.role in ('hrd', 'direksi') or coalesce(old.is_hrd_admin, false);

  if tg_op = 'DELETE' then
    if old_priv and not full_hrd then
      raise exception 'Akun HRD/Direksi hanya dapat dihapus HRD Admin berakses penuh' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.id = auth.uid() and (
       new.role is distinct from old.role
    or new.is_hrd_admin is distinct from old.is_hrd_admin
    or new.hrd_sections is distinct from old.hrd_sections
    or new.is_coordinator is distinct from old.is_coordinator) then
    raise exception 'Tidak dapat mengubah peran atau izin Anda sendiri' using errcode = '42501';
  end if;
  if not full_hrd then
    if old_priv then
      raise exception 'Akun HRD/Direksi hanya dapat diubah HRD Admin berakses penuh' using errcode = '42501';
    end if;
    if new.is_hrd_admin is distinct from old.is_hrd_admin
    or new.hrd_sections is distinct from old.hrd_sections
    or new.is_coordinator is distinct from old.is_coordinator
    or (new.role is distinct from old.role and new.role in ('hrd', 'direksi')) then
      raise exception 'Perubahan izin hanya dapat dilakukan HRD Admin berakses penuh' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_guard_privileges on employees;
create trigger trg_employees_guard_privileges
  before insert or update or delete on employees
  for each row execute function employees_guard_privileges();

-- ---------------------------------------------------------------------------
-- C) Isi penilaian: tulis hanya saat penilaian masih bisa diisi
-- ---------------------------------------------------------------------------
drop policy if exists ais_access on assessment_indicator_scores;
drop policy if exists ais_ins on assessment_indicator_scores;
drop policy if exists ais_upd on assessment_indicator_scores;
drop policy if exists ais_del on assessment_indicator_scores;
create policy ais_ins on assessment_indicator_scores for insert
  with check (hrd_can('progress') or assessment_writable(assessment_id));
create policy ais_upd on assessment_indicator_scores for update
  using (hrd_can('progress') or assessment_writable(assessment_id))
  with check (hrd_can('progress') or assessment_writable(assessment_id));
create policy ais_del on assessment_indicator_scores for delete
  using (hrd_can('progress') or assessment_writable(assessment_id));

drop policy if exists aqa_access on assessment_qual_answers;
drop policy if exists aqa_ins on assessment_qual_answers;
drop policy if exists aqa_upd on assessment_qual_answers;
drop policy if exists aqa_del on assessment_qual_answers;
create policy aqa_ins on assessment_qual_answers for insert
  with check (hrd_can('progress') or assessment_writable(assessment_id));
create policy aqa_upd on assessment_qual_answers for update
  using (hrd_can('progress') or assessment_writable(assessment_id))
  with check (hrd_can('progress') or assessment_writable(assessment_id));
create policy aqa_del on assessment_qual_answers for delete
  using (hrd_can('progress') or assessment_writable(assessment_id));

-- Kepala penilaian juga butuh 360° dibuka + form terbuka (selaras Server Action).
drop policy if exists asmt_write on assessments;
create policy asmt_write on assessments for all using (
  assessor_id = auth.uid()
  and exists (select 1 from periods p where p.id = assessments.period_id
              and p.status = 'active' and p.has_360 and p.form_open)
  and exists (
    select 1 from mappings m
    where m.period_id = assessments.period_id and m.assessor_id = assessments.assessor_id
      and m.target_id = assessments.target_id and m.is_active
  )
) with check (
  assessor_id = auth.uid()
  and exists (select 1 from periods p where p.id = assessments.period_id
              and p.status = 'active' and p.has_360 and p.form_open)
  and exists (
    select 1 from mappings m
    where m.period_id = assessments.period_id and m.assessor_id = assessments.assessor_id
      and m.target_id = assessments.target_id and m.is_active
  )
);

-- Baris skor: indikator AKTIF milik periode penilaian; bila penilaian sudah terkirim, rating 1–5 +
-- evidence ≥ 20 karakter wajib (tak bisa "dikosongkan" lewat API sesudah terkirim).
create or replace function ais_guard_row() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  a_status assessment_status;
  a_period uuid;
begin
  if auth.uid() is null or hrd_can('progress') then
    return coalesce(new, old);
  end if;
  select status, period_id into a_status, a_period from assessments
   where id = coalesce(new.assessment_id, old.assessment_id);
  if tg_op = 'DELETE' then
    -- Dari cascade hapus draf (induk sudah tiada) → izinkan; terkirim → tolak.
    if a_status = 'submitted' then
      raise exception 'Isi penilaian yang sudah terkirim tidak dapat dihapus' using errcode = '42501';
    end if;
    return old;
  end if;
  if not exists (
    select 1 from indicators i join culture_aspects ca on ca.id = i.aspect_id
    where i.id = new.indicator_id and ca.period_id = a_period and i.is_active
  ) then
    raise exception 'Indikator tidak termasuk periode penilaian ini' using errcode = '42501';
  end if;
  if a_status = 'submitted' and (
       new.rating is null or new.rating < 1 or new.rating > 5
    or length(trim(coalesce(new.comment, ''))) < 20) then
    raise exception 'Penilaian terkirim wajib rating 1–5 dan evidence minimal 20 karakter' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_ais_guard_row on assessment_indicator_scores;
create trigger trg_ais_guard_row
  before insert or update or delete on assessment_indicator_scores
  for each row execute function ais_guard_row();

create or replace function aqa_guard_row() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  a_status assessment_status;
  a_period uuid;
begin
  if auth.uid() is null or hrd_can('progress') then
    return coalesce(new, old);
  end if;
  select status, period_id into a_status, a_period from assessments
   where id = coalesce(new.assessment_id, old.assessment_id);
  if tg_op = 'DELETE' then
    if a_status = 'submitted' then
      raise exception 'Isi penilaian yang sudah terkirim tidak dapat dihapus' using errcode = '42501';
    end if;
    return old;
  end if;
  if not exists (select 1 from qualitative_questions q where q.id = new.question_id and q.period_id = a_period) then
    raise exception 'Pertanyaan esai tidak termasuk periode penilaian ini' using errcode = '42501';
  end if;
  if a_status = 'submitted' and length(trim(coalesce(new.answer, ''))) = 0 then
    raise exception 'Penilaian terkirim wajib menjawab semua esai' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_aqa_guard_row on assessment_qual_answers;
create trigger trg_aqa_guard_row
  before insert or update or delete on assessment_qual_answers
  for each row execute function aqa_guard_row();

-- ---------------------------------------------------------------------------
-- D) Penilaian: wajib pemetaan aktif; naik ke TERKIRIM hanya bila lengkap
-- ---------------------------------------------------------------------------
create or replace function assessments_guard_submit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  missing int;
begin
  if auth.uid() is null then
    return new;
  end if;
  -- Semua jalur pengguna (termasuk Paksa Selesai HRD): hanya pasangan yang dipetakan.
  if tg_op = 'INSERT' and not exists (
    select 1 from mappings m
    where m.period_id = new.period_id and m.assessor_id = new.assessor_id
      and m.target_id = new.target_id and m.is_active
  ) then
    raise exception 'Pasangan penilai → yang dinilai ini tidak punya pemetaan aktif' using errcode = '42501';
  end if;
  -- Paksa Selesai (HRD bagian Progress) sengaja boleh tanpa isi.
  if hrd_can('progress') then
    return new;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    select count(*) into missing
      from indicators i join culture_aspects ca on ca.id = i.aspect_id
     where ca.period_id = new.period_id and i.is_active
       and not exists (
         select 1 from assessment_indicator_scores s
          where s.assessment_id = new.id and s.indicator_id = i.id
            and s.rating between 1 and 5
            and length(trim(coalesce(s.comment, ''))) >= 20);
    if missing > 0 then
      raise exception 'Lengkapi rating & evidence semua indikator sebelum mengirim (% belum lengkap)', missing using errcode = '23514';
    end if;
    select count(*) into missing
      from qualitative_questions q
     where q.period_id = new.period_id
       and not exists (
         select 1 from assessment_qual_answers x
          where x.assessment_id = new.id and x.question_id = q.id
            and length(trim(coalesce(x.answer, ''))) > 0);
    if missing > 0 then
      raise exception 'Jawab semua pertanyaan esai sebelum mengirim (% belum dijawab)', missing using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_assessments_guard_submit on assessments;
create trigger trg_assessments_guard_submit
  before insert or update on assessments
  for each row execute function assessments_guard_submit();

-- ---------------------------------------------------------------------------
-- E) Permohonan pemetaan oleh pegawai
-- ---------------------------------------------------------------------------
drop policy if exists corr_insert on relation_correction_requests;
create policy corr_insert on relation_correction_requests for insert with check (
  assessor_id = auth.uid()
  and status = 'pending'
  and reviewed_by is null and reviewed_at is null and reject_reason is null
  and new_relation is distinct from 'Self'
  and exists (select 1 from periods p where p.id = relation_correction_requests.period_id and p.status = 'active')
  and (
    mapping_id is null
    or exists (
      select 1 from mappings m
      where m.id = relation_correction_requests.mapping_id
        and m.assessor_id = auth.uid()
        and m.target_id = relation_correction_requests.target_id
        and m.period_id = relation_correction_requests.period_id
    )
  )
);

-- ---------------------------------------------------------------------------
-- F) ACC laporan oleh non-HRD (SPV lewat fr_spv_acc) — memperluas trigger 0041
-- ---------------------------------------------------------------------------
create or replace function final_reports_guard_non_hrd() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  emp_name text;
begin
  if auth.uid() is null or hrd_can('laporan') then
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
  if new.spv_acc is distinct from old.spv_acc then
    if old.status = 'draft' then
      raise exception 'Laporan belum dirilis HRD — ACC belum bisa diberikan' using errcode = '42501';
    end if;
    if not exists (select 1 from periods p where p.id = new.period_id and p.status = 'active') then
      raise exception 'ACC hanya untuk laporan periode aktif' using errcode = '42501';
    end if;
    if exists (select 1 from coordinator_team_members c where c.employee_id = new.employee_id) then
      raise exception 'Laporan ini di-ACC oleh koordinatornya, bukan SPV' using errcode = '42501';
    end if;
    select name into actor_name from employees where id = auth.uid();
    select name into emp_name from employees where id = new.employee_id;
    insert into hrd_audit_log (actor_id, actor_name, action, category, summary, target_type, target_id, target_label, meta)
    values (
      auth.uid(), actor_name,
      case when new.spv_acc then 'report.acc' else 'report.acc_revoke' end,
      'laporan',
      format('%s Laporan Kinerja %s (SPV)', case when new.spv_acc then 'Memberi ACC' else 'Membatalkan ACC' end, coalesce(emp_name, new.employee_id::text)),
      'employee', new.employee_id::text, emp_name,
      jsonb_build_object('acc', new.spv_acc, 'via', 'SPV')
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_final_reports_guard_non_hrd on final_reports;
create trigger trg_final_reports_guard_non_hrd
  before update on final_reports
  for each row execute function final_reports_guard_non_hrd();

-- ---------------------------------------------------------------------------
-- G) Respons Direksi atas rencana suksesi
-- ---------------------------------------------------------------------------
create or replace function succession_guard_direksi() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or hrd_can('suksesi') then
    return new;
  end if;
  if new.employee_id     is distinct from old.employee_id
  or new.period_id       is distinct from old.period_id
  or new.plan            is distinct from old.plan
  or new.justification   is distinct from old.justification
  or new.proposed_by     is distinct from old.proposed_by
  or new.created_at      is distinct from old.created_at then
    raise exception 'Direksi hanya dapat merespons (status & komentar) rencana suksesi' using errcode = '42501';
  end if;
  if old.status = 'draft' then
    raise exception 'Rencana ini masih draf HRD — belum diajukan ke Direksi' using errcode = '42501';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'Respons Direksi hanya Disetujui atau Ditolak' using errcode = '42501';
  end if;
  if new.direksi_id is distinct from auth.uid() then
    raise exception 'Respons harus atas nama Direksi yang login' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_succession_guard_direksi on succession_plans;
create trigger trg_succession_guard_direksi
  before update on succession_plans
  for each row execute function succession_guard_direksi();

-- ---------------------------------------------------------------------------
-- H) KPI: tolak pegawai eksternal (fungsi 0042 diperbarui; hak eksekusi tetap service_role)
-- ---------------------------------------------------------------------------
create or replace function kpi_save_with_audit(p_actor uuid, p_ym text, p_rows jsonb) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  n integer := 0;
begin
  perform kpi_assert_active_month(p_ym);
  for r in select * from jsonb_array_elements(p_rows) loop
    if exists (select 1 from employees e where e.id = (r->>'employee_id')::uuid and e.is_external) then
      raise exception 'Pegawai eksternal tidak memiliki KPI' using errcode = '42501';
    end if;
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
revoke all on function kpi_save_with_audit(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function kpi_save_with_audit(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- I) Invarian konfigurasi
-- ---------------------------------------------------------------------------
-- Relasi Self hanya untuk menilai diri sendiri, dan menilai diri sendiri selalu Self.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mappings_self_consistent') then
    alter table mappings add constraint mappings_self_consistent
      check ((relation = 'Self') = (assessor_id = target_id));
  end if;
end $$;

-- Total bobot kelas penilai (tanpa Self) = 100 — selaras Zod di admin/bobot/actions.ts.
create or replace function weights_total_100() returns trigger
  language plpgsql as $$
declare
  w jsonb := new.weights;
  total numeric;
begin
  if new.model = '4class' then
    total := coalesce((w->>'atasan')::numeric, 0) + coalesce((w->>'peer')::numeric, 0)
           + coalesce((w->>'cross')::numeric, 0) + coalesce((w->>'bawahan')::numeric, 0);
  else
    total := coalesce((w->>'atasan')::numeric, 0) + coalesce((w->>'internal')::numeric, 0);
  end if;
  if abs(total - 100) > 0.001 then
    raise exception 'Total bobot kelas penilai (tanpa Self) harus tepat 100%% (sekarang %)', total using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_weight_schemes_total on weight_schemes;
create trigger trg_weight_schemes_total
  before insert or update of weights, model on weight_schemes
  for each row execute function weights_total_100();

drop trigger if exists trg_ewo_total on employee_weight_overrides;
create trigger trg_ewo_total
  before insert or update of weights, model on employee_weight_overrides
  for each row execute function weights_total_100();
