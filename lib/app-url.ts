import { headers } from 'next/headers';

/**
 * URL dasar aplikasi untuk tautan di email — selalu domain PRODUKSI yang stabil,
 * BUKAN host tempat HRD membuka portal (mis. preview deploy/localhost). Prioritas:
 *   1) env eksplisit NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL (override penuh),
 *   2) VERCEL_PROJECT_PRODUCTION_URL (domain produksi kanonik yang diisi Vercel),
 *   3) fallback host permintaan (hanya untuk dev lokal).
 * Mengembalikan '' bila tak terdeteksi (tombol disembunyikan).
 */
export async function appBaseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, '');
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod.replace(/\/+$/, '')}`;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}
