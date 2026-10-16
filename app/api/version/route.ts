import { NextResponse } from 'next/server';

/**
 * Versi build yang sedang dilayani server. Dibandingkan dengan versi yang tertanam di halaman yang
 * sedang terbuka (ActionGuard) → bila beda, aplikasi baru saja di-deploy dan halaman lama perlu dimuat
 * ulang (aksi dari halaman lama bisa gagal tanpa pesan). Tanpa data apa pun selain id build.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
