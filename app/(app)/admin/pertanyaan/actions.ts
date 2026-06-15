'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
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

export async function addIndicator(aspectId: string, rawText: string): Promise<Result> {
  const text = Text.safeParse(rawText);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  // Pastikan aspek milik periode aktif.
  const { data: asp } = await c.supabase.from('culture_aspects').select('id').eq('id', aspectId).eq('period_id', c.periodId).maybeSingle();
  if (!asp) return { ok: false, error: 'Aspek tidak ditemukan di periode aktif' };
  const { data: last } = await c.supabase.from('indicators').select('order_idx').eq('aspect_id', aspectId).order('order_idx', { ascending: false }).limit(1).maybeSingle();
  const { error } = await c.supabase.from('indicators').insert({ aspect_id: aspectId, text: text.data, order_idx: (last?.order_idx ?? -1) + 1, is_active: true });
  if (error) return { ok: false, error: 'Gagal menambah: ' + error.message };
  await logHrdAction({
    action: 'indicator.add', category: 'pertanyaan',
    summary: `Menambah indikator: "${text.data}"`, targetType: 'aspect', targetId: aspectId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

export async function updateIndicator(indicatorId: string, rawText: string): Promise<Result> {
  const text = Text.safeParse(rawText);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const { error } = await c.supabase.from('indicators').update({ text: text.data }).eq('id', indicatorId);
  if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  await logHrdAction({
    action: 'indicator.update', category: 'pertanyaan',
    summary: `Mengubah teks indikator menjadi: "${text.data}"`, targetType: 'indicator', targetId: indicatorId,
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
