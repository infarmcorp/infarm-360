import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin, canCoordinate, grantedAccess, employeeInScopes } from '@/lib/auth/roles';
import { KpiForm } from './kpi-form';
import { RekapView } from './rekap-view';
import { RiwayatView } from './riwayat-view';

/**
 * Kinerja Tim / Monitoring KPI (SPV/HRD/Direksi). Tab via ?tab=input|riwayat|rekap.
 *  - Input KPI: aktivitas SUPERVISI → hanya SPV atau HRD dalam mode SPV.
 *  - Riwayat & Audit: SPV (tim) / HRD (semua, monitoring).
 *  - Rekapitulasi Kuartal: + Direksi (read-only).
 * RLS membatasi data ke lingkup peran.
 */
export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; view?: string; auditPage?: string; auditQ?: string }>;
}) {
  const { tab: tabParam, period, view: viewParam, auditPage: auditPageParam, auditQ: auditQParam } = await searchParams;
  // Monitoring: tab Rekap|Riwayat (default rekap) → HANYA tab aktif yang query (hemat egress:
  // audit kpi_audit yang append-only tak ditarik saat landing). Paginasi/pencarian audit di server.
  const view = viewParam === 'riwayat' ? 'riwayat' : 'rekap';
  const auditPage = Math.max(0, Number(auditPageParam) || 0);
  const auditQ = auditQParam ?? '';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, is_coordinator, dept').eq('id', user.id).maybeSingle();
  const role = me?.role ?? 'employee';
  const admin = canAdmin(me);
  // Koordinator "murni" (grant is_coordinator, bukan SPV/HRD): input KPI HANYA pegawai naungannya.
  const isCoord = canCoordinate(me) && role !== 'spv' && role !== 'hrd';
  const jar = await cookies();
  // Cookie absen = base/SPV (konsisten dgn layout.tsx & app/page.tsx; login mereset ke base).
  const hrdMode = jar.get('hrd_mode')?.value === 'admin' ? 'admin' : 'spv';

  // Input KPI: SPV / HRD-posisi mode-SPV (supervisi tim/divisi) + KOORDINATOR (tim naungannya).
  // Monitoring & Audit KPI (baca semua) untuk pemegang izin HRD (admin) / SPV (tim).
  // Direksi TIDAK punya akses ke halaman ini (Rekapitulasi Kuartal dihapus untuk Direksi).
  const canInput = role === 'spv' || (role === 'hrd' && hrdMode === 'spv') || isCoord;
  const canAudit = role === 'spv' || admin;
  const canView = canAudit;
  if (!canView && !canInput) {
    // Jalur GRANT (Manajemen Akses): non-HRD/non-SPV yang DIBERI akses "Monitoring & Audit KPI"
    // berlingkup. Data disaring server (service_role) ke pegawai dalam lingkup grant — pemegang
    // grant diblokir RLS, jadi paparan ini murni app-level & LIHAT-SAJA (tanpa Input KPI).
    const { data: grants } = await supabase.from('page_grants').select('section, scope, scopes, can_edit').eq('employee_id', user.id);
    const kpiGrant = grantedAccess(grants ?? [], 'kpi');
    if (!kpiGrant) {
      return <Shell><p className="text-sm text-gray-600">Halaman ini untuk SPV / HRD / Koordinator.</p></Shell>;
    }

    // Saring pegawai per-lingkup (mirror pola halaman grant lain: ambil semua → filter di JS).
    const svc = createAdminClient();
    const ownDept = me?.dept ?? '';
    let teamIds: Set<string> | null = null;
    if (kpiGrant.scopes.includes('coordinator_team')) {
      const { data: team } = await svc.from('coordinator_team_members').select('employee_id').eq('coordinator_id', user.id);
      teamIds = new Set((team ?? []).map((r) => r.employee_id));
    }
    const { data: allEmps } = await svc.from('employees').select('id, dept').neq('role', 'direksi').eq('is_external', false);
    const scopedIds = (allEmps ?? [])
      .filter((e) => employeeInScopes(kpiGrant.scopes, ownDept, user.id, e, teamIds))
      .map((e) => e.id);

    return (
      <main className="w-full p-4 sm:p-5 lg:p-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-800">Monitoring &amp; Audit KPI</h1>
          <p className="mt-1 text-sm text-gray-500">Rekapitulasi kuartal &amp; jejak audit perubahan KPI dalam lingkup akses Anda (lihat-saja).</p>
        </div>
        <MonitoringTabs view={view} period={period} />
        <div className="mt-4">
          {view === 'riwayat' ? (
            <Panel title="Riwayat &amp; Audit Perubahan KPI">
              <RiwayatView role={role} userId={user.id} byPeriod periodParam={period} scopedIds={scopedIds} page={auditPage} query={auditQ} />
            </Panel>
          ) : (
            <Panel title="Rekapitulasi Kuartal">
              <RekapView role={role} userId={user.id} periodParam={period} scopedIds={scopedIds} />
            </Panel>
          )}
        </div>
      </main>
    );
  }

  // Mode INPUT (SPV / HRD-SPV): berfitur tab. Mode MONITORING (HRD admin):
  // satu halaman — Rekapitulasi + Riwayat & Audit berdampingan (ala legacy), tanpa tab.
  if (!canInput) {
    return (
      <main className="w-full p-4 sm:p-5 lg:p-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-800">Monitoring &amp; Audit KPI</h1>
          <p className="mt-1 text-sm text-gray-500">Rekapitulasi kuartal &amp; jejak audit perubahan KPI seluruh pegawai.</p>
        </div>
        <MonitoringTabs view={view} period={period} />
        <div className="mt-4">
          {view === 'riwayat' ? (
            <Panel title="Riwayat &amp; Audit Perubahan KPI">
              <RiwayatView role={role} canAdmin={admin} userId={user.id} byPeriod periodParam={period} page={auditPage} query={auditQ} />
            </Panel>
          ) : (
            <Panel title="Rekapitulasi Kuartal">
              <RekapView role={role} userId={user.id} periodParam={period} />
            </Panel>
          )}
        </div>
      </main>
    );
  }

  // Mode input (tab). Koordinator "murni" dibatasi ke tab Input saja (tanpa Riwayat/Rekap —
  // yang butuh scoping baca tim; lihat keputusan "Input saja"). Tab dipaksa 'input' untuknya.
  const allowed = new Set<string>(['input', 'riwayat', 'rekap']);
  const requested = tabParam && allowed.has(tabParam) ? tabParam : null;
  const tab = isCoord ? 'input' : (requested ?? 'input');

  return (
    <Shell>
      <h1 className="text-xl font-bold text-gray-800">{isCoord ? 'Input KPI' : 'Kinerja Tim'}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {isCoord
          ? 'Input KPI bulanan untuk pegawai yang Anda koordinasikan.'
          : 'Input KPI bulanan, riwayat audit, & rekapitulasi per kuartal anggota tim.'}
      </p>

      {/* Tab nav — disembunyikan untuk koordinator (hanya Input KPI). */}
      {!isCoord && (
        <div className="flex gap-1 mt-4 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
          <Tab href="/kpi?tab=input" active={tab === 'input'}>Input KPI</Tab>
          <Tab href="/kpi?tab=riwayat" active={tab === 'riwayat'}>Riwayat &amp; Audit</Tab>
          <Tab href="/kpi?tab=rekap" active={tab === 'rekap'}>Rekapitulasi Kuartal</Tab>
        </div>
      )}

      {tab === 'input' ? (
        <InputTab supabase={supabase} userId={user.id} role={role} isCoord={isCoord} />
      ) : tab === 'riwayat' ? (
        <RiwayatView role={role} canAdmin={admin} userId={user.id} hrdMode={hrdMode} page={auditPage} query={auditQ} />
      ) : (
        <RekapView role={role} userId={user.id} periodParam={period} hrdMode={hrdMode} />
      )}
    </Shell>
  );
}

