'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { WeightValues } from '@/lib/database.types';

/**
 * Kelola Bobot Penilai (HRD) — atur skema bobot 360 periode aktif.
 *  - 4class: Atasan/Peer/Cross/Self · 2class: Atasan/Internal.
 * Memengaruhi computeResult360 (perlu Hitung Ulang Skor 360 setelah ubah).
 * RLS weight_schemes write = HRD. Indeks unik menjaga 1 skema aktif/periode.
 */
const Input = z.object({
  model: z.enum(['4class', '2class']),
  atasan: z.coerce.number().min(0).max(100),
  peer: z.coerce.number().min(0).max(100),
  cross: z.coerce.number().min(0).max(100),
  self: z.coerce.number().min(0).max(100),
  internal: z.coerce.number().min(0).max(100),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveWeights(raw: unknown): Promise<SaveResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat mengubah bobot' };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const weights: WeightValues = v.model === '4class'
    ? { atasan: v.atasan, peer: v.peer, cross: v.cross, self: v.self }
    : { atasan: v.atasan, internal: v.internal };

  const { data: existing } = await supabase
    .from('weight_schemes').select('id').eq('period_id', ap.id).eq('is_active', true).maybeSingle();

  if (existing) {
    const { error } = await supabase.from('weight_schemes')
      .update({ model: v.model, weights, updated_by: user.id }).eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    const { error } = await supabase.from('weight_schemes')
      .insert({ period_id: ap.id, model: v.model, weights, is_active: true, updated_by: user.id });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  revalidatePath('/admin/bobot');
  return { ok: true };
}
