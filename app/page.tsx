import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Pintu utama: belum login → /login. Sudah login → **Beranda (Pusat Tindakan)** di dalam shell,
 * yang menyapa + menampilkan "yang perlu Anda lakukan" (todos) + pintasan per peran. Dari sana
 * pengguna masuk ke fitur. (Beranda ada di route group (app) agar dapat sidebar.)
 */
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  redirect('/beranda');
}
