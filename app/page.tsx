import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';

/**
 * Pintu utama: belum login → /login. Sudah login → landing per peran & mode.
 * Pemegang izin HRD (canAdmin) di MODE ADMIN → Dashboard; Direksi → Dashboard;
 * selain itu (Pegawai / SPV / HRD-base) → **Daftar Penilaian Saya** — tugas penilaian
 * adalah landing paling relevan selama periode aktif; Input KPI tetap di menu sidebar.
 * (Dual-mode: default base; token cookie 'admin' = mode admin.)
 */
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  const role = emp?.role ?? 'employee';
  const jar = await cookies();
  const adminMode = jar.get('hrd_mode')?.value === 'admin';

  const dest = canAdmin(emp) && adminMode ? '/admin/dashboard'
    : role === 'direksi' ? '/admin/dashboard'
    : '/penilaian';
  redirect(dest);
}
