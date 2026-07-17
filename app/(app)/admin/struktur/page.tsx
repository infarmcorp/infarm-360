import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { StrukturView, type Person, type SpvNode, type CoordNode, type DeptStat } from './struktur-view';
import type { OrgNode } from './org-chart';

/**
 * Struktur Organisasi (read-only, HRD): pandangan menyeluruh atas struktur saat ini —
 * lini pelaporan (SPV → tim), lapisan Koordinasi, pegawai tanpa atasan, & ringkasan per
 * divisi. Murni MEMBACA data yang sudah ada (employees + spv_team_members +
 * coordinator_team_members) — tak mengubah apa pun. Tunduk RLS pemanggil (HRD).
 */
export default async function StrukturPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'struktur')) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p>
      <Link href="/" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">← Beranda</Link></Shell>;
  }

  const { data: emps } = await supabase.from('employees')
    .select('id, emp_code, name, dept, role, is_active, is_hrd_admin, is_cross_reviewer, is_coordinator')
    .eq('is_external', false).order('emp_code');
  const employees = emps ?? [];
  const toPerson = (e: (typeof employees)[number]): Person => ({
    id: e.id, empCode: e.emp_code, name: e.name, dept: e.dept, role: e.role,
    active: e.is_active, isHrdAdmin: e.is_hrd_admin, isCrossReviewer: e.is_cross_reviewer, isCoordinator: e.is_coordinator,
  });
  const byId = new Map(employees.map((e) => [e.id, toPerson(e)]));

  const { data: spvRows } = await supabase.from('spv_team_members').select('spv_id, employee_id');
  const { data: coordRows } = await supabase.from('coordinator_team_members').select('coordinator_id, employee_id');

  // Pegawai yang DIKOORDINASI (punya koordinator) → bernaung di bawah koordinatornya, BUKAN
  // langsung SPV. Jadi dikeluarkan dari kartu/anak SPV (tampil di bawah koordinator).
  const coordinatedSet = new Set((coordRows ?? []).map((r) => r.employee_id));

  // Lini pelaporan: spv_id → anggota LANGSUNG (tanpa yang dikoordinasi). Pemimpin = siapa pun
  // yang muncul sebagai spv_id ATAU berposisi 'spv' (termasuk yang belum punya anggota).
  const membersBySpv = new Map<string, Person[]>();
  const memberOf = new Set<string>(); // punya atasan (SPV/koordinator) → untuk deteksi "tanpa atasan"
  (spvRows ?? []).forEach((r) => {
    memberOf.add(r.employee_id);
    if (coordinatedSet.has(r.employee_id)) return; // dikoordinasi → bukan anak langsung SPV
    const m = byId.get(r.employee_id); if (!m) return;
    (membersBySpv.get(r.spv_id) ?? membersBySpv.set(r.spv_id, []).get(r.spv_id)!).push(m);
  });
  (coordRows ?? []).forEach((r) => memberOf.add(r.employee_id)); // dikoordinasi = tetap punya atasan
  const leaderIds = new Set<string>([...membersBySpv.keys()]);
  employees.forEach((e) => { if (e.role === 'spv') leaderIds.add(e.id); });
  const spvNodes: SpvNode[] = [...leaderIds]
    .map((id) => byId.get(id)).filter((p): p is Person => !!p)
    .map((spv) => ({ spv, members: (membersBySpv.get(spv.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.spv.dept.localeCompare(b.spv.dept) || a.spv.name.localeCompare(b.spv.name));

  // Koordinasi (overlay).
  const membersByCoord = new Map<string, Person[]>();
  (coordRows ?? []).forEach((r) => {
    const m = byId.get(r.employee_id); if (!m) return;
    (membersByCoord.get(r.coordinator_id) ?? membersByCoord.set(r.coordinator_id, []).get(r.coordinator_id)!).push(m);
  });
  const coordNodes: CoordNode[] = [...membersByCoord.keys()]
    .map((id) => byId.get(id)).filter((p): p is Person => !!p)
    .map((coord) => ({ coord, members: (membersByCoord.get(coord.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.coord.name.localeCompare(b.coord.name));

  // Pohon bagan (top-down), HANYA pegawai aktif. Atasan EFEKTIF: KOORDINATOR bila ada
  // (pegawai berkoordinator bernaung di bawah koordinatornya, bukan langsung SPV), selain itu
  // SPV utama. Hasilnya: SPV → Koordinator → binaan, & SPV → anggota langsung. Akar = aktif
  // tanpa atasan aktif (Direksi + SPV puncak).
  const activeIds = new Set(employees.filter((e) => e.is_active).map((e) => e.id));
  const coordOf = new Map<string, string>();
  (coordRows ?? []).forEach((r) => { if (!coordOf.has(r.employee_id)) coordOf.set(r.employee_id, r.coordinator_id); });
  const spvOf = new Map<string, string>();
  (spvRows ?? []).forEach((r) => { if (!spvOf.has(r.employee_id)) spvOf.set(r.employee_id, r.spv_id); });
  const parentOf = new Map<string, string>();
  employees.forEach((e) => {
    const cid = coordOf.get(e.id);
    if (cid && cid !== e.id) { parentOf.set(e.id, cid); return; }
    const sid = spvOf.get(e.id);
    if (sid && sid !== e.id) parentOf.set(e.id, sid);
  });
  const childIdsOf = new Map<string, string[]>();
  employees.forEach((e) => {
    if (!activeIds.has(e.id)) return;
    const p = parentOf.get(e.id);
    if (p && activeIds.has(p)) (childIdsOf.get(p) ?? childIdsOf.set(p, []).get(p)!).push(e.id);
  });
  const buildNode = (id: string, seen: Set<string>): OrgNode => {
    const p = byId.get(id)!;
    const kids = (childIdsOf.get(id) ?? [])
      .filter((cid) => !seen.has(cid))
      .map((cid) => buildNode(cid, new Set([...seen, id])))
      .sort((a, b) => (b.children.length > 0 ? 1 : 0) - (a.children.length > 0 ? 1 : 0) || a.name.localeCompare(b.name));
    return { ...p, children: kids };
  };
  const treeRoots: OrgNode[] = employees
    .filter((e) => e.is_active && (() => { const par = parentOf.get(e.id); return !par || !activeIds.has(par); })())
    .map((e) => buildNode(e.id, new Set([e.id])))
    // Akar tunggal tanpa anak (mis. pegawai lepas) disembunyikan dari bagan agar tak berantakan.
    .filter((n) => n.children.length > 0 || n.role === 'direksi' || n.role === 'spv')
    .sort((a, b) => (b.children.length > 0 ? 1 : 0) - (a.children.length > 0 ? 1 : 0) || a.name.localeCompare(b.name));

  const direksi = employees.filter((e) => e.role === 'direksi').map(toPerson);

  // Pegawai aktif tanpa atasan & bukan pemimpin/direksi → potensi pemetaan belum lengkap.
  const orphans = employees
    .filter((e) => e.is_active && e.role !== 'direksi' && !leaderIds.has(e.id) && !memberOf.has(e.id))
    .map(toPerson)
    .sort((a, b) => a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name));

  // Ringkasan per divisi.
  const deptMap = new Map<string, { total: number; active: number }>();
  employees.forEach((e) => {
    const d = deptMap.get(e.dept) ?? { total: 0, active: 0 };
    d.total++; if (e.is_active) d.active++; deptMap.set(e.dept, d);
  });
  const deptStats: DeptStat[] = [...deptMap.entries()]
    .map(([dept, v]) => ({ dept, ...v })).sort((a, b) => a.dept.localeCompare(b.dept));

  const stats = {
    active: employees.filter((e) => e.is_active).length,
    depts: deptMap.size,
    spv: spvNodes.length,
    coord: coordNodes.length,
    hrd: employees.filter((e) => e.is_hrd_admin).length,
    reviewer: employees.filter((e) => e.is_cross_reviewer).length,
  };

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Struktur Organisasi</h1>
          <p className="text-sm text-gray-500">Pandangan menyeluruh struktur saat ini — hanya membaca, tak mengubah data.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:underline">← Beranda</Link>
      </div>
      <StrukturView
        direksi={direksi} spvNodes={spvNodes} coordNodes={coordNodes}
        orphans={orphans} deptStats={deptStats} stats={stats} treeRoots={treeRoots}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full p-4 sm:p-5 lg:p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">{children}</div>
    </main>
  );
}
