import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LupaSandiForm } from './lupa-sandi-form';

/**
 * "Lupa Sandi" — minta link reset via email (Opsi 2). DORMANT di balik flag
 * NEXT_PUBLIC_ENABLE_PW_RESET: bila belum 'true', halaman ini tak aktif → balik ke /login.
 * Aktifkan hanya setelah email asli pegawai + Resend/SMTP siap di Supabase.
 */
export default function LupaSandiPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_PW_RESET !== 'true') redirect('/login');

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-bold text-gray-800">Lupa Sandi</h1>
        <p className="text-sm text-gray-500 mb-5">
          Masukkan email Anda. Kami kirimkan tautan untuk membuat sandi baru.
        </p>
        <LupaSandiForm />
        <Link href="/login" className="mt-4 block text-center text-[11px] text-gray-400 hover:text-gray-600 hover:underline">
          ← Kembali ke Masuk
        </Link>
      </div>
    </main>
  );
}
