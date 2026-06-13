import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Pintu utama (Fase 6 Cutover, Opsi B): versi nyata Supabase.
 * Sudah login → /home; belum → /login. SPA legacy diparkir di /legacy.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? '/home' : '/login');
}
