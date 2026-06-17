'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';

/**
 * Kelola Pertanyaan (HRD): indikator kuantitatif (per aspek) & pertanyaan kualitatif
 * untuk periode aktif. Indikator dinonaktifkan (is_active=false), bukan dihapus, agar
 * skor historis (assessment_indicator_scores) tetap utuh. RLS *_write = HRD.
 */
async function ctx(): Promise<
  { ok: false; error: string } | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; periodId: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };
  const { data: me } = await supabase.from('employees').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'hrd') return { ok: false, error: 'Hanya HRD yang dapat mengelola pertanyaan' };
  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  return { ok: true, supabase, periodId: ap.id };
}

type Result = { ok: true } | { ok: false; error: string };
const Text = z.string().trim().min(3, 'Teks terlalu pendek').max(300);
const Desc = z.string().trim().max(500).optional().default('');
// Panduan rating: {"1".."5"} teks per level (opsional). Kosong → tak disimpan.
const Guide = z.record(z.enum(['1', '2', '3', '4', '5']), z.string().trim().max(300)).optional();

/** Normalisasi panduan rating → jsonb {level:teks} hanya untuk level berisi, atau null. */
function normGuide(g?: Record<string, string>): Record<string, string> | null {
  if (!g) return null;
  const out: Record<string, string> = {};
  for (const k of ['1', '2', '3', '4', '5']) { const v = (g[k] ?? '').trim(); if (v) out[k] = v; }
  return Object.keys(out).length ? out : null;
}

export async function addIndicator(aspectId: string, rawText: string, rawDesc?: string, rawGuide?: Record<string, string>): Promise<Result> {
  const text = Text.safeParse(rawText);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const desc = Desc.safeParse(rawDesc ?? '');
  const guide = Guide.safeParse(rawGuide);
  if (!desc.success) return { ok: false, error: 'Deskripsi terlalu panjang' };
  const c = await ctx(); if (!c.ok) return c;
  // Pastikan aspek milik periode aktif.
  const { data: asp } = await c.supabase.from('culture_aspects').select('id').eq('id', aspectId).eq('period_id', c.periodId).maybeSingle();
  if (!asp) return { ok: false, error: 'Aspek tidak ditemukan di periode aktif' };
  const { data: last } = await c.supabase.from('indicators').select('order_idx').eq('aspect_id', aspectId).order('order_idx', { ascending: false }).limit(1).maybeSingle();
  const { error } = await c.supabase.from('indicators').insert({
    aspect_id: aspectId, text: text.data, order_idx: (last?.order_idx ?? -1) + 1, is_active: true,
    description: desc.data || null, rating_guide: normGuide(guide.success ? guide.data : undefined),
  });
  if (error) return { ok: false, error: 'Gagal menambah: ' + error.message };
  await logHrdAction({
    action: 'indicator.add', category: 'pertanyaan',
    summary: `Menambah indikator: "${text.data}"`, targetType: 'aspect', targetId: aspectId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

export async function updateIndicator(indicatorId: string, rawText: string, rawDesc?: string, rawGuide?: Record<string, string>): Promise<Result> {
  const text = Text.safeParse(rawText);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const desc = Desc.safeParse(rawDesc ?? '');
  const guide = Guide.safeParse(rawGuide);
  if (!desc.success) return { ok: false, error: 'Deskripsi terlalu panjang' };
  const c = await ctx(); if (!c.ok) return c;
  // Hanya kirim description/rating_guide bila argumen diberikan (edit panduan), agar
  // edit teks cepat tak menimpa panduan.
  const patch: { text: string; description?: string | null; rating_guide?: Record<string, string> | null } = { text: text.data };
  if (rawDesc !== undefined) patch.description = desc.data || null;
  if (rawGuide !== undefined) patch.rating_guide = normGuide(guide.success ? guide.data : undefined);
  const { error } = await c.supabase.from('indicators').update(patch).eq('id', indicatorId);
  if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  await logHrdAction({
    action: 'indicator.update', category: 'pertanyaan',
    summary: `Mengubah indikator: "${text.data}"`, targetType: 'indicator', targetId: indicatorId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

export async function toggleIndicator(indicatorId: string, isActive: boolean): Promise<Result> {
  const c = await ctx(); if (!c.ok) return c;
  const { error } = await c.supabase.from('indicators').update({ is_active: isActive }).eq('id', indicatorId);
  if (error) return { ok: false, error: 'Gagal: ' + error.message };
  await logHrdAction({
    action: 'indicator.toggle', category: 'pertanyaan',
    summary: `${isActive ? 'Mengaktifkan' : 'Menonaktifkan'} satu indikator`, targetType: 'indicator', targetId: indicatorId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

/**
 * Hapus indikator (HRD). AMAN: hanya bila BELUM dipakai penilaian mana pun — sebab
 * FK assessment_indicator_scores.indicator_id ON DELETE CASCADE akan menghapus skor
 * historis. Bila sudah ada skor → tolak & sarankan "Nonaktifkan" agar histori utuh.
 */
export async function deleteIndicator(indicatorId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(indicatorId).success) return { ok: false, error: 'Input tidak valid' };
  const c = await ctx(); if (!c.ok) return c;

  const admin = createAdminClient();
  const { count } = await admin.from('assessment_indicator_scores')
    .select('*', { count: 'exact', head: true }).eq('indicator_id', indicatorId);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Indikator sudah dipakai ${count} penilaian — gunakan "Nonaktifkan" agar skor historis tetap utuh.` };
  }

  const { error } = await c.supabase.from('indicators').delete().eq('id', indicatorId);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };
  await logHrdAction({
    action: 'indicator.delete', category: 'pertanyaan',
    summary: 'Menghapus satu indikator (belum dipakai penilaian)', targetType: 'indicator', targetId: indicatorId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

export async function addQualQuestion(rawText: string): Promise<Result> {
  const text = Text.safeParse(rawText);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const { data: last } = await c.supabase.from('qualitative_questions').select('order_idx').eq('period_id', c.periodId).order('order_idx', { ascending: false }).limit(1).maybeSingle();
  const { error } = await c.supabase.from('qualitative_questions').insert({ period_id: c.periodId, text: text.data, order_idx: (last?.order_idx ?? -1) + 1 });
  if (error) return { ok: false, error: 'Gagal menambah: ' + error.message };
  await logHrdAction({
    action: 'qual.add', category: 'pertanyaan',
    summary: `Menambah pertanyaan kualitatif: "${text.data}"`,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

export async function updateQualQuestion(questionId: string, rawText: string): Promise<Result> {
  const text = Text.safeParse(rawText);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const { error } = await c.supabase.from('qualitative_questions').update({ text: text.data }).eq('id', questionId);
  if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  await logHrdAction({
    action: 'qual.update', category: 'pertanyaan',
    summary: `Mengubah pertanyaan kualitatif menjadi: "${text.data}"`, targetType: 'qual_question', targetId: questionId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

export async function deleteQualQuestion(questionId: string): Promise<Result> {
  const c = await ctx(); if (!c.ok) return c;
  const { error } = await c.supabase.from('qualitative_questions').delete().eq('id', questionId);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };
  await logHrdAction({
    action: 'qual.delete', category: 'pertanyaan',
    summary: 'Menghapus satu pertanyaan kualitatif (permanen)', targetType: 'qual_question', targetId: questionId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}
