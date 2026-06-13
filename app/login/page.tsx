import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
  const next = sp.next && sp.next.startsWith('/') ? sp.next : '/home';

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-bold text-gray-800">Infarm 360° Portal</h1>
        <p className="text-sm text-gray-500 mb-5">Masuk dengan akun Anda.</p>
        <LoginForm next={next} />
        <p className="mt-4 text-[11px] text-gray-400">
          Akun demo: <code>nama@infarm.test</code> · sandi <code>Infarm@2026</code>.
        </p>
      </div>
    </main>
  );
}
