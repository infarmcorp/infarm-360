'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Pemetaan (Mapping) penilai→target untuk periode aktif (HRD).
 * Menentukan "Daftar Penilaian Saya" tiap pegawai + relasi (kelas bobot) + sifat
 * Wajib/Opsional (dasar Flag Kepatuhan). RLS map_write = HRD.
 */
async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false as const, error: 'Hanya HRD yang dapat mengelola pemetaan' };
  return { ok: true as const };
}

const CreateInput = z.object({
  assessorId: z.string().uuid(),
  targetId: z.string().uuid(),
  relation: z.enum(['Atasan', 'Peer', 'Cross', 'Self', 'Bawahan']),
  mandatory: z.boolean(),
});

type Result = { ok: true } | { ok: false; error: string };

export async function createMapping(raw: unknown): Promise<Result> {
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { assessorId, targetId, relation, mandatory } = parsed.data;
  if (assessorId === targetId && relation !== 'Self') {
    return { ok: false, error: 'Penilai = target hanya boleh untuk relasi Self' };
  }

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { error } = await supabase.from('mappings')
    .insert({ period_id: ap.id, assessor_id: assessorId, target_id: targetId, relation, mandatory, is_active: true });
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Pasangan penilai→target ini sudah ada' : 'Gagal: ' + error.message };
  }
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true };
}

export async function deleteMapping(mappingId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('mappings').delete().eq('id', mappingId);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true };
}
