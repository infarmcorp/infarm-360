'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Ganti sandi mandiri (semua peran). Memverifikasi sandi saat ini lewat
 * signInWithPassword sebelum updateUser → mencegah penyalahgunaan sesi yang
 * tertinggal login. Sandi tidak pernah dicatat ke log mana pun.
 */
const Input = z.object({
  current: z.string().min(1, 'Sandi saat ini wajib diisi'),
  next: z.string().min(8, 'Sandi baru minimal 8 karakter'),
});

export async function changeOwnPassword(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { current, next } = parsed.data;
  if (current === next) return { ok: false, error: 'Sandi baru harus berbeda dari sandi saat ini' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  // 1) Verifikasi sandi saat ini (re-autentikasi sebagai user yang sama).
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (signInErr) return { ok: false, error: 'Sandi saat ini salah' };

  // 2) Setel sandi baru.
  const { error: updErr } = await supabase.auth.updateUser({ password: next });
  if (updErr) {
    return {
      ok: false,
      error: /different from the old/i.test(updErr.message)
        ? 'Sandi baru harus berbeda dari sandi lama.'
        : 'Gagal menyimpan sandi: ' + updErr.message,
    };
  }
  return { ok: true };
}
