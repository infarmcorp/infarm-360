'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { emailForLoginId } from '@/lib/auth/login-roster';
import { LOGIN_FAILED } from '@/lib/auth/login-messages';

const Input = z.object({
  id: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

/**
 * Login lewat dropdown "Pilih dari daftar": browser mengirim id + sandi, server mencari email dari
 * id lalu masuk dengan client sesi (cookie diatur seperti login biasa). Semua kegagalan → LOGIN_FAILED
 * yang sama (tak membocorkan apakah id ada, nonaktif, atau sandinya salah).
 */
export async function signInWithLoginId(id: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Input.safeParse({ id, password });
  if (!parsed.success) return { ok: false, error: LOGIN_FAILED };

  const email = await emailForLoginId(parsed.data.id);
  if (!email) return { ok: false, error: LOGIN_FAILED };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) return { ok: false, error: LOGIN_FAILED };
  return { ok: true };
}
