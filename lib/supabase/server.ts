import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

/**
 * Supabase client untuk Server Components & Server Actions.
 * Memakai cookie sesi user → semua query TUNDUK pada RLS sesuai peran user.
 * Gunakan ini untuk operasi atas nama user yang login.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Dipanggil dari Server Component — diabaikan; middleware yang refresh sesi.
          }
        },
      },
    },
  );
}

/**
 * Client service_role — MEM-BYPASS RLS. Hanya untuk operasi terkomputasi sisi server
 * (mis. kalkulasi result_360, kalibrasi skor akhir). JANGAN pernah dipakai untuk
 * meneruskan input mentah dari user tanpa otorisasi manual.
 */
export function createAdminClient() {
  const { createClient: createSb } = require('@supabase/supabase-js');
  return createSb<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
