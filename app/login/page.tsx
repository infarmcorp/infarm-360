import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';
import { loadLoginRoster } from '@/lib/auth/login-roster';
import { BrandLogo } from '@/components/brand-logo';
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
  const next = safeNext(sp.next);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  // Roster dropdown login ala legacy — TANPA email & sandi (halaman publik; email dicari di server).
  const users = await loadLoginRoster();

  return (
    // TANPA SCROLL DI HP: tinggi dikunci ke `100dvh` (dvh = tinggi viewport nyata setelah bilah
    // alamat browser HP, tak seperti `100vh` yang bikin halaman "kepanjangan" lalu bisa digulir),
    // dan `overflow-hidden` mematikan gulir halaman. Kartu sendiri diberi `overflow-y-auto`
    // sebagai jaring pengaman: di layar sangat pendek isinya tetap bisa dijangkau tanpa membuat
    // SELURUH halaman ikut bergoyang. Logo/jarak dipadatkan di HP agar muat utuh.
    <main className="h-[100dvh] overflow-hidden flex items-center justify-center bg-bg p-4 sm:p-6">
      <div className="w-full max-w-sm max-h-full overflow-y-auto bg-surface border border-line rounded-panel p-5 sm:p-6">
        <div className="flex flex-col items-center text-center mb-4 sm:mb-5">
          <BrandLogo className="w-12 h-12 sm:w-16 sm:h-16 mb-2 sm:mb-3" />
          <h1 className="text-[15px] sm:text-lg font-bold text-ink">Infarm Performance Appraisal</h1>
        </div>
        <LoginForm next={next} users={users} />
      </div>
    </main>
  );
}
