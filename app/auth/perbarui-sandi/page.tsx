import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/brand-logo';
import { INFARM_PAGE } from '@/app/infarm-fonts';
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
    <main className={`${INFARM_PAGE} min-h-[100dvh] flex items-center justify-center p-4 sm:p-6`}>
      <div className="w-full max-w-sm bg-surface border border-line rounded-card shadow-card p-5 sm:p-6">
        <div className="flex flex-col items-center text-center mb-4">
          <BrandLogo className="w-12 h-12" />
        </div>
        <h1 className="text-[22px] leading-tight font-bold text-ink text-center">Buat Sandi Baru</h1>
        {user ? (
          <>
            <p className="text-[13px] text-ink-soft mt-1.5 mb-5 text-center">
              Untuk akun <strong>{user.email}</strong>. Masukkan sandi baru Anda.
            </p>
            <PerbaruiSandiForm />
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-soft mt-1.5 mb-4 text-center">
              Tautan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset baru.
            </p>
            <Link href="/auth/lupa-sandi" className="flex items-center justify-center min-h-9 bg-brand hover:bg-brand-ink text-white text-[13px] font-bold rounded-xl transition-colors">
              Minta Tautan Baru
            </Link>
          </>
        )}
        <Link href="/login" className="mt-4 block text-center text-xs font-semibold text-brand-ink hover:underline">
          ← Kembali ke Masuk
        </Link>
      </div>
    </main>
  );
}
