'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Pengisian 360° (semua peran sebagai penilai). PANDUAN: "Mulai Nilai".
 *
 * Keamanan (jangan dilemahkan):
 *  - Otorisasi nyata di RLS `assessments`/`assessment_*` (assessor = auth.uid() & periode aktif).
 *  - Verifikasi mapping di sini = pastikan penilai memang ditugaskan + pesan ramah.
 *  - Periode terkunci ditolak server-side (RLS asmt_write juga cek status='active').
 */
const ScoreItem = z.object({
  indicatorId: z.string().uuid(),
  rating: z.number().int().min(1).max(5).nullable(),
  comment: z.string().trim().max(1000).optional().default(''),
});
const AnswerItem = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().max(2000).optional().default(''),
});
const SubmitInput = z.object({
  targetId: z.string().uuid(),
  status: z.enum(['draft', 'submitted']),
  scores: z.array(ScoreItem).min(1),
  answers: z.array(AnswerItem),
});

export type SubmitResult = { ok: true; status: 'draft' | 'submitted' } | { ok: false; error: string };

export async function submitAssessment(raw: unknown): Promise<SubmitResult> {
  const parsed = SubmitInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  }
  const { targetId, status, scores, answers } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  // Periode aktif.
  const { data: ap } = await supabase
    .from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  // Penilai harus ditugaskan menilai target ini (mapping aktif).
  const { data: mapping } = await supabase
    .from('mappings').select('id')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId)
    .eq('period_id', ap.id).eq('is_active', true)
    .maybeSingle();
  if (!mapping) return { ok: false, error: 'Anda tidak ditugaskan menilai pegawai ini' };

  // Saat KIRIM: semua indikator wajib rating + komentar/bukti perilaku (min. 4 karakter).
  if (status === 'submitted') {
    if (scores.some((s) => s.rating === null)) {
      return { ok: false, error: 'Lengkapi seluruh rating indikator sebelum mengirim' };
    }
    if (scores.some((s) => (s.comment ?? '').trim().length < 4)) {
      return { ok: false, error: 'Setiap indikator wajib komentar/bukti perilaku minimal 4 karakter' };
    }
    // Semua pertanyaan kualitatif (esai) periode ini wajib terisi.
    const { data: quals } = await supabase
      .from('qualitative_questions').select('id').eq('period_id', ap.id);
    const answeredQ = new Set(answers.filter((a) => (a.answer ?? '').trim().length > 0).map((a) => a.questionId));
    if ((quals ?? []).some((q) => !answeredQ.has(q.id))) {
      return { ok: false, error: 'Semua pertanyaan kualitatif (esai) wajib diisi sebelum mengirim' };
    }
  }

  // Header assessment (upsert → dapat id).
  const { data: header, error: hErr } = await supabase
    .from('assessments')
    .upsert(
      {
        period_id: ap.id,
        assessor_id: auth.user.id,
        target_id: targetId,
        status,
        submitted_at: status === 'submitted' ? new Date().toISOString() : null,
      },
      { onConflict: 'period_id,assessor_id,target_id' },
    )
    .select('id')
    .single();
  if (hErr || !header) {
    return { ok: false, error: 'Gagal menyimpan penilaian: ' + (hErr?.message ?? 'tak diketahui') };
  }

  // Skor per indikator + jawaban kualitatif.
  const { error: sErr } = await supabase.from('assessment_indicator_scores').upsert(
    scores.map((s) => ({
      assessment_id: header.id,
      indicator_id: s.indicatorId,
      rating: s.rating,
      comment: s.comment || null,
    })),
    { onConflict: 'assessment_id,indicator_id' },
  );
  if (sErr) return { ok: false, error: 'Gagal menyimpan skor: ' + sErr.message };

  if (answers.length) {
    const { error: aErr } = await supabase.from('assessment_qual_answers').upsert(
      answers.map((a) => ({
        assessment_id: header.id,
        question_id: a.questionId,
        answer: a.answer || null,
      })),
      { onConflict: 'assessment_id,question_id' },
    );
    if (aErr) return { ok: false, error: 'Gagal menyimpan jawaban esai: ' + aErr.message };
  }

  revalidatePath('/penilaian');
  revalidatePath(`/penilaian/${targetId}`);
  return { ok: true, status };
}

/**
 * Buang Draf 360° (PANDUAN legacy: "Batalkan Pengisian"). Menghapus assessment DRAF
 * milik penilai untuk target di periode aktif — skor & jawaban ikut terhapus (FK
 * on delete cascade). Penilaian yang SUDAH terkirim tak bisa dibuang dari sini.
 * RLS asmt_write membatasi delete ke assessor sendiri + periode aktif.
 */
export async function discardAssessment(targetId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(targetId).success) return { ok: false, error: 'Input tidak valid' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const { data: ap } = await supabase.from('periods').select('id').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };

  const { data: ex } = await supabase.from('assessments').select('id, status')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId).eq('period_id', ap.id).maybeSingle();
  if (!ex) return { ok: false, error: 'Tidak ada draf untuk dibuang' };
  if (ex.status !== 'draft') return { ok: false, error: 'Penilaian sudah terkirim — tidak bisa dibuang dari sini' };

  const { error } = await supabase.from('assessments').delete().eq('id', ex.id);
  if (error) return { ok: false, error: 'Gagal membuang draf: ' + error.message };

  revalidatePath('/penilaian');
  revalidatePath(`/penilaian/${targetId}`);
  return { ok: true };
}
