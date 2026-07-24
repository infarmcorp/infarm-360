import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isFullHrd, GRANTABLE_PAGES, GRANTABLE_PAGE_LABELS, GRANTABLE_PAGE_KIND, PAGE_SCOPES, PAGE_SCOPE_LABELS } from '@/lib/auth/roles';
import { ACCESS_AUDIT_ACTIONS } from '@/lib/audit/log';
import { AksesClient, type AksesEmployee } from './akses-client';
import { type AksesLogRow } from './akses-log';

const LOG_PAGE_SIZE = 8;

/**
 * Manajemen Akses (HRD) — halaman TUNGGAL untuk memberi akses HALAMAN ber-lingkup kepada pegawai
 * non-HRD (SPV/Koordinator/Direksi/Employee): seluruh pegawai / hanya divisinya / selain divisinya
 * (RBAC data-driven, migrasi 0024). AUGMENT — tak mengubah akses default per-peran.
 *
 * GERBANG: HANYA HRD PENUH (isFullHrd) — rekan HRD yang aksesnya dibatasi tak boleh membuka halaman
 * ini (cegah menaikkan aksesnya sendiri). Data dibaca via service_role (daftar pegawai + grant).
 */
export default async function AdminAksesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; logPage?: string }>;
}) {
  const { tab: tabParam, logPage: logPageParam } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!isFullHrd(me)) {
    return (
      <Shell>
        <Header />
        <p className="text-sm text-gray-600 mt-4">Halaman ini hanya untuk HRD Admin dengan akses penuh.</p>
        <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link>
      </Shell>
    );
  }

  const admin = createAdminClient();
  const [{ data: empData }, { data: grantData }, { data: coordData }] = await Promise.all([
    admin.from('employees').select('id, name, dept, role, is_external, is_hrd_admin, is_coordinator, hrd_sections, joined_on, access_reviewed_at').eq('is_external', false).order('dept').order('name'),
    admin.from('page_grants').select('employee_id, section, scope, scopes, can_edit, can_finalize'),
    admin.from('coordinator_team_members').select('coordinator_id, employee_id'),
  ]);

  // Tim per koordinator (untuk dialog): coordinator_id → daftar employee_id.
  const coordTeams: Record<string, string[]> = {};
  (coordData ?? []).forEach((c) => { (coordTeams[c.coordinator_id] ??= []).push(c.employee_id); });

  // Peta grant per pegawai: employee_id → { section → { scopes[], canEdit, canFinalize } }.
  // Utamakan kolom `scopes[]` (0028); fallback ke `scope` tunggal lama bila kosong.
  const grantsByEmp = new Map<string, Record<string, { scopes: string[]; canEdit: boolean; canFinalize: boolean }>>();
  (grantData ?? []).forEach((g) => {
    const m = grantsByEmp.get(g.employee_id) ?? {};
    const scopes = g.scopes && g.scopes.length ? g.scopes : (g.scope ? [g.scope] : []);
    const canEdit = !!g.can_edit;
    m[g.section] = { scopes, canEdit, canFinalize: canEdit && !!g.can_finalize };
    grantsByEmp.set(g.employee_id, m);
  });

  const employees: AksesEmployee[] = (empData ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    dept: e.dept ?? '—',
    role: e.role,
    isExternal: !!e.is_external,
    isHrdAdmin: !!e.is_hrd_admin,
    isCoordinator: !!e.is_coordinator,
    hrdSections: e.hrd_sections ?? null,
    joinedOn: e.joined_on ?? null,
    accessReviewedAt: e.access_reviewed_at ?? null,
    grants: grantsByEmp.get(e.id) ?? {},
  }));

  const pages = GRANTABLE_PAGES.map((key) => ({ key, label: GRANTABLE_PAGE_LABELS[key], kind: GRANTABLE_PAGE_KIND[key] }));
  const scopes = PAGE_SCOPES.map((key) => ({ key, label: PAGE_SCOPE_LABELS[key] }));

  // ── Log Akses: jejak perubahan akses (grant halaman + izin peran) dari hrd_audit_log, disaring ke
  //    kode aksi akses saja (ACCESS_AUDIT_ACTIONS). Paginasi server-side (?logPage=), 8/hal. ──
  const logPage = Math.max(0, Number.parseInt(logPageParam ?? '0', 10) || 0);
  const { data: logData, count: logCount } = await admin
    .from('hrd_audit_log')
    .select('id, actor_name, summary, target_label, created_at', { count: 'exact' })
    .in('action', ACCESS_AUDIT_ACTIONS as unknown as string[])
    .order('created_at', { ascending: false })
    .range(logPage * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE + LOG_PAGE_SIZE - 1);
  const logRows: AksesLogRow[] = (logData ?? []).map((r) => ({
    id: r.id,
    actor: r.actor_name ?? '—',
    summary: r.summary,
    targetLabel: r.target_label,
    createdAt: r.created_at,
  }));

  const initialTab = tabParam === 'cabut' || tabParam === 'log' ? tabParam : 'beri';

  return (
    <Shell>
      <Header />
      <AksesClient
        employees={employees} pages={pages} scopes={scopes} coordTeams={coordTeams} meId={user.id}
        initialTab={initialTab}
        logRows={logRows} logPage={logPage} logPageSize={LOG_PAGE_SIZE} logTotal={logCount ?? 0}
      />
    </Shell>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Manajemen Akses</h1>
        <p className="text-sm text-gray-500 max-w-3xl">
          Berikan akses halaman tertentu kepada SPV/Koordinator/Direksi/pegawai, lengkap dengan
          <span className="font-semibold text-gray-600"> lingkup data</span>: seluruh pegawai, hanya divisinya,
          atau selain divisinya. Akses ini <span className="font-semibold text-gray-600">menambah</span> —
          tak mengubah akses bawaan tiap peran.
        </p>
      </div>
      <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