/** Tab Monitoring: Rekap | Riwayat & Audit. Hanya tab aktif yang query (hemat egress). */
function MonitoringTabs({ view, period }: { view: 'rekap' | 'riwayat'; period?: string }) {
  const suffix = period ? `&period=${period}` : '';
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
      <Tab href={`/kpi?view=rekap${suffix}`} active={view === 'rekap'}>Rekapitulasi Kuartal</Tab>
      <Tab href={`/kpi?view=riwayat${suffix}`} active={view === 'riwayat'}>Riwayat &amp; Audit</Tab>
    </div>
  );
}

/** Kartu panel dengan header lengket & scroll vertikal independen. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col max-h-[78vh]">
      <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight px-5 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">{title}</h2>
      <div className="p-5 overflow-y-auto">{children}</div>
    </div>
  );
}

/**
 * Tab Input KPI. Lingkup pegawai per pelaku:
 *  - SPV       → anggota tim (RLS is_my_member) + dirinya, KECUALI pegawai berkoordinator
 *    (itu diinput koordinatornya) — dikeluarkan dari daftar (paritas dgn alur ACC).
 *  - HRD mode-SPV → pegawai DIVISINYA, juga KECUALI pegawai berkoordinator (paritas UX).
 *  - Koordinator → HANYA pegawai di coordinator_team_members-nya. Koordinator = pegawai biasa
 *    di RLS → baca lewat service_role (RLS blokir baca KPI/tim); tulis lewat cabang koordinator
 *    di saveKpiScores (juga service_role, berlingkup).
 */
