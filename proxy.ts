import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Next.js 16 "proxy" (pengganti konvensi "middleware"). */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Jalankan di semua route kecuali aset statis Next & berkas gambar.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
