'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { refreshLatePenalties } from '@/lib/late-server';
import { isPastDeadline } from '@/lib/late';

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
  // Fitur N/A (BR-05) DICABUT 2026-09-29 (permintaan HRD — perhitungannya perlu divalidasi dulu):
  // semua indikator wajib rating 1–5 + evidence. Field isNa/naReason dari klien lama diabaikan (Zod strip).
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
    .from('mappings').select('id, mandatory')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId)
    .eq('period_id', ap.id).eq('is_active', true)
    .maybeSingle();
  if (!mapping) return { ok: false, error: 'Anda tidak ditugaskan menilai pegawai ini' };


  const { data: exExisting } = await supabase
    .from('assessments').select('status')
    .eq('assessor_id', auth.user.id).eq('target_id', targetId).eq('period_id', ap.id).maybeSingle();
  // Decision 01 (Screen 01/04): penilaian TERKIRIM hanya bisa diedit sampai deadline; sesudahnya read-only.
  // Yang belum terkirim tetap boleh dikirim sesudah deadline (tercatat Terlambat). DB juga menolak (0047).
  if (exExisting?.status === 'submitted' && isPastDeadline(ap.assessment_deadline)) {
    return { ok: false, error: 'Deadline sudah lewat — penilaian yang sudah terkirim tidak dapat diubah lagi' };
  }
  // Penilaian yang SUDAH terkirim tak boleh turun ke draf: nilainya sudah masuk laporan pegawai yang
  // dinilai. Sebelum deadline pegawai tetap boleh mengedit — lewat "Kirim Ulang" (status tetap 'submitted').
  if (exExisting?.status === 'submitted' && status === 'draft') {
    return { ok: false, error: 'Penilaian ini sudah terkirim — simpan perubahan dengan "Kirim Ulang", bukan Simpan Draf' };
  }

  // Indikator AKTIF & pertanyaan esai periode ini = daftar resmi yang harus dinilai. Audit
  // 2026-09-30: sebelumnya server hanya memeriksa indikator yang IKUT dikirim → kiriman berisi
  // sebagian indikator (atau indikator periode lain) tetap diterima & dihitung "selesai".
  const { data: aspectRows } = await supabase.from('culture_aspects').select('id').eq('period_id', ap.id);
  const aspectIds = (aspectRows ?? []).map((a) => a.id);
  const { data: indRows } = aspectIds.length
    ? await supabase.from('indicators').select('id').in('aspect_id', aspectIds).eq('is_active', true)
    : { data: [] as { id: string }[] };
  const activeInd = new Set((indRows ?? []).map((i) => i.id));
  const { data: quals } = await supabase.from('qualitative_questions').select('id').eq('period_id', ap.id);
  const periodQ = new Set((quals ?? []).map((q) => q.id));

  if (activeInd.size === 0) return { ok: false, error: 'Belum ada indikator aktif pada periode ini' };
  if (scores.some((x) => !activeInd.has(x.indicatorId))) {
    return { ok: false, error: 'Ada indikator yang tidak termasuk periode ini — muat ulang halaman lalu coba lagi' };
  }
  if (answers.some((a) => !periodQ.has(a.questionId))) {
    return { ok: false, error: 'Ada pertanyaan esai yang tidak termasuk periode ini — muat ulang halaman lalu coba lagi' };
  }
  const sanitized = scores;

  // Saat KIRIM: SEMUA indikator aktif wajib rating + evidence (min. 20 karakter, BR-06).
  if (status === 'submitted') {
    const byInd = new Map(sanitized.map((x) => [x.indicatorId, x]));
    if ([...activeInd].some((id) => byInd.get(id)?.rating == null)) {
      return { ok: false, error: 'Lengkapi seluruh rating indikator sebelum mengirim' };
    }
    if ([...activeInd].some((id) => (byInd.get(id)?.comment ?? '').trim().length < 20)) {
      return { ok: false, error: 'Setiap indikator wajib komentar/bukti perilaku (evidence) minimal 20 karakter' };
    }
    // Semua pertanyaan kualitatif (esai) periode ini wajib terisi.
    const answeredQ = new Set(answers.filter((a) => (a.answer ?? '').trim().length > 0).map((a) => a.questionId));
    if ([...periodQ].some((id) => !answeredQ.has(id))) {
      return { ok: false, error: 'Semua pertanyaan kualitatif (esai) wajib diisi sebelum mengirim' };
    }
  }

  // Kiriman PERTAMA ditulis dulu sebagai draf, lalu dinaikkan ke 'submitted' SETELAH skor & esai
  // tersimpan — DB (trigger 0045) memeriksa kelengkapan tepat saat status berubah jadi terkirim.
  // Penilaian yang sudah terkirim tetap 'submitted' (Kirim Ulang).
  const alreadySubmitted = exExisting?.status === 'submitted';
  const headerStatus = alreadySubmitted ? 'submitted' : 'draft';

  // Header assessment (upsert → dapat id).
  const { data: header, error: hErr } = await supabase
    .from('assessments')
    .upsert(
      {
        period_id: ap.id,
        assessor_id: auth.user.id,
        target_id: targetId,
        status: headerStatus,
        // Hanya kosmetik: trigger 0036 menimpa submitted_at & mengisi first_submitted_at dgn
        // waktu SERVER DB (nilai klien diabaikan) — dasar status On Time / Late.
        submitted_at: headerStatus === 'submitted' ? new Date().toISOString() : null,
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
      // Kolom N/A (0039) dipertahankan di DB tapi selalu dikosongkan — fitur dicabut 2026-09-29.
      is_na: false,
      na_reason: null,
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

  if (status === 'submitted' && !alreadySubmitted) {
    const { error: uErr } = await supabase.from('assessments')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', header.id);
    if (uErr) return { ok: false, error: 'Penilaian tersimpan sebagai draf, tapi gagal dikirim: ' + uErr.message };
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
