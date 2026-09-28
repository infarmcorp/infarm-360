'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canAdmin } from '@/lib/auth/roles';
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
  const { data: me } = await supabase.from('employees').select('role, is_hrd_admin').eq('id', user.id).maybeSingle();
  if (!canAdmin(me)) return { ok: false, error: 'Hanya HRD yang dapat mengelola pertanyaan' };
  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  return { ok: true, supabase, periodId: ap.id };
}

type Result = { ok: true } | { ok: false; error: string };
const Text = z.string().trim().min(3, 'Teks terlalu pendek').max(300);
const Desc = z.string().trim().max(500).optional().default('');
// Panduan rating: {"1".."5"} teks per level (opsional). Kosong → tak disimpan.
const Guide = z.record(z.enum(['1', '2', '3', '4', '5']), z.string().trim().max(300)).optional();
// Key point BARS: {"1".."5"} label PENDEK per level (mockup Screen 03) — khusus per indikator.
const KeyPoints = z.record(z.enum(['1', '2', '3', '4', '5']), z.string().trim().max(80)).optional();

/** Normalisasi map level→teks → jsonb {level:teks} hanya untuk level berisi, atau null. */
function normLevelMap(g?: Record<string, string>): Record<string, string> | null {
  if (!g) return null;
  const out: Record<string, string> = {};
  for (const k of ['1', '2', '3', '4', '5']) { const v = (g[k] ?? '').trim(); if (v) out[k] = v; }
  return Object.keys(out).length ? out : null;
}

const AspectName = z.string().trim().min(2, 'Nama aspek terlalu pendek').max(60);

/** Tambah aspek (kelompok indikator) ke periode aktif. Nama unik (case-insensitive). */
export async function addAspect(rawName: string): Promise<Result> {
  const name = AspectName.safeParse(rawName);
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const { data: dup } = await c.supabase.from('culture_aspects')
    .select('id').eq('period_id', c.periodId).ilike('name', name.data).maybeSingle();
  if (dup) return { ok: false, error: `Aspek "${name.data}" sudah ada` };
  const { data: last } = await c.supabase.from('culture_aspects')
    .select('order_idx').eq('period_id', c.periodId).order('order_idx', { ascending: false }).limit(1).maybeSingle();
  const { error } = await c.supabase.from('culture_aspects')
    .insert({ period_id: c.periodId, name: name.data, order_idx: (last?.order_idx ?? -1) + 1 });
  if (error) return { ok: false, error: 'Gagal menambah aspek: ' + error.message };
  await logHrdAction({ action: 'aspect.add', category: 'pertanyaan', summary: `Menambah aspek: "${name.data}"` });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

/** Ubah nama aspek (milik periode aktif). */
export async function renameAspect(aspectId: string, rawName: string): Promise<Result> {
  const name = AspectName.safeParse(rawName);
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  const c = await ctx(); if (!c.ok) return c;
  const { data: own } = await c.supabase.from('culture_aspects').select('id').eq('id', aspectId).eq('period_id', c.periodId).maybeSingle();
  if (!own) return { ok: false, error: 'Aspek tidak ditemukan di periode aktif' };
  const { data: dup } = await c.supabase.from('culture_aspects')
    .select('id').eq('period_id', c.periodId).ilike('name', name.data).neq('id', aspectId).maybeSingle();
  if (dup) return { ok: false, error: `Aspek "${name.data}" sudah ada` };
  const { error } = await c.supabase.from('culture_aspects').update({ name: name.data }).eq('id', aspectId);
  if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };
  await logHrdAction({ action: 'aspect.update', category: 'pertanyaan', summary: `Mengubah nama aspek menjadi: "${name.data}"`, targetType: 'aspect', targetId: aspectId });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

/** Hapus aspek — AMAN: hanya bila belum punya indikator (mencegah cascade ke skor). */
export async function deleteAspect(aspectId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(aspectId).success) return { ok: false, error: 'Input tidak valid' };
  const c = await ctx(); if (!c.ok) return c;
  const { data: own } = await c.supabase.from('culture_aspects').select('id').eq('id', aspectId).eq('period_id', c.periodId).maybeSingle();
  if (!own) return { ok: false, error: 'Aspek tidak ditemukan di periode aktif' };
  const { count } = await c.supabase.from('indicators').select('*', { count: 'exact', head: true }).eq('aspect_id', aspectId);
  if ((count ?? 0) > 0) return { ok: false, error: `Aspek masih punya ${count} indikator — hapus indikatornya dulu.` };
  const { error } = await c.supabase.from('culture_aspects').delete().eq('id', aspectId);
  if (error) return { ok: false, error: 'Gagal menghapus: ' + error.message };
  await logHrdAction({ action: 'aspect.delete', category: 'pertanyaan', summary: 'Menghapus satu aspek (kosong)', targetType: 'aspect', targetId: aspectId });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

/** Geser urutan aspek ke atas/bawah (tukar order_idx dengan tetangganya). */
export async function moveAspect(aspectId: string, dir: 'up' | 'down'): Promise<Result> {
  const c = await ctx(); if (!c.ok) return c;
  const { data: list } = await c.supabase.from('culture_aspects')
    .select('id, order_idx').eq('period_id', c.periodId).order('order_idx');
  const arr = list ?? [];
  const i = arr.findIndex((a) => a.id === aspectId);
  if (i < 0) return { ok: false, error: 'Aspek tidak ditemukan' };
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= arr.length) return { ok: true }; // sudah di ujung — no-op
  const a = arr[i], b = arr[j];
  await c.supabase.from('culture_aspects').update({ order_idx: b.order_idx }).eq('id', a.id);
  await c.supabase.from('culture_aspects').update({ order_idx: a.order_idx }).eq('id', b.id);
  await logHrdAction({ action: 'aspect.reorder', category: 'pertanyaan', summary: 'Mengurutkan ulang aspek', targetType: 'aspect', targetId: aspectId });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
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
    description: desc.data || null, rating_guide: normLevelMap(guide.success ? guide.data : undefined),
  });
  if (error) return { ok: false, error: 'Gagal menambah: ' + error.message };
  await logHrdAction({
    action: 'indicator.add', category: 'pertanyaan',
    summary: `Menambah indikator: "${text.data}"`, targetType: 'aspect', targetId: aspectId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true };
}

