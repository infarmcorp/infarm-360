import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Logout: hapus sesi Supabase lalu kembali ke /login. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
