import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTodos } from '@/lib/todos/compute';
import { AppShell, type Role } from './app-shell';

/**
 * Shell aplikasi (route group `(app)`): sidebar persisten + konten yang berganti,
 * menggantikan pola "Beranda hub". URL tiap route tidak berubah (route group tak
 * memengaruhi path). Auth + profil + indikator periode aktif dimuat sekali di sini.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: emp } = await supabase
    .from('employees').select('emp_code, name, dept, role').eq('id', user.id).maybeSingle();
  const role = (emp?.role ?? 'employee') as Role;

  const { data: ap } = await supabase
    .from('periods').select('label, status').eq('status', 'active').limit(1).maybeSingle();

  // Mode tampilan HRD (dual-mode): default 'admin'. Hanya berlaku untuk peran hrd.
  const jar = await cookies();
  const hrdMode = jar.get('hrd_mode')?.value === 'spv' ? 'spv' : 'admin';

  // Tugas & Notifikasi (diturunkan dari data; best-effort, tak memblokir render).
  const todos = await getTodos(supabase, user.id, role, hrdMode);

  return (
    <AppShell
      role={role}
      hrdMode={hrdMode}
      name={emp?.name ?? user.email ?? 'Pengguna'}
      dept={emp?.dept ?? '—'}
      empCode={emp?.emp_code ?? '—'}
      periodLabel={ap?.label ?? null}
      periodActive={ap?.status === 'active'}
      todos={todos}
    >
      {children}
    </AppShell>
  );
}
