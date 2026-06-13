'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Punishment kepatuhan (HRD): pengurangan poin per pegawai per periode.
 * Ditulis ke compliance_penalties (RLS penalty_write = HRD). Memotong Skor Akhir
 * (lihat lib/scoring.finalScoreOf) → menjalar ke Dashboard, Review Hasil Akhir, Laporan.
 */
const Input = z.object({
  employeeId: z.string().uuid(),
  points: z.coerce.number().min(0, 'Poin minimal 0').max(100, 'Poin maksimal 100'),
  reason: z.string().trim().max(300).optional().default(''),
});

export type PenaltyResult = { ok: true; points: number } | { ok: false; error: string };

export async function setPenalty(raw: unknown): Promise<PenaltyResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { employeeId, points, reason } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat memberi punishment' };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { error } = await supabase.from('compliance_penalties').upsert(
    { employee_id: employeeId, period_id: ap.id, points, reason: reason || null, set_by: user.id },
    { onConflict: 'employee_id,period_id' },
  );
  if (error) return { ok: false, error: 'Gagal menyimpan punishment: ' + error.message };

  revalidatePath('/admin/kepatuhan');
  revalidatePath('/admin/dashboard');
  revalidatePath('/admin/laporan');
  revalidatePath('/laporan');
  return { ok: true, points };
}
