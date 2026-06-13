'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Mode tampilan HRD (dual-mode ala legacy): 'admin' (alat HRD) atau 'spv' (tugas SPV).
 * Hanya memengaruhi UI/menu — otorisasi tetap di RLS (is_hrd sudah berakses luas).
 * Disimpan di cookie agar Server Components (layout) membacanya saat render.
 */
export async function setHrdMode(mode: 'admin' | 'spv') {
  const jar = await cookies();
  jar.set('hrd_mode', mode, { path: '/', sameSite: 'lax', httpOnly: false });
  redirect(mode === 'spv' ? '/kpi' : '/admin/dashboard');
}
