import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PerbaruiSandiForm } from './perbarui-sandi-form';

/**
 * Buat sandi baru setelah klik tautan reset dari email. Callback sudah menukar
 * code jadi sesi (cookie), jadi di sini user sudah "login sementara" → cukup
 * updateUser({ password }). Tanpa sesi (akses langsung) → tautan dianggap kedaluwarsa.
 */
export default async function PerbaruiSandiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg p-4 sm:p-6">
      <div className="w-full max-w-sm bg-surface border border-line rounded-panel p-5 sm:p-6">
        <h1 className="text-lg font-bold text-ink">Buat Sandi Baru</h1>
        {user ? (
          <>
            <p className="text-sm text-ink-soft mb-5">
              Untuk akun <strong>{user.email}</strong>. Masukkan sandi baru Anda.
            </p>
            <PerbaruiSandiForm />
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft mb-4">
              Tautan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset baru.
            </p>
            <Link href="/auth/lupa-sandi" className="block text-center bg-brand hover:bg-brand-ink text-white text-sm font-bold py-2 rounded-control transition-colors">
              Minta Tautan Baru
            </Link>
          </>
        )}
        <Link href="/login" className="mt-4 block text-center text-[11px] font-semibold text-brand-ink hover:underline">
          ← Kembali ke Masuk
        </Link>
      </div>
    </main>
  );
}
