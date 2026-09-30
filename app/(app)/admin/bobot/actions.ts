'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canSection } from '@/lib/auth/roles';
import { logHrdAction } from '@/lib/audit/log';
import type { WeightValues } from '@/lib/database.types';

/**
 * Kelola Bobot Penilai (HRD) — atur skema bobot 360 periode aktif.
 *  - 4class: Atasan/Peer/Cross/Self · 2class: Atasan/Internal.
 * Memengaruhi computeResult360 (perlu Hitung Ulang Skor 360 setelah ubah).
 * RLS weight_schemes write = HRD. Indeks unik menjaga 1 skema aktif/periode.
 */
const BaseInput = z.object({
  model: z.enum(['4class', '2class']),
  atasan: z.coerce.number().min(0).max(100),
  peer: z.coerce.number().min(0).max(100),
  cross: z.coerce.number().min(0).max(100),
  bawahan: z.coerce.number().min(0).max(100),
  self: z.coerce.number().min(0).max(100),
  internal: z.coerce.number().min(0).max(100),
});

/**
 * Total bobot kelas yang DIHITUNG wajib tepat 100% (audit 2026-09-29). Self tak ikut (dikecualikan
 * dari Skor 360° resmi). Sebelumnya total bebas & dinormalisasi diam-diam; semua 0 → pegawai
 * hilang dari result_360 tanpa pesan.
 */
const weightTotal = (v: z.infer<typeof BaseInput>): number =>
  v.model === '4class' ? v.atasan + v.peer + v.cross + v.bawahan : v.atasan + v.internal;
const TOTAL_100 = { message: 'Total bobot kelas penilai (tanpa Self) harus tepat 100%' };
const is100 = (v: z.infer<typeof BaseInput>) => Math.abs(weightTotal(v) - 100) < 1e-9;
const Input = BaseInput.refine(is100, TOTAL_100);

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveWeights(raw: unknown): Promise<SaveResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'bobot')) return { ok: false, error: 'Hanya HRD yang dapat mengubah bobot' };

  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const weights: WeightValues = v.model === '4class'
    ? { atasan: v.atasan, peer: v.peer, cross: v.cross, bawahan: v.bawahan, self: v.self }
    : { atasan: v.atasan, internal: v.internal };

  const { data: existing } = await supabase
    .from('weight_schemes').select('id').eq('period_id', ap.id).eq('is_active', true).maybeSingle();

  if (existing) {
    const { error } = await supabase.from('weight_schemes')
      // updated_at eksplisit (default kolom hanya berlaku saat insert) — dipakai Review Hasil Akhir
      // untuk menandai "perlu hitung ulang" bila bobot berubah sesudah Skor 360° terakhir dihitung.
      .update({ model: v.model, weights, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  } else {
    const { error } = await supabase.from('weight_schemes')
      .insert({ period_id: ap.id, model: v.model, weights, is_active: true, updated_by: user.id });
    if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  }

  await logHrdAction({
    action: 'weights.save', category: 'bobot',
    summary: `Mengubah bobot penilai 360° ke Model ${v.model === '4class' ? '4-Kelas' : '2-Kelas'}`,
    targetType: 'period', targetId: ap.id, meta: { model: v.model, weights },
  });
  revalidatePath('/admin/bobot');
  return { ok: true };
}

// ── Bobot KHUSUS per pegawai (override skema periode, migrasi 0031) ─────────────────────────────
const OverrideInput = BaseInput.extend({ employeeId: z.string().uuid() }).refine(is100, TOTAL_100);

/**
 * Simpan bobot KHUSUS untuk seorang pegawai pada periode aktif (upsert per (periode, pegawai)).
 * Berlaku setelah Hitung Ulang Skor 360°. Model bebas (bisa beda dari skema periode). HRD-only.
 */
export async function saveEmployeeWeightOverride(raw: unknown): Promise<SaveResult> {
  const parsed = OverrideInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'bobot')) return { ok: false, error: 'Hanya HRD yang dapat mengubah bobot' };

  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: target } = await supabase.from('employees').select('name').eq('id', v.employeeId).maybeSingle();
  if (!target) return { ok: false, error: 'Pegawai tidak ditemukan' };

  const weights: WeightValues = v.model === '4class'
    ? { atasan: v.atasan, peer: v.peer, cross: v.cross, bawahan: v.bawahan, self: v.self }
    : { atasan: v.atasan, internal: v.internal };

  const { error } = await supabase.from('employee_weight_overrides').upsert(
    { period_id: ap.id, employee_id: v.employeeId, model: v.model, weights, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: 'period_id,employee_id' },
  );
  if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };

  await logHrdAction({
    action: 'weights.override_set', category: 'bobot',
    summary: `Menetapkan bobot 360° khusus (Model ${v.model === '4class' ? '4-Kelas' : '2-Kelas'}) untuk ${target.name ?? v.employeeId}`,
    targetType: 'employee', targetId: v.employeeId, targetLabel: target.name ?? null, meta: { model: v.model, weights },
  });
  revalidatePath('/admin/bobot');
  return { ok: true };
}

/** Hapus bobot khusus seorang pegawai → kembali ke skema default periode. HRD-only. */
export async function removeEmployeeWeightOverride(employeeId: unknown): Promise<SaveResult> {
  const parsed = z.string().uuid().safeParse(employeeId);
  if (!parsed.success) return { ok: false, error: 'Input tidak valid' };
  const id = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin, hrd_sections').eq('id', user.id).maybeSingle();
  if (!canSection(me, 'bobot')) return { ok: false, error: 'Hanya HRD yang dapat mengubah bobot' };

  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: target } = await supabase.from('employees').select('name').eq('id', id).maybeSingle();
  const { error } = await supabase.from('employee_weight_overrides').delete().eq('period_id', ap.id).eq('employee_id', id);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };

  await logHrdAction({
    action: 'weights.override_remove', category: 'bobot',
    summary: `Menghapus bobot 360° khusus untuk ${target?.name ?? id} (kembali ke skema periode)`,
    targetType: 'employee', targetId: id, targetLabel: target?.name ?? null,
  });
  revalidatePath('/admin/bobot');
  return { ok: true };
}
