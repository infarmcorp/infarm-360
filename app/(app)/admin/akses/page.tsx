import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isFullHrd, GRANTABLE_PAGES, GRANTABLE_PAGE_LABELS, PAGE_SCOPES, PAGE_SCOPE_LABELS, HRD_SECTION_LABELS, type HrdSection } from '@/lib/auth/roles';
import { AksesClient, type AksesEmployee } from './akses-client';
import { AksesAudit, type AuditRow } from './akses-audit';

/**
 * Manajemen Akses (HRD) — halaman TUNGGAL untuk memberi akses HALAMAN ber-lingkup kepada pegawai
 * non-HRD (SPV/Koordinator/Direksi/Employee): seluruh pegawai / hanya divisinya / selain divisinya
 * (RBAC data-driven, migrasi 0024). AUGMENT — tak mengubah akses default per-peran.
 *
 * GERBANG: HANYA HRD PENUH (isFullHrd) — rekan HRD yang aksesnya dibatasi tak boleh membuka halaman
 * ini (cegah menaikkan aksesnya sendiri). Data dibaca via service_role (daftar pegawai + grant).
 */
export default async function AdminAksesPage() {
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
    admin.from('employees').select('id, name, dept, role, is_hrd_admin, is_cross_reviewer, is_coordinator, hrd_sections').eq('is_external', false).order('dept').order('name'),
    admin.from('page_grants').select('employee_id, section, scope'),
    admin.from('coordinator_team_members').select('coordinator_id'),
  ]);

  // Jumlah anggota per koordinator (untuk rincian audit).
  const coordCount = new Map<string, number>();
  (coordData ?? []).forEach((c) => coordCount.set(c.coordinator_id, (coordCount.get(c.coordinator_id) ?? 0) + 1));

  // Peta grant per pegawai: employee_id → { section → scope }.
  const grantsByEmp = new Map<string, Record<string, string>>();
  (grantData ?? []).forEach((g) => {
    const m = grantsByEmp.get(g.employee_id) ?? {};
    m[g.section] = g.scope;
    grantsByEmp.set(g.employee_id, m);
  });

  const employees: AksesEmployee[] = (empData ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    dept: e.dept ?? '—',
    role: e.role,
    isHrdAdmin: !!e.is_hrd_admin,
    grants: grantsByEmp.get(e.id) ?? {},
  }));

  const pages = GRANTABLE_PAGES.map((key) => ({ key, label: GRANTABLE_PAGE_LABELS[key] }));
  const scopes = PAGE_SCOPES.map((key) => ({ key, label: PAGE_SCOPE_LABELS[key] }));

  // ── Audit Akses: rincian tiap pegawai yang memegang akses/grant apa pun (di luar default peran) ──
  const auditRows: AuditRow[] = (empData ?? [])
    .map((e) => {
      const access: { label: string; tone: 'indigo' | 'sky' | 'amber' | 'emerald' }[] = [];
      if (e.is_hrd_admin) {
        const secs = (e.hrd_sections ?? []) as HrdSection[];
        access.push({
          label: secs.length
            ? `HRD Admin — ${secs.length} bagian (${secs.map((s) => HRD_SECTION_LABELS[s] ?? s).join(', ')})`
            : 'HRD Admin — akses penuh',
          tone: 'indigo',
        });
      }
      if (e.is_cross_reviewer) access.push({ label: 'Peninjau Lintas Divisi', tone: 'sky' });
      if (e.is_coordinator) access.push({ label: `Koordinator${coordCount.get(e.id) ? ` — ${coordCount.get(e.id)} anggota` : ''}`, tone: 'amber' });
      const g = grantsByEmp.get(e.id) ?? {};
      for (const sec of GRANTABLE_PAGES) {
        const scope = g[sec];
        if (scope) access.push({ label: `${GRANTABLE_PAGE_LABELS[sec]} — ${PAGE_SCOPE_LABELS[scope as keyof typeof PAGE_SCOPE_LABELS] ?? scope}`, tone: 'emerald' });
      }
      return { id: e.id, name: e.name, dept: e.dept ?? '—', role: e.role, access };
    })
    .filter((r) => r.access.length > 0);

  return (
    <Shell>
      <Header />
      <AksesClient employees={employees} pages={pages} scopes={scopes} />
      <AksesAudit rows={auditRows} />
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