export async function updateIndicator(
  indicatorId: string, rawText: string, rawDesc?: string, rawGuide?: Record<string, string>, rawKeyPoints?: Record<string, string>,
): Promise<Result> {
  const text = Text.safeParse(rawText);
  if (!text.success) return { ok: false, error: text.error.issues[0].message };
  const desc = Desc.safeParse(rawDesc ?? '');
  const guide = Guide.safeParse(rawGuide);
  const keyPoints = KeyPoints.safeParse(rawKeyPoints);
  if (!desc.success) return { ok: false, error: 'Deskripsi terlalu panjang' };
  const c = await ctx(); if (!c.ok) return c;
  // Hanya kirim description/rating_guide/rating_key_points bila argumen diberikan (edit
  // panduan), agar edit teks cepat tak menimpa panduan.
  const patch: { text: string; description?: string | null; rating_guide?: Record<string, string> | null; rating_key_points?: Record<string, string> | null } = { text: text.data };
  if (rawDesc !== undefined) patch.description = desc.data || null;
  if (rawGuide !== undefined) patch.rating_guide = normLevelMap(guide.success ? guide.data : undefined);
  if (rawKeyPoints !== undefined) patch.rating_key_points = normLevelMap(keyPoints.success ? keyPoints.data : undefined);
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

/**
 * Salin pertanyaan (aspek + indikator AKTIF + esai) dari periode LAIN ke periode aktif.
 * Aman & idempoten: aspek yang NAMANYA sudah ada di periode aktif DILEWATI (cegah dobel);
 * esai dengan teks identik juga dilewati. Hanya menyalin indikator `is_active`. Skor historis
 * tak tersentuh (indikator baru = baris baru di periode aktif). Pakai service_role utk baca
 * lintas-periode + tulis (HRD sudah diotorisasi via ctx/canAdmin).
 */
export type ImportResult =
  | { ok: true; aspects: number; indicators: number; quals: number; skipped: number }
  | { ok: false; error: string };

export async function importQuestionsFromPeriod(sourcePeriodId: string): Promise<ImportResult> {
  if (!z.string().uuid().safeParse(sourcePeriodId).success) return { ok: false, error: 'Input tidak valid' };
  const c = await ctx(); if (!c.ok) return c;
  if (sourcePeriodId === c.periodId) return { ok: false, error: 'Periode sumber sama dengan periode aktif' };

  const admin = createAdminClient();
  const { data: srcAspects } = await admin.from('culture_aspects')
    .select('id, name, order_idx').eq('period_id', sourcePeriodId).order('order_idx');
  const { data: srcQuals } = await admin.from('qualitative_questions')
    .select('text, order_idx').eq('period_id', sourcePeriodId).order('order_idx');
  if ((srcAspects?.length ?? 0) === 0 && (srcQuals?.length ?? 0) === 0) {
    return { ok: false, error: 'Periode sumber tidak punya pertanyaan untuk disalin' };
  }
  const srcAspectIds = (srcAspects ?? []).map((a) => a.id);
  const { data: srcInds } = srcAspectIds.length
    ? await admin.from('indicators')
        .select('aspect_id, text, order_idx, is_active, description, rating_guide, rating_key_points')
        .in('aspect_id', srcAspectIds).order('order_idx')
    : { data: [] };

  // Aspek yang sudah ada di periode aktif (cegah dobel berdasarkan nama).
  const { data: tgtAspects } = await admin.from('culture_aspects')
    .select('name, order_idx').eq('period_id', c.periodId);
  const tgtNames = new Set((tgtAspects ?? []).map((a) => a.name.trim().toLowerCase()));
  let aspectOrder = Math.max(-1, ...(tgtAspects ?? []).map((a) => a.order_idx));

  let nAspects = 0, nInds = 0, skipped = 0;
  for (const a of srcAspects ?? []) {
    if (tgtNames.has(a.name.trim().toLowerCase())) { skipped++; continue; }
    aspectOrder++;
    const { data: newAsp, error } = await admin.from('culture_aspects')
      .insert({ period_id: c.periodId, name: a.name, order_idx: aspectOrder }).select('id').single();
    if (error || !newAsp) return { ok: false, error: 'Gagal menyalin aspek: ' + (error?.message ?? 'tak diketahui') };
    nAspects++;
    const inds = (srcInds ?? []).filter((i) => i.aspect_id === a.id && i.is_active);
    if (inds.length) {
      const rows = inds.map((i, idx) => ({
        aspect_id: newAsp.id, text: i.text, order_idx: idx, is_active: true,
        description: i.description ?? null, rating_guide: i.rating_guide ?? null, rating_key_points: i.rating_key_points ?? null,
      }));
      const { error: ie } = await admin.from('indicators').insert(rows);
      if (ie) return { ok: false, error: 'Gagal menyalin indikator: ' + ie.message };
      nInds += rows.length;
    }
  }

  // Esai kualitatif (lewati teks yang sudah ada).
  const { data: tgtQuals } = await admin.from('qualitative_questions')
    .select('text, order_idx').eq('period_id', c.periodId);
  const tgtQualTexts = new Set((tgtQuals ?? []).map((q) => q.text.trim().toLowerCase()));
  let qOrder = Math.max(-1, ...(tgtQuals ?? []).map((q) => q.order_idx));
  const newQuals: { period_id: string; text: string; order_idx: number }[] = [];
  for (const q of srcQuals ?? []) {
    if (tgtQualTexts.has(q.text.trim().toLowerCase())) { skipped++; continue; }
    qOrder++;
    newQuals.push({ period_id: c.periodId, text: q.text, order_idx: qOrder });
  }
  if (newQuals.length) {
    const { error: qe } = await admin.from('qualitative_questions').insert(newQuals);
    if (qe) return { ok: false, error: 'Gagal menyalin esai: ' + qe.message };
  }

  await logHrdAction({
    action: 'questions.import', category: 'pertanyaan',
    summary: `Menyalin pertanyaan dari periode lain → ${nAspects} aspek, ${nInds} indikator, ${newQuals.length} esai (${skipped} dilewati karena sudah ada)`,
    targetType: 'period', targetId: sourcePeriodId,
  });
  revalidatePath('/admin/pertanyaan'); revalidatePath('/penilaian');
  return { ok: true, aspects: nAspects, indicators: nInds, quals: newQuals.length, skipped };
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
