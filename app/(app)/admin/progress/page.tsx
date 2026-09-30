import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection, grantedAccess, employeeInScopes, type PageScope } from '@/lib/auth/roles';
import { ProgressClient, type AssessorRow, type TargetRow } from './progress-client';

/**
 * Progress 360 Feedback (HRD): kelengkapan pengisian 360 per PENILAI di periode aktif.
 * total = jumlah mapping (assessor), done = assessment 'submitted'. Mendukung Paksa
 * Selesai per tugas & Kirim Pengingat (email menyusul Resend). RLS: HRD only.
 */
export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections, dept').eq('id', user.id).maybeSingle();
  // Akses SADAR-MODE: PENUH hanya HRD di Mode Admin; selain itu → jalur GRANT 'progress' berlingkup
  // (LIHAT-SAJA; aksi tulis tetap HRD-only). Baca via service_role, disaring per lingkup.
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const isHrdFull = canSection(me, 'progress') && hrdMode === 'admin';
  let grantScopes: PageScope[] | null = null;
  if (!isHrdFull) {
    const { data: g } = await supabase.from('page_grants').select('section, scope, scopes').eq('employee_id', user.id);
    grantScopes = grantedAccess(g, 'progress')?.scopes ?? null;
  }
  if (!isHrdFull && !grantScopes) {
    return <Shell><p className="text-sm text-ink-soft">Halaman ini untuk HRD Admin atau pemegang akses Progress 360°.</p></Shell>;
  }
  const viaGrant = !isHrdFull;
  const ownDept = (me?.dept ?? '').trim();
  const db = viaGrant ? createAdminClient() : supabase;
  const teamIds = viaGrant && grantScopes!.includes('coordinator_team')
    ? new Set(((await db.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id)).data ?? []).map((r) => r.employee_id))
    : undefined;

  const { data: ap } = await db.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-ink-soft">Tidak ada periode aktif.</p></Shell>;

  // Independen → paralel. mappings & assessments SELURUH pegawai → bisa >1000; ambil penuh.
  const [empsRes, maps, asmtsAll] = await Promise.all([
    db.from('employees').select('id, name, dept'),
    fetchAllPaged<{ assessor_id: string; target_id: string; relation: string; mandatory: boolean }>((from, to) =>
      // is_adhoc DIKECUALIKAN: Ad-Hoc mandiri bersifat rahasia (bukan penugasan HRD) → tak masuk
      // Progress 360. Pemetaan hasil PERMOHONAN yang disetujui HRD masuk, karena ia disimpan
      // sebagai pemetaan wajib non-ad-hoc (lihat reviewCorrection).
      db.from('mappings').select('assessor_id, target_id, relation, mandatory').eq('period_id', ap.id).eq('is_active', true).eq('is_adhoc', false).order('assessor_id').order('target_id').range(from, to)),
    fetchAllPaged<{ assessor_id: string; target_id: string; status: string }>((from, to) =>
      db.from('assessments').select('assessor_id, target_id, status').eq('period_id', ap.id).order('assessor_id').order('target_id').range(from, to)),
  ]);
  // Pemegang grant: himpunan id pegawai DALAM lingkup → menyaring baris penilai & yang-dinilai.
  const scopedIds = viaGrant
    ? new Set((empsRes.data ?? []).filter((e) => employeeInScopes(grantScopes!, ownDept, user.id, { id: e.id, dept: e.dept }, teamIds)).map((e) => e.id))
    : null;
  const empById = new Map((empsRes.data ?? []).map((e) => [e.id, e]));
  const submitted = new Set(asmtsAll.filter((a) => a.status === 'submitted').map((a) => `${a.assessor_id}|${a.target_id}`));
  // BR-03: Not Eligible → kewajiban gugur, dikeluarkan dari tunggakan; ditandai terpisah utk review HRD.

  // Kelompokkan tugas per penilai (bawa relasi & sifat wajib/opsional).
  const byAssessor = new Map<string, { targetId: string; relation: string; mandatory: boolean }[]>();
  maps.forEach((m) => {
    const a = byAssessor.get(m.assessor_id) ?? [];
    a.push({ targetId: m.target_id, relation: m.relation as string, mandatory: m.mandatory });
    byAssessor.set(m.assessor_id, a);
  });

  const rows: AssessorRow[] = [...byAssessor.entries()].map(([assessorId, tasks]) => {
    const e = empById.get(assessorId);
    const activeTasks = tasks;
    const pending = activeTasks
      .filter((t) => !submitted.has(`${assessorId}|${t.targetId}`))
      .map((t) => ({ targetId: t.targetId, targetName: empById.get(t.targetId)?.name ?? '—', relation: t.relation, mandatory: t.mandatory }));
    // Kelengkapan diukur dari penilaian WAJIB saja (opsional tak menentukan "lengkap").
    const mandatoryTasks = activeTasks.filter((t) => t.mandatory);
    const mandatoryDone = mandatoryTasks.filter((t) => submitted.has(`${assessorId}|${t.targetId}`)).length;
    return {
      id: assessorId,
      name: e?.name ?? '—',
      dept: e?.dept ?? '—',
      total: activeTasks.length,
      done: activeTasks.length - pending.length,
      mandatoryTotal: mandatoryTasks.length,
      mandatoryDone,
      pending,
    };
  }).sort((a, b) => {
    // Urutkan dari yang kelengkapan WAJIB-nya paling rendah (tak ada wajib → dianggap penuh).
    const ra = a.mandatoryTotal ? a.mandatoryDone / a.mandatoryTotal : 1;
    const rb = b.mandatoryTotal ? b.mandatoryDone / b.mandatoryTotal : 1;
    return ra - rb || a.name.localeCompare(b.name);
  });

  // Info per yang DINILAI (target): total penilai yang ditugaskan & berapa yang sudah menilai dia.
  const byTarget = new Map<string, string[]>();
  maps.forEach((m) => {
    const a = byTarget.get(m.target_id) ?? [];
    a.push(m.assessor_id);
    byTarget.set(m.target_id, a);
  });

  const targetRows: TargetRow[] = [...byTarget.entries()].map(([targetId, assessorIds]) => {
    const e = empById.get(targetId);
    const done = assessorIds.filter((aid) => submitted.has(`${aid}|${targetId}`)).length;
    return { id: targetId, name: e?.name ?? '—', dept: e?.dept ?? '—', total: assessorIds.length, done };
  }).sort((a, b) => (a.done / Math.max(a.total, 1)) - (b.done / Math.max(b.total, 1)) || a.name.localeCompare(b.name));

  // Pemegang grant: saring baris ke lingkup (penilai & yang-dinilai dalam lingkup).
  // Siapa-menilai-siapa HANYA untuk HRD (keputusan 2026-09-29): pemegang grant non-HRD hanya melihat
  // JUMLAH per penilai/target — daftar target (nama + relasi) DIBUANG di server, tak ikut ke browser.
  const rowsScoped = scopedIds ? rows.filter((r) => scopedIds.has(r.id)) : rows;
  const rowsOut = viaGrant
    ? rowsScoped.map((r) => ({ ...r, pending: r.pending.map(() => ({ targetId: '', targetName: '', relation: '', mandatory: false })) }))
    : rowsScoped;
  const targetRowsOut = scopedIds ? targetRows.filter((t) => scopedIds.has(t.id)) : targetRows;

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Progress 360 Feedback</h1>
        <p className="text-[13.5px] text-ink-soft mt-1">Periode aktif <span className="data-value font-semibold text-ink">{ap.label}</span> · kelengkapan pengisian 360°.{viaGrant ? ' (lihat-saja)' : ''}</p>
      </div>
      <ProgressClient rows={rowsOut} targetRows={targetRowsOut} readOnly={viaGrant} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
