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
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-bold text-gray-800">Buat Sandi Baru</h1>
        {user ? (
          <>
            <p className="text-sm text-gray-500 mb-5">
              Untuk akun <strong>{user.email}</strong>. Masukkan sandi baru Anda.
            </p>
            <PerbaruiSandiForm />
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Tautan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset baru.
            </p>
            <Link href="/auth/lupa-sandi" className="block text-center bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold py-2 rounded-lg transition-colors">
              Minta Tautan Baru
            </Link>
          </>
        )}
        <Link href="/login" className="mt-4 block text-center text-[11px] text-gray-500 hover:text-gray-600 hover:underline">
          ← Kembali ke Masuk
        </Link>
      </div>
    </main>
  );
}
