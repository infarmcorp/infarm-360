import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { canSection, grantedAccess, employeeInScopes, type PageScope } from '@/lib/auth/roles';
import { KepatuhanTable } from './kepatuhan-table';
import { Panel } from '@/components/panel';

/**
 * Flag Kepatuhan Penilaian & Punishment (HRD).
 * - Flag keterlambatan: penilaian WAJIB (mapping mandatory) yang belum terkirim.
 * - Flag Self Assessment: pegawai belum mengisi penilaian diri sendiri (assessor=target).
 * - Punishment: input poin pengurangan → compliance_penalties (memotong Skor Akhir).
 */
export default async function KepatuhanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections, dept').eq('id', user.id).maybeSingle();
  // Akses SADAR-MODE: PENUH (+punishment) hanya HRD di Mode Admin; selain itu → jalur GRANT 'kepatuhan'
  // LIHAT-SAJA berlingkup (baca via service_role; input punishment disembunyikan → tetap HRD-only).
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';
  const isHrdFull = canSection(me, 'kepatuhan') && hrdMode === 'admin';
  let grantScopes: PageScope[] | null = null;
  if (!isHrdFull) {
    const { data: g } = await supabase.from('page_grants').select('section, scope, scopes').eq('employee_id', user.id);
    grantScopes = grantedAccess(g, 'kepatuhan')?.scopes ?? null;
  }
  if (!isHrdFull && !grantScopes) {
    return <Shell><p className="text-sm text-ink-soft">Halaman ini untuk HRD Admin atau pemegang akses Flag Kepatuhan.</p>
      <Link href="/" className="text-xs text-brand-ink hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }
  const viaGrant = !isHrdFull;
  const ownDept = (me?.dept ?? '').trim();
  const db = viaGrant ? createAdminClient() : supabase;
  const teamIds = viaGrant && grantScopes!.includes('coordinator_team')
    ? new Set(((await db.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id)).data ?? []).map((r) => r.employee_id))
    : undefined;

  const { data: ap } = await db
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Shell><p className="text-sm text-ink-soft">Tidak ada periode aktif.</p></Shell>;

  const { data: emps } = await db.from('employees').select('id, name, dept').neq('role', 'direksi').eq('is_external', false).eq('is_active', true);
  // Pemegang grant: batasi ke lingkupnya (employeeInScopes; 'coordinator_team' via teamIds).
  const employees = (emps ?? []).filter((e) => !viaGrant || employeeInScopes(grantScopes!, ownDept, user.id, { id: e.id, dept: e.dept }, teamIds));
  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  // Mapping wajib per penilai. SELURUH pegawai → bisa >1000; ambil penuh (hitung telat/self
  // harus lengkap agar keputusan punishment tak keliru).
  const maps = await fetchAllPaged<{ assessor_id: string; target_id: string; mandatory: boolean }>((from, to) =>
    db.from('mappings').select('assessor_id, target_id, mandatory').eq('period_id', ap.id).eq('is_active', true).order('assessor_id').order('target_id').range(from, to));
  // Assessment terkirim → set "assessor:target".
  const asmts = await fetchAllPaged<{ assessor_id: string; target_id: string }>((from, to) =>
    db.from('assessments').select('assessor_id, target_id').eq('period_id', ap.id).eq('status', 'submitted').order('assessor_id').order('target_id').range(from, to));
  const submitted = new Set(asmts.map((a) => `${a.assessor_id}:${a.target_id}`));
  const selfDone = new Set(asmts.filter((a) => a.assessor_id === a.target_id).map((a) => a.assessor_id));

  const { data: pen } = await db
    .from('compliance_penalties').select('employee_id, points').eq('period_id', ap.id);
  const penBy = new Map((pen ?? []).map((p) => [p.employee_id, p.points]));

  const rows = employees.map((e) => {
    const lateTargets = maps
      .filter((m) => m.assessor_id === e.id && m.mandatory && !submitted.has(`${e.id}:${m.target_id}`))
      .map((m) => nameById.get(m.target_id) ?? '—');
    return {
      id: e.id, name: e.name, dept: e.dept,
      lateCount: lateTargets.length, lateTargets,
      selfMissing: !selfDone.has(e.id),
      points: penBy.get(e.id) ?? 0,
    };
  }).sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name));

  const totalLate = rows.filter((r) => r.lateCount > 0).length;
  const totalSelfMissing = rows.filter((r) => r.selfMissing).length;
  const totalPunished = rows.filter((r) => r.points > 0).length;

  return (
    <Shell>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Flag Kepatuhan Penilaian</h1>
          <p className="text-[13.5px] text-ink-soft mt-1">Periode aktif <span className="data-value font-semibold text-ink">{ap.label}</span></p>
        </div>
        <Link href="/" className="text-[12.5px] text-ink-faint hover:text-ink-soft whitespace-nowrap mt-1">← Beranda</Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="border border-line rounded-panel bg-surface p-3 text-center">
          <div className="text-xl font-bold data-value text-danger-ink">{totalLate}</div>
          <div className="text-[10px] font-semibold text-ink-faint uppercase tracking-[0.04em]">Pegawai telat (penilaian wajib)</div>
        </div>
        <div className="border border-line rounded-panel bg-surface p-3 text-center">
          <div className="text-xl font-bold data-value text-warn-ink">{totalSelfMissing}</div>
          <div className="text-[10px] font-semibold text-ink-faint uppercase tracking-[0.04em]">Belum self-assessment</div>
        </div>
        <div className="border border-line rounded-panel bg-surface p-3 text-center">
          <div className="text-xl font-bold data-value text-ink">{totalPunished}</div>
          <div className="text-[10px] font-semibold text-ink-faint uppercase tracking-[0.04em]">Dengan punishment</div>
        </div>
      </div>

      <Panel>
        <KepatuhanTable rows={rows} readOnly={viaGrant} />
      </Panel>
      <p className="text-[11px] text-ink-faint mt-5 leading-relaxed">
        Default menampilkan pegawai yang <strong className="font-semibold text-ink-soft">perlu perhatian</strong> (penilaian wajib telat, belum
        self-assessment, atau sudah punya punishment). &quot;Wajib Telat&quot; = penilaian bersifat Wajib (mapping)
        yang belum dikirim (arahkan kursor untuk daftar nama). Punishment memotong Skor Akhir pegawai di periode ini (min 0).
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">{children}</main>;
}
