import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { DEMO_USERS } from '@/lib/auth/demo-users';
import { LoginForm } from './login-form';

type RosterUser = { email: string; name: string; role: string; dept: string };

/**
 * Roster login dari DB (employees aktif + email dari auth via service_role), agar
 * pegawai yang ditambah lewat "Kelola Pegawai" otomatis muncul. Fallback ke DEMO_USERS
 * bila service key tak tersedia (mis. dev tanpa env).
 */
async function loadRoster(): Promise<RosterUser[]> {
  try {
    const admin = createAdminClient();
    const { data: emps, error } = await admin
      .from('employees').select('id, name, role, dept').eq('is_active', true);
    if (error || !emps?.length) throw error ?? new Error('kosong');

    const emailById = new Map<string, string>();
    let page = 1;
    for (;;) {
      const { data, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (lErr) break;
      data.users.forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
      if (data.users.length < 200) break;
      page++;
    }
    const roster = emps
      .map((e) => ({ email: emailById.get(e.id) ?? '', name: e.name, role: e.role, dept: e.dept }))
      .filter((u) => u.email);
    if (roster.length) return roster;
  } catch { /* fallback di bawah */ }
  return DEMO_USERS.map((u) => ({ email: u.email, name: u.name, role: u.role, dept: u.dept }));
}

/**
 * Login Supabase (email + sandi). Pengganti login demo SPA (1-sandi + localStorage).
 * Kalau sudah ada sesi, langsung ke tujuan.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') ? sp.next : '/';

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  // Roster (tanpa password) untuk dropdown login ala legacy.
  const users = await loadRoster();

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-bold text-gray-800">Infarm 360° Portal</h1>
        <p className="text-sm text-gray-500 mb-5">Pilih peran &amp; nama Anda, lalu masukkan sandi.</p>
        <LoginForm next={next} users={users} />
      </div>
    </main>
  );
}
