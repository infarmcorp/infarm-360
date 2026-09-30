import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';

/**
 * Callback Auth Supabase (PKCE). Dipakai oleh link email — mis. "Lupa Sandi":
 * email → link ke sini dengan ?code=... → tukar code jadi sesi (set cookie) →
 * arahkan ke `next` (default /auth/perbarui-sandi untuk buat sandi baru).
 *
 * Dormant sampai email (Resend/SMTP) + email asli pegawai diaktifkan. Aman bila
 * diakses tanpa code: langsung balik ke /login.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next');
  const next = safeNext(nextParam);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  // Tanpa code / gagal tukar → kembali ke login dengan penanda error.
  return NextResponse.redirect(new URL('/login?reset=invalid', url.origin));
}
