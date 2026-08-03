'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Mode tampilan dual-mode: 'admin' (alat HRD) atau 'spv' (token mode posisi-asli/base).
 * Hanya memengaruhi UI/menu — otorisasi tetap di RLS (is_hrd sudah berakses luas).
 * Disimpan di cookie agar Server Components (layout) membacanya saat render.
 * Mode admin → Beranda (Pusat Tindakan, khusus HRD Admin). Mode base → '/' agar landing
 * menyesuaikan posisi asli (employee/spv) — peran non-admin tak punya Beranda.
 */
export async function setHrdMode(mode: 'admin' | 'spv') {
  const jar = await cookies();
  jar.set('hrd_mode', mode, { path: '/', sameSite: 'lax', httpOnly: false });
  redirect(mode === 'admin' ? '/beranda' : '/');
}
