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

  // Saat KIRIM, semua indikator wajib diberi rating.
  if (status === 'submitted' && scores.some((s) => s.rating === null)) {
    return { ok: false, error: 'Lengkapi seluruh rating indikator sebelum mengirim' };
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
