import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { PegawaiClient, type EmpRow, type SpvOpt } from './pegawai-client';
import { PegawaiImport } from './pegawai-import';

/**
 * Kelola Pegawai (HRD): direktori akun + tambah/edit/nonaktif + reset sandi + atasan.
 * Email digabung dari auth.users via service_role (server-only). RLS: HRD.
 */
export default async function PegawaiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) {
    return <Shell><p className="text-sm text-gray-600">Halaman ini hanya untuk HRD Admin.</p></Shell>;
  }

  const { data: emps } = await supabase
    .from('employees').select('id, emp_code, name, dept, role, is_hrd_admin, is_external, is_cross_reviewer, is_active, joined_on, left_on').order('emp_code');
  const list = emps ?? [];

  // Atasan per pegawai (1 SPV utama untuk tampilan; relasi DB tetap many-to-many).
  const { data: teams } = await supabase.from('spv_team_members').select('spv_id, employee_id');
  const spvByEmp = new Map<string, string>();
  (teams ?? []).forEach((t) => { if (!spvByEmp.has(t.employee_id)) spvByEmp.set(t.employee_id, t.spv_id); });

  // Email dari auth (service_role, tak pernah sampai ke klien selain milik baris pegawai).
  const emailById = new Map<string, string>();
  try {
    const admin = createAdminClient();
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      data.users.forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
      if (data.users.length < 200) break;
      page++;
    }
  } catch { /* tanpa email bila service key tak tersedia */ }

  const nameById = new Map(list.map((e) => [e.id, e.name]));
  const rows: EmpRow[] = list.map((e) => {
    const spvId = spvByEmp.get(e.id) ?? null;
    return {
      id: e.id, empCode: e.emp_code, name: e.name, dept: e.dept, role: e.role,
      isHrdAdmin: e.is_hrd_admin, isExternal: e.is_external, isCrossReviewer: e.is_cross_reviewer, active: e.is_active, email: emailById.get(e.id) ?? '',
      joinedOn: e.joined_on, leftOn: e.left_on,
      spvId, spvName: spvId ? nameById.get(spvId) ?? null : null,
    };
  });

  // Calon atasan: SPV, HRD, atau Direksi yang aktif (mis. Direksi→SPV).
  const spvs: SpvOpt[] = list
    .filter((e) => (e.role === 'spv' || e.role === 'hrd' || e.role === 'direksi') && e.is_active)
    .map((e) => ({ id: e.id, name: e.name, dept: e.dept, role: e.role }));
  const depts = [...new Set(list.map((e) => e.dept))].sort();

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Kelola Pegawai</h1>
          <p className="text-sm text-gray-500">
            Tambah, ubah, atau nonaktifkan akun pegawai. Email boleh placeholder — login pakai sandi, ganti email asli kapan saja.
          </p>
        </div>
        <PegawaiImport rows={rows} />
      </div>
      <PegawaiClient rows={rows} spvs={spvs} depts={depts} />
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
