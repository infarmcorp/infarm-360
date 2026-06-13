'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

/**
 * SPA legacy (as-is) — diparkir di /legacy selama transisi cutover (Fase 6, Opsi B).
 * Dimuat client-only (ssr:false) karena App legacy mengakses localStorage saat render.
 * Versi nyata (Supabase + auth + RLS) kini menjadi pintu utama di `/` → /home.
 *
 * Data di sini adalah CONTOH (localStorage), bukan sistem nyata. Akan dihapus
 * setelah semua fitur dimigrasi ke route Supabase.
 */
const App = dynamic(() => import('@/src/App'), { ssr: false });

export default function LegacyPage() {
  return (
    <>
      <div className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-900 text-xs px-4 py-2 flex items-center justify-between gap-3">
        <span>
          <strong>Versi lama (demo)</strong> — data contoh di browser ini, bukan sistem nyata.
          Untuk data & login resmi, gunakan{' '}
          <Link href="/" className="underline font-semibold">aplikasi utama</Link>.
        </span>
        <Link href="/" className="shrink-0 underline font-semibold">Ke aplikasi utama →</Link>
      </div>
      <App />
    </>
  );
}
