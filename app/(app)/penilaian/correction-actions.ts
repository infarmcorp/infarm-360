'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Minta Koreksi Garis Hubungan: penilai (assessor) mengajukan revisi relasi terhadap
 * seorang target di periode aktif → divalidasi HRD (di Pemetaan). RLS corr_insert
 * mensyaratkan assessor_id = auth.uid().
 */
type Result = { ok: true } | { ok: false; error: string };
const REL = z.enum(['Atasan', 'Peer', 'Cross', 'Bawahan']);
const Reason = z.string().trim().min(5, 'Alasan minimal 5 karakter').max(500);

export async function requestCorrection(
  mappingId: string, targetId: string, oldRelation: string, rawNew: string, rawReason: string,
): Promise<Result> {
  const nr = REL.safeParse(rawNew);
  if (!nr.success) return { ok: false, error: 'Relasi baru tidak valid' };
  const reason = Reason.safeParse(rawReason);
  if (!reason.success) return { ok: false, error: reason.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const { data: ap } = await supabase.from('periods').select('id, has_360').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (!ap.has_360) return { ok: false, error: 'Penilaian 360° untuk periode ini belum dibuka oleh HRD' };

  // Verifikasi mapping milik penilai ini (otorisasi tambahan selain RLS).
  const { data: map } = await supabase
    .from('mappings').select('id, relation').eq('id', mappingId).eq('assessor_id', user.id).eq('target_id', targetId).maybeSingle();
  if (!map) return { ok: false, error: 'Mapping tidak ditemukan / bukan milik Anda' };

  // Tolak bila sudah ada permohonan pending untuk pasangan ini.
  const { data: existing } = await supabase
    .from('relation_correction_requests').select('id')
    .eq('assessor_id', user.id).eq('target_id', targetId).eq('period_id', ap.id).eq('status', 'pending').maybeSingle();
  if (existing) return { ok: false, error: 'Sudah ada permohonan yang menunggu untuk rekan ini' };

  const { error } = await supabase.from('relation_correction_requests').insert({
    mapping_id: mappingId, period_id: ap.id, assessor_id: user.id, target_id: targetId,
    old_relation: map.relation, new_relation: nr.data, reason: reason.data, status: 'pending',
  });
  if (error) return { ok: false, error: 'Gagal mengirim: ' + error.message };

  revalidatePath('/penilaian');
  revalidatePath('/admin/pemetaan');
  return { ok: true };
}
