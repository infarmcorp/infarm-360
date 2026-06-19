'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';

/**
 * Pemetaan (Mapping) penilai→target untuk periode aktif (HRD).
 * Menentukan "Daftar Penilaian Saya" tiap pegawai + relasi (kelas bobot) + sifat
 * Wajib/Opsional (dasar Flag Kepatuhan). RLS map_write = HRD.
 */
async function requireHrd(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false as const, error: 'Hanya HRD yang dapat mengelola pemetaan' };
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
  await logHrdAction({
    action: 'mapping.create', category: 'pemetaan',
    summary: `Menambah pemetaan penilai→target (relasi ${relation}, ${mandatory ? 'Wajib' : 'Opsional'})`,
    targetType: 'mapping', meta: { assessor_id: assessorId, target_id: targetId, relation, mandatory },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true };
}

const BulkRow = z.object({
  assessorId: z.string().uuid(),
  targetId: z.string().uuid(),
  relation: z.enum(['Atasan', 'Peer', 'Cross', 'Self', 'Bawahan']),
  mandatory: z.boolean(),
});

/** Impor mapping massal (HRD) dari Excel/CSV. Lewati baris Self yang penilai≠target & duplikat. */
export async function createMappingsBulk(rawRows: unknown): Promise<{ ok: true; saved: number; skipped: number } | { ok: false; error: string }> {
  const parsed = z.array(BulkRow).min(1).safeParse(rawRows);
  if (!parsed.success) return { ok: false, error: 'Data impor tidak valid' };

  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const rows = parsed.data.filter((r) => !(r.assessorId === r.targetId && r.relation !== 'Self'));
  if (rows.length === 0) return { ok: false, error: 'Tidak ada baris valid (penilai=target hanya untuk Self)' };

  const { error, count } = await supabase.from('mappings').upsert(
    rows.map((r) => ({ period_id: ap.id, assessor_id: r.assessorId, target_id: r.targetId, relation: r.relation, mandatory: r.mandatory, is_active: true })),
    { onConflict: 'period_id,assessor_id,target_id', ignoreDuplicates: true, count: 'exact' },
  );
  if (error) return { ok: false, error: 'Gagal mengimpor: ' + error.message };

  await logHrdAction({
    action: 'mapping.import', category: 'pemetaan',
    summary: `Impor massal pemetaan: ${count ?? rows.length} tersimpan, ${parsed.data.length - rows.length} dilewati`,
    targetType: 'mapping', meta: { saved: count ?? rows.length, skipped: parsed.data.length - rows.length },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true, saved: count ?? rows.length, skipped: parsed.data.length - rows.length };
}

/**
 * Salin SEMUA pemetaan dari periode lain ke periode AKTIF (HRD). Berguna saat ganti
 * periode: tak perlu input ulang. Hasil salinan = baris mapping biasa → tetap bisa
 * diedit/dihapus. Duplikat (pasangan penilai→target yang sudah ada) dilewati.
 */
export async function copyMappingsFromPeriod(sourcePeriodId: string): Promise<{ ok: true; saved: number; skipped: number } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(sourcePeriodId).success) return { ok: false, error: 'Periode sumber tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: ap } = await supabase.from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (sourcePeriodId === ap.id) return { ok: false, error: 'Periode sumber sama dengan periode aktif' };

  const { data: src } = await supabase.from('mappings')
    .select('assessor_id, target_id, relation, mandatory').eq('period_id', sourcePeriodId).eq('is_active', true);
  if (!src || src.length === 0) return { ok: false, error: 'Periode sumber tidak memiliki pemetaan untuk disalin' };

  const { error, count } = await supabase.from('mappings').upsert(
    src.map((m) => ({ period_id: ap.id, assessor_id: m.assessor_id, target_id: m.target_id, relation: m.relation, mandatory: m.mandatory, is_active: true })),
    { onConflict: 'period_id,assessor_id,target_id', ignoreDuplicates: true, count: 'exact' },
  );
  if (error) return { ok: false, error: 'Gagal menyalin: ' + error.message };
  const saved = count ?? src.length;

  const { data: srcP } = await supabase.from('periods').select('label').eq('id', sourcePeriodId).maybeSingle();
  await logHrdAction({
    action: 'mapping.copy', category: 'pemetaan',
    summary: `Menyalin ${saved} pemetaan dari periode "${srcP?.label ?? sourcePeriodId}" ke "${ap.label}"`,
    targetType: 'period', targetId: ap.id, meta: { source: sourcePeriodId, saved, total: src.length },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true, saved, skipped: src.length - saved };
}

export async function deleteMapping(mappingId: string): Promise<Result> {
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { error } = await supabase.from('mappings').delete().eq('id', mappingId);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };
  await logHrdAction({
    action: 'mapping.delete', category: 'pemetaan',
    summary: 'Menghapus satu pemetaan penilai→target',
    targetType: 'mapping', targetId: mappingId,
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true };
}

/**
 * Tinjau permohonan koreksi relasi (HRD). Setuju → perbarui relasi mapping terkait
 * ke new_relation + tandai approved; Tolak → tandai rejected. RLS corr_review = HRD.
 */
export async function reviewCorrection(requestId: string, decision: 'approved' | 'rejected'): Promise<Result> {
  if (decision !== 'approved' && decision !== 'rejected') return { ok: false, error: 'Keputusan tidak valid' };
  const supabase = await createClient();
  const auth = await requireHrd(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { data: { user } } = await supabase.auth.getUser();

  const { data: req } = await supabase
    .from('relation_correction_requests')
    .select('id, mapping_id, assessor_id, target_id, period_id, new_relation, status')
    .eq('id', requestId).maybeSingle();
  if (!req) return { ok: false, error: 'Permohonan tidak ditemukan' };
  if (req.status !== 'pending') return { ok: false, error: 'Permohonan sudah diproses' };

  if (decision === 'approved' && req.new_relation) {
    // Perbarui relasi mapping (berdasarkan mapping_id, atau pasangan penilai→target).
    const q = supabase.from('mappings').update({ relation: req.new_relation });
    const upd = req.mapping_id
      ? await q.eq('id', req.mapping_id)
      : await q.eq('assessor_id', req.assessor_id).eq('target_id', req.target_id).eq('period_id', req.period_id);
    if (upd.error) return { ok: false, error: 'Gagal memperbarui mapping: ' + upd.error.message };
  }

  const { error } = await supabase.from('relation_correction_requests')
    .update({ status: decision, reviewed_by: user?.id ?? null }).eq('id', requestId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };

  await logHrdAction({
    action: 'correction.review', category: 'pemetaan',
    summary: `${decision === 'approved' ? 'Menyetujui' : 'Menolak'} permohonan koreksi garis hubungan`,
    targetType: 'correction_request', targetId: requestId,
    meta: { decision, new_relation: req.new_relation ?? null },
  });
  revalidatePath('/admin/pemetaan');
  revalidatePath('/penilaian');
  return { ok: true };
}
