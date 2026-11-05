import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

/**
 * Refresh sesi Supabase di tiap request + lindungi route termigrasi.
 *
 * PENTING (Fase 6 Cutover, Opsi B): `/` kini server-redirect ke landing per peran atau /login
 * (cek sesi sendiri), jadi tetap publik. `/legacy` (SPA demo localStorage), `/login`,
 * & `/auth` juga publik. Route lain butuh sesi → diarahkan ke /login.
 *
 * `/panduan` (PDF panduan per peran di public/) WAJIB publik: dilampirkan ke email
 * onboarding & diunduh provider email (Gmail/Resend) tanpa sesi — bila digate, provider
 * hanya mendapat halaman login, bukan PDF.
 *
 * `/api/cron/` dipanggil server-ke-server (GitHub Actions/penjadwal) TANPA sesi pengguna — bila digate,
 * pemanggil hanya mendapat redirect ke /login. Tiap route di bawahnya WAJIB memeriksa sendiri
 * `Authorization: Bearer $CRON_SECRET` dan menolak bila CRON_SECRET kosong (gagal tertutup).
 *
 * `/api/version` (cocok PERSIS) hanya mengembalikan id build (SHA commit repo publik) dan dicek
 * ActionGuard tiap 5 menit per tab — bila digate, tiap cek = 1 panggilan Auth Supabase (kuota log).
 */
const PUBLIC_PREFIXES = ['/login', '/auth', '/legacy', '/panduan', '/api/cron/'];
const PUBLIC_EXACT = ['/', '/api/version'];

export function isPublicPath(path: string): boolean {
  return PUBLIC_EXACT.includes(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Route publik (`/`, SPA legacy & login): tak perlu sentuh Supabase → hemat latensi.
  if (isPublicPath(path)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Respons yang membawa cookie sesi baru tak boleh di-cache CDN (saran @supabase/ssr).
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  // JANGAN sisipkan logika antara createServerClient dan getClaims (saran Supabase).
  // getClaims: refresh sesi bila kedaluwarsa (cookie via setAll) lalu verifikasi tanda tangan JWT
  // secara lokal dengan kunci publik project (ES256, di-cache) — tanpa panggilan /auth/v1/user per
  // request. Proxy hanya gerbang redirect; tiap halaman & Server Action TETAP memanggil getUser()
  // (terverifikasi ke server Auth, menangkap sesi yang dicabut) sebelum membaca data.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return response;
}