async function InputTab({
  supabase, userId, role, isCoord,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: string; isCoord: boolean;
}) {
  // Koordinator = pegawai biasa di RLS → seluruh baca lewat service_role. SPV/HRD tetap RLS.
  const svc = createAdminClient();
  const readClient = isCoord ? svc : supabase;

  // Buang pegawai yang PUNYA koordinator dari daftar (dipakai jalur SPV & HRD mode-SPV).
  // coordinator_team_members tak terbaca SPV via RLS → lookup via service_role.
  const excludeCoordinated = async (
    list: { id: string; emp_code: string; name: string; dept: string }[],
  ) => {
    if (list.length === 0) return list;
    const { data: ct } = await svc.from('coordinator_team_members')
      .select('employee_id').in('employee_id', list.map((e) => e.id));
    const coordinated = new Set((ct ?? []).map((r) => r.employee_id));
    return list.filter((e) => !coordinated.has(e.id));
  };

  // Dua rantai independen — lingkup pegawai vs periode/bulan aktif → jalankan paralel.
  const scopeEmps = async (): Promise<{ id: string; emp_code: string; name: string; dept: string }[]> => {
    if (isCoord) {
      const { data: team } = await svc.from('coordinator_team_members').select('employee_id').eq('coordinator_id', userId);
      const ids = (team ?? []).map((r) => r.employee_id);
      if (!ids.length) return [];
      const { data } = await svc.from('employees').select('id, emp_code, name, dept')
        .in('id', ids).eq('is_active', true).eq('is_external', false);
      return data ?? [];
    }
    if (role === 'hrd') {
      const { data: me } = await supabase.from('employees').select('dept').eq('id', userId).maybeSingle();
      const { data } = await supabase
        .from('employees').select('id, emp_code, name, dept')
        .eq('dept', me?.dept ?? '__none__').neq('role', 'direksi').eq('is_external', false).eq('is_active', true);
      return excludeCoordinated(data ?? []);
    }
    const { data: teamRows } = await supabase.from('spv_team_members').select('employee_id').eq('spv_id', userId);
    const memberIds = (teamRows ?? []).map((r) => r.employee_id);
    // SPV juga mencatat capaian KPI dirinya sendiri → selalu sertakan userId.
    const ids = [...new Set([userId, ...memberIds])];
    const { data } = await supabase.from('employees').select('id, emp_code, name, dept').in('id', ids);
    return excludeCoordinated(data ?? []);
  };
  const scopeMonths = async (): Promise<string[]> => {
    const { data: activePeriods } = await readClient.from('periods').select('id').eq('status', 'active');
    const periodIds = (activePeriods ?? []).map((p) => p.id);
    if (!periodIds.length) return [];
    const { data: monthRows } = await readClient.from('period_months').select('ym').in('period_id', periodIds).order('ym');
    return (monthRows ?? []).map((m) => m.ym);
  };
  const [emps, monthOptions] = await Promise.all([scopeEmps(), scopeMonths()]);
  const members = emps.map((e) => ({ id: e.id, code: e.emp_code, name: e.name, dept: e.dept }));

  if (members.length === 0) return <p className="text-sm text-gray-500">Belum ada anggota tim yang ditugaskan kepada Anda.</p>;
  if (monthOptions.length === 0) return <p className="text-sm text-gray-500">Tidak ada periode aktif. Hubungi HRD untuk mengaktifkan siklus.</p>;

  // Skor yang SUDAH ada (per pegawai+bulan dalam periode aktif) → dipakai pratinjau Excel
  // menandai baris yang "akan menimpa" input sebelumnya. Hanya petunjuk visual; revalidate
  // saat simpan menyegarkan map ini.
  const { data: scoreRows } = await readClient
    .from('kpi_scores').select('employee_id, ym, score')
    .in('employee_id', members.map((m) => m.id)).in('ym', monthOptions);
  const existing: Record<string, number> = {};
  for (const r of scoreRows ?? []) existing[`${r.employee_id}|${r.ym}`] = r.score;

  return <KpiForm members={members} months={monthOptions} existing={existing} />;
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
        active ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
