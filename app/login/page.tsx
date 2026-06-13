import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEMO_USERS } from '@/lib/auth/demo-users';
import { LoginForm } from './login-form';

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
  const users = DEMO_USERS.map((u) => ({ email: u.email, name: u.name, role: u.role, dept: u.dept }));

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-bold text-gray-800">Infarm 360° Portal</h1>
        <p className="text-sm text-gray-500 mb-5">Pilih peran &amp; nama Anda, lalu masukkan sandi.</p>
        <LoginForm next={next} users={users} />
        <p className="mt-4 text-[11px] text-gray-400">
          Akun demo · sandi <code>Infarm@2026</code>.
        </p>
      </div>
    </main>
  );
}
