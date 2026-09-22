'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { refreshLatePenalties } from '@/lib/late-server';

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
  isNa: z.boolean().optional().default(false), // BR-05: N/A — tak punya exposure/evidence cukup
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

  // Periode aktif + komponen 360° harus dibuka (locked/ended → bukan aktif → ditolak).
  const { data: ap } = await supabase
    .from('periods').select('id, has_360, form_open, assessment_deadline').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (!ap.has_360) return { ok: false, error: 'Penilaian 360° untuk periode ini belum dibuka oleh HRD' };
  if (!ap.form_open) return { ok: false, error: 'Form penilaian 360° sedang ditutup HRD (tahap peninjauan hasil)' };

  // Penilai harus ditugaskan menilai target ini (mapping aktif).
  const { data: mapping } = await supabase
    .from('mappings').select('id')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId)
    .eq('period_id', ap.id).eq('is_active', true)
    .maybeSingle();
  if (!mapping) return { ok: false, error: 'Anda tidak ditugaskan menilai pegawai ini' };

  // BR-03: Not Eligible menghentikan penilaian — tak boleh submit sama sekali.
  const { data: exExisting } = await supabase
    .from('assessments').select('exposure_status')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId).eq('period_id', ap.id).maybeSingle();
  if (exExisting?.exposure_status === 'not_eligible') {
    return { ok: false, error: 'Anda menandai Not Eligible untuk pegawai ini — penilaian tidak dilanjutkan' };
  }

  // BR-05: sanitasi — indikator N/A selalu tersimpan rating NULL, apa pun yang dikirim klien.
  const sanitized = scores.map((s) => (s.isNa ? { ...s, rating: null } : s));

  // Saat KIRIM: semua indikator NON-N/A wajib rating + evidence (min. 20 karakter, BR-06).
  // Indikator N/A (BR-05) dikecualikan dari kedua syarat ini & tak wajib evidence.
  if (status === 'submitted') {
    if (sanitized.some((s) => !s.isNa && s.rating === null)) {
      return { ok: false, error: 'Lengkapi seluruh rating indikator (atau tandai N/A) sebelum mengirim' };
    }
    if (sanitized.some((s) => !s.isNa && (s.comment ?? '').trim().length < 20)) {
      return { ok: false, error: 'Setiap indikator (kecuali N/A) wajib komentar/bukti perilaku (evidence) minimal 20 karakter' };
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
        // Hanya kosmetik: trigger 0036 menimpa submitted_at & mengisi first_submitted_at dgn
        // waktu SERVER DB (nilai klien diabaikan) — dasar status On Time / Late.
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
    sanitized.map((s) => ({
      assessment_id: header.id,
      indicator_id: s.indicatorId,
      rating: s.rating,
      comment: s.comment || null,
      is_na: s.isNa,
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

  // Kirim SESUDAH deadline → potongan keterlambatan penilai langsung masuk ke Skor 360°
  // miliknya (bila sudah dihitung). Hanya menyentuh baris penilai sendiri; kegagalan di sini
  // tak membatalkan kiriman (hitung ulang Skor 360° HRD tetap menerapkannya).
  if (status === 'submitted' && ap.assessment_deadline && Date.now() > Date.parse(ap.assessment_deadline)) {
    try { await refreshLatePenalties(ap.id, [auth.user.id]); } catch { /* diterapkan saat hitung ulang */ }
  }

  revalidatePath('/penilaian');
  revalidatePath(`/penilaian/${targetId}`);
  return { ok: true, status };
}

/**
 * BR-03 Exposure Check (Q3 2026). Rater WAJIB memastikan exposure kerja sebelum
 * menilai — ditampilkan sebagai layar pertama di /penilaian/[targetId] selama belum
 * pernah dikonfirmasi. Eligible/Partially Eligible → lanjut ke form penilaian seperti
 * biasa. Not Eligible → penilaian dihentikan (submitAssessment menolaknya, tidak
 * dihitung tunggakan/skor/penalty).
 *
 * TERKUNCI setelah dikonfirmasi — rater tak bisa mengubah sendiri (mencegah
 * "downgrade" status buat menghindari kewajiban). Koreksi lewat HRD menyusul (Tahap 2).
 */
const ExposureInput = z.object({
  targetId: z.string().uuid(),
  status: z.enum(['eligible', 'partially_eligible', 'not_eligible']),
});

export async function setExposureStatus(raw: unknown): Promise<SubmitResult> {
  const parsed = ExposureInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid' };
  const { targetId, status: exposureStatus } = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Sesi berakhir, silakan login ulang' };

  const { data: ap } = await supabase
    .from('periods').select('id, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return { ok: false, error: 'Tidak ada periode aktif' };
  if (!ap.has_360) return { ok: false, error: 'Penilaian 360° untuk periode ini belum dibuka oleh HRD' };
  if (!ap.form_open) return { ok: false, error: 'Form penilaian 360° sedang ditutup HRD (tahap peninjauan hasil)' };

  const { data: mapping } = await supabase
    .from('mappings').select('id')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId)
    .eq('period_id', ap.id).eq('is_active', true)
    .maybeSingle();
  if (!mapping) return { ok: false, error: 'Anda tidak ditugaskan menilai pegawai ini' };

  const { data: existing } = await supabase
    .from('assessments').select('exposure_status')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId).eq('period_id', ap.id).maybeSingle();
  if (existing?.exposure_status) {
    return { ok: false, error: 'Status exposure untuk pegawai ini sudah dikonfirmasi dan terkunci. Hubungi HRD bila perlu koreksi.' };
  }

  const { error } = await supabase.from('assessments').upsert(
    {
      period_id: ap.id, assessor_id: auth.user.id, target_id: targetId,
      exposure_status: exposureStatus, exposure_confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'period_id,assessor_id,target_id' },
  );
  if (error) return { ok: false, error: 'Gagal menyimpan: ' + error.message };

  revalidatePath('/penilaian');
  revalidatePath(`/penilaian/${targetId}`);
  return { ok: true, status: 'draft' };
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
