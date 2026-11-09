import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { INFARM_PAGE } from '@/app/infarm-fonts';
import { LupaSandiForm } from './lupa-sandi-form';

/**
 * "Lupa Sandi" — minta link reset via email (Opsi 2). DORMANT di balik flag
 * NEXT_PUBLIC_ENABLE_PW_RESET: bila belum 'true', halaman ini tak aktif → balik ke /login.
 * Aktifkan hanya setelah email asli pegawai + Resend/SMTP siap di Supabase.
 */
export default function LupaSandiPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_PW_RESET !== 'true') redirect('/login');

  return (
    <main className={`${INFARM_PAGE} min-h-[100dvh] flex items-center justify-center p-4 sm:p-6`}>
      <div className="w-full max-w-sm bg-surface border border-line rounded-card shadow-card p-5 sm:p-6">
        <div className="flex flex-col items-center text-center mb-4">
          <BrandLogo className="w-12 h-12" />
        </div>
        <h1 className="text-[22px] leading-tight font-bold text-ink text-center">Lupa Sandi</h1>
        <p className="text-[13px] text-ink-soft mt-1.5 mb-5 text-center">
          Masukkan email Anda. Kami kirimkan tautan untuk membuat sandi baru.
        </p>
        <LupaSandiForm />
        <Link href="/login" className="mt-4 block text-center text-xs font-semibold text-brand-ink hover:underline">
          ← Kembali ke Masuk
        </Link>
      </div>
    </main>
  );
}
