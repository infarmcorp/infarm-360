'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';

/**
 * Progress 360 (HRD): pantau kelengkapan pengisian + intervensi.
 *  - forceComplete: tandai penilaian (assessor→target) sebagai 'submitted' walau kosong
 *    (RLS asmt_hrd mengizinkan HRD tulis assessment mana pun). Menghentikan flag pending.
 *  - sendReminder/massReminder: PLACEHOLDER — email belum aktif (menunggu Resend).
 */
type Result = { ok: true; msg?: string } | { ok: false; error: string };

async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false as const, error: 'Hanya HRD yang dapat mengakses Progress 360' };
  return { ok: true as const, userId: user.id };
}

const Id = z.string().uuid();

export async function forceComplete(assessorId: string, targetId: string): Promise<Result> {
  if (!Id.safeParse(assessorId).success || !Id.safeParse(targetId).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { error } = await supabase.from('assessments').upsert(
    { period_id: ap.id, assessor_id: assessorId, target_id: targetId, status: 'submitted', submitted_at: new Date().toISOString() },
    { onConflict: 'period_id,assessor_id,target_id' },
  );
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  await logHrdAction({
    action: 'progress.force_complete', category: 'progress',
    summary: 'Memaksa-selesai satu penilaian 360° (penyesuaian manual)',
    targetType: 'assessment', meta: { assessor_id: assessorId, target_id: targetId },
  });
  revalidatePath('/admin/progress');
  revalidatePath('/admin/kepatuhan');
  return { ok: true, msg: 'Penilaian ditandai selesai.' };
}

/** PLACEHOLDER: pengingat email belum aktif (perlu Resend). Tidak mengirim apa pun. */
export async function sendReminder(assessorId: string): Promise<Result> {
  if (!Id.safeParse(assessorId).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, msg: 'Fitur email pengingat belum aktif (menunggu integrasi Resend).' };
}

export async function massReminder(): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, msg: 'Pengingat massal belum aktif (menunggu integrasi Resend).' };
}
