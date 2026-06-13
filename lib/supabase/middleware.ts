import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

/**
 * Refresh sesi Supabase di tiap request + lindungi route termigrasi.
 *
 * PENTING (Fase 6 Cutover, Opsi B): `/` kini server-redirect ke landing per peran atau /login
 * (cek sesi sendiri), jadi tetap publik. `/legacy` (SPA demo localStorage), `/login`,
 * & `/auth` juga publik. Route lain butuh sesi → diarahkan ke /login.
 */
const PUBLIC_PREFIXES = ['/login', '/auth', '/legacy'];

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic =
    path === '/' || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  // Route publik (`/`, SPA legacy & login): tak perlu sentuh Supabase → hemat latensi.
  if (isPublic) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // JANGAN sisipkan logika antara createServerClient dan getUser (saran Supabase).
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return response;
}
