import type { Metadata } from 'next';
import { Wrench } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';

export const metadata: Metadata = {
  title: 'Sedang Maintenance — Infarm 360°',
  robots: { index: false, follow: false },
};

// Dibaca saat request (bukan prerender) agar MAINTENANCE_UNTIL ikut nilai env terbaru.
export const dynamic = 'force-dynamic';

/**
 * Halaman maintenance. Proxy me-rewrite SEMUA route ke sini (status 503) bila env
 * `MAINTENANCE_MODE=true` — lihat `lib/maintenance.ts`. Tanpa Supabase sama sekali.
 */
export default function MaintenancePage() {
  const until = process.env.MAINTENANCE_UNTIL?.trim();

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-bg p-4 sm:p-6">
      <div className="w-full max-w-md bg-surface border border-line rounded-panel p-6 sm:p-8 text-center">
        <BrandLogo className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-5" />
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-warn-tint text-warn-ink">
          <Wrench className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="text-lg font-bold text-ink">Sedang Maintenance</h1>
        <p className="mt-2 text-sm text-ink-soft leading-relaxed">
          Infarm 360° sedang dalam perbaikan dan untuk sementara tidak bisa diakses.
          Data penilaian Anda tetap aman.
        </p>
        {until && (
          <p className="mt-4 text-sm text-ink">
            Perkiraan selesai: <span className="font-semibold">{until}</span>
          </p>
        )}
        <p className="mt-5 text-xs text-ink-faint">
          Silakan coba lagi nanti. Bila mendesak, hubungi HRD.
        </p>
      </div>
    </main>
  );
}
