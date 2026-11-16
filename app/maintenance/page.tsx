import type { Metadata } from 'next';
import { Wrench } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { readMaintenance } from '@/lib/maintenance';
import { INFARM_PAGE } from '@/app/infarm-fonts';

export const metadata: Metadata = {
  title: 'Sedang Dalam Perbaikan — Infarm 360°',
  robots: { index: false, follow: false },
};

// Dibaca saat request (bukan prerender) agar `maintenance_until` ikut nilai Edge Config terbaru.
export const dynamic = 'force-dynamic';

/**
 * Halaman maintenance. Proxy me-rewrite SEMUA route ke sini (status 503) bila item Edge Config
 * `maintenance` = true di production — lihat `lib/maintenance.ts`. Tanpa Supabase sama sekali.
 */
export default async function MaintenancePage() {
  const { until } = await readMaintenance();

  return (
    <main className={`${INFARM_PAGE} min-h-[100dvh] flex items-center justify-center p-4 sm:p-6`}>
      <div className="w-full max-w-md bg-surface border border-line rounded-card shadow-card p-6 sm:p-8 text-center">
        <BrandLogo className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-5" />
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-warn-tint text-warn-ink">
          <Wrench className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="text-[22px] leading-tight font-bold text-ink">Sedang Dalam Perbaikan</h1>
        <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">
          Infarm 360° sedang dalam perbaikan dan belum bisa diakses. Data penilaian Anda aman.
        </p>
        {until && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-neutral-tint px-3 py-1 text-xs text-ink">
            Perkiraan selesai: <span className="font-semibold font-mono">{until}</span>
          </p>
        )}
        <p className="mt-5 text-xs text-ink-soft">
          Silakan coba lagi nanti. Bila mendesak, hubungi HRD.
        </p>
      </div>
    </main>
  );
}
