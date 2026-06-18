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
    .from('periods').select('label, status, end_date').eq('status', 'active').limit(1).maybeSingle();

  // Sisa hari menuju end_date (berbasis tanggal, UTC) → indikator deadline di sidebar.
  const periodDaysLeft = ap?.end_date ? daysUntil(ap.end_date) : null;

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
      periodDaysLeft={periodDaysLeft}
      todos={todos}
    >
      {children}
    </AppShell>
  );
}

/** Selisih hari (tanggal, UTC) dari hari ini ke end_date. >0 sisa, 0 hari ini, <0 lewat. */
function daysUntil(endDate: string): number {
  const end = new Date(endDate + 'T00:00:00Z').getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / 86400000);
}
