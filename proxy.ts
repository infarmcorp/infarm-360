import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import {
  readMaintenance, maintenanceRoute, bypassToken, tokenMatches,
  MAINTENANCE_PATH, BYPASS_COOKIE, BYPASS_PARAM,
} from '@/lib/maintenance';

/** Next.js 16 "proxy" (pengganti konvensi "middleware"). */
export async function proxy(request: NextRequest) {
  // Mode maintenance dicek PALING AWAL — sebelum menyentuh Supabase (bisa jadi sedang dirawat).
  // Saklar = Edge Config (production saja); lihat lib/maintenance.ts.
  const { on } = await readMaintenance();
  const path = request.nextUrl.pathname;

  // Tautan bypass developer: `?bypass=<token>` pasang cookie, `?bypass=off` hapus. Param dibuang dari URL.
  const param = request.nextUrl.searchParams.get(BYPASS_PARAM);
  if (on && param !== null) {
    const token = bypassToken();
    const url = request.nextUrl.clone();
    url.searchParams.delete(BYPASS_PARAM);
    if (url.pathname.startsWith(MAINTENANCE_PATH)) url.pathname = '/';
    const res = NextResponse.redirect(url);
    if (param === 'off') res.cookies.delete(BYPASS_COOKIE);
    else if (tokenMatches(param, token)) {
      res.cookies.set(BYPASS_COOKIE, param, {
        httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
      });
    }
    return res;
  }

  const bypassed = on && tokenMatches(request.cookies.get(BYPASS_COOKIE)?.value, bypassToken());
  switch (maintenanceRoute(path, on, bypassed)) {
    case 'page': {
      const url = request.nextUrl.clone();
      url.pathname = MAINTENANCE_PATH;
      url.search = '';
      const res = NextResponse.rewrite(url, { status: 503 });
      res.headers.set('Retry-After', '1800');
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
    case 'api':
      return NextResponse.json(
        { error: 'Sedang maintenance' },
        { status: 503, headers: { 'Retry-After': '1800', 'Cache-Control': 'no-store' } },
      );
    case 'exit':
      return NextResponse.redirect(new URL('/', request.url));
    case 'pass':
      if (path === MAINTENANCE_PATH) return NextResponse.next({ request });
  }
  return updateSession(request);
}

export const config = {
  // Jalankan di semua route kecuali aset statis Next & berkas gambar.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
