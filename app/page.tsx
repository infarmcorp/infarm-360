import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Pintu utama: belum login → /login. Sudah login → landing per peran (ala legacy):
 * Pegawai → Daftar Penilaian · SPV → Input KPI · HRD/Direksi → Dashboard.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  const role = emp?.role ?? 'employee';
  const dest = role === 'spv' ? '/kpi'
    : role === 'hrd' || role === 'direksi' ? '/admin/dashboard'
    : '/penilaian';
  redirect(dest);
}
