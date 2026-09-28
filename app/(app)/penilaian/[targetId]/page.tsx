import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AssessForm } from './assess-form';
import { ExposureCheckForm } from './exposure-check-form';

/**
 * Form Pengisian 360° untuk satu target (read + prefill draf).
 * Otorisasi: harus ada mapping aktif (user = penilai, target, periode aktif).
 */
export default async function AssessPage({
  params,
}: {
  params: Promise<{ targetId: string }>;
}) {
  const { targetId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ap } = await supabase
    .from('periods').select('id, label, has_360, form_open').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Notice>Tidak ada periode aktif.</Notice>;
  // Komponen 360° belum dibuka HRD → form penilaian tidak tersedia.
  if (!ap.has_360) return <Notice>Penilaian 360° untuk periode ini belum dibuka oleh HRD.</Notice>;
  // Form ditutup HRD (tahap review) — pengisian dihentikan sementara, data lama aman.
  if (!ap.form_open) return <Notice>Form penilaian 360° sedang ditutup HRD (tahap peninjauan hasil). Penilaian yang sudah dikirim tetap tersimpan.</Notice>;

  // Mapping wajib ada (otorisasi + ambil relasi/sifat).
  const { data: mapping } = await supabase
    .from('mappings').select('relation, mandatory')
    .eq('assessor_id', user.id).eq('target_id', targetId)
    .eq('period_id', ap.id).eq('is_active', true)
    .maybeSingle();
  if (!mapping) return <Notice>Anda tidak ditugaskan menilai pegawai ini di periode aktif.</Notice>;

  const { data: target } = await supabase
    .from('employees').select('name, dept').eq('id', targetId).maybeSingle();

  // Aspek → indikator (periode aktif).
  const { data: aspectRows } = await supabase
    .from('culture_aspects').select('id, name, order_idx')
    .eq('period_id', ap.id).order('order_idx');
  const aspects = aspectRows ?? [];

  const { data: indRows } = aspects.length
    ? await supabase
        .from('indicators').select('id, aspect_id, text, order_idx, is_active, description, rating_guide')
        .in('aspect_id', aspects.map((a) => a.id))
        .eq('is_active', true)
        .order('order_idx')
    : { data: [] };
  const indicators = indRows ?? [];

  const { data: qRows } = await supabase
    .from('qualitative_questions').select('id, text, order_idx')
    .eq('period_id', ap.id).order('order_idx');
  const questions = qRows ?? [];

  // Draf yang sudah ada (prefill) + status Exposure Check (BR-03).
  const { data: existing } = await supabase
    .from('assessments').select('id, status, exposure_status, exposure_reason')
    .eq('assessor_id', user.id).eq('target_id', targetId).eq('period_id', ap.id)
    .maybeSingle();

  // BR-03: Not Eligible → penilaian dihentikan, tampilkan notice (bukan form).
  if (existing?.exposure_status === 'not_eligible') {
    return (
      <Notice>
        Anda menandai <strong>Not Eligible</strong> (tidak memiliki exposure kerja yang cukup) untuk menilai
        pegawai ini{existing.exposure_reason ? <> — alasan: <em>&ldquo;{existing.exposure_reason}&rdquo;</em></> : null}.
        Penilaian tidak dilanjutkan, tidak dihitung sebagai tunggakan, dan tidak dikenakan penalty keterlambatan.
        Hubungi HRD bila status ini perlu dikoreksi.
      </Notice>
    );
  }

  const initialScores: Record<string, { rating: number | null; comment: string; isNa: boolean }> = {};
  const initialAnswers: Record<string, string> = {};
  if (existing) {
    const { data: sc } = await supabase
      .from('assessment_indicator_scores').select('indicator_id, rating, comment, is_na')
      .eq('assessment_id', existing.id);
    (sc ?? []).forEach((s) => {
      initialScores[s.indicator_id] = { rating: s.rating, comment: s.comment ?? '', isNa: s.is_na ?? false };
    });
    const { data: an } = await supabase
      .from('assessment_qual_answers').select('question_id, answer')
      .eq('assessment_id', existing.id);
    (an ?? []).forEach((a) => { initialAnswers[a.question_id] = a.answer ?? ''; });
  }

  // Progres penilaian WAJIB user (untuk layar sukses: ingatkan sisa tugas wajib).
  const { data: myMaps } = await supabase
    .from('mappings').select('target_id, mandatory')
    .eq('assessor_id', user.id).eq('period_id', ap.id).eq('is_active', true);
  const mandTargets = (myMaps ?? []).filter((m) => m.mandatory).map((m) => m.target_id);
  const { data: myDone } = mandTargets.length
    ? await supabase.from('assessments').select('target_id')
        .eq('assessor_id', user.id).eq('period_id', ap.id).eq('status', 'submitted').in('target_id', mandTargets)
    : { data: [] };
  const doneSet = new Set((myDone ?? []).map((a) => a.target_id));
  const mandatoryTotal = mandTargets.length;
  const mandatoryDoneOthers = mandTargets.filter((t) => t !== targetId && doneSet.has(t)).length;
  const thisMandatory = !!mapping.mandatory;

  const groups = aspects.map((a) => ({
    id: a.id,
    name: a.name,
    indicators: indicators.filter((i) => i.aspect_id === a.id).map((i) => ({
      id: i.id, text: i.text, description: i.description ?? null, ratingGuide: i.rating_guide ?? null,
    })),
  }));

  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <div className="bg-surface border border-line rounded-panel p-5">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">Mulai Nilai</h1>
          <Link href="/penilaian" className="text-xs text-ink-faint hover:text-ink-soft">← Daftar</Link>
        </div>
        <p className="text-[13.5px] text-ink-soft mb-4">
          Menilai <span className="font-bold text-ink">{target?.name ?? '—'}</span>
          {' '}({target?.dept}) · {mapping.relation} ·{' '}
          <span className={mapping.mandatory ? 'text-warn-ink font-semibold' : 'text-ink-faint'}>
            {mapping.mandatory ? 'Wajib' : 'Opsional'}
          </span> · Periode {ap.label}
          {existing?.status === 'submitted' && (
            <span className="ml-2 text-[10px] font-bold text-brand-ink bg-brand-tint border border-brand-ink/20 px-2 py-0.5 rounded-control">
              Sudah terkirim — mengedit akan memperbarui
            </span>
          )}
        </p>

        {/* BR-03: Exposure Check WAJIB sebelum form muncul, sekali per pasangan penilai→target. */}
        {!existing?.exposure_status ? (
          <ExposureCheckForm key={targetId} targetId={targetId} targetName={target?.name ?? 'pegawai ini'} />
        ) : (
          // key=targetId → form di-MOUNT ULANG tiap ganti target. Tanpa ini, berpindah dari
          // /penilaian/A ke /penilaian/B (tanpa reload) membuat React mempertahankan state
          // (activeGroup/activeId/rating/komentar) target sebelumnya → form bisa terbuka di
          // "Umpan Balik Kualitatif" atau menampilkan jawaban target lama.
          <AssessForm
            key={targetId}
            targetId={targetId}
            targetName={target?.name ?? 'pegawai ini'}
            groups={groups}
            questions={questions.map((q) => ({ id: q.id, text: q.text }))}
            initialScores={initialScores}
            initialAnswers={initialAnswers}
            hasDraft={existing?.status === 'draft'}
            initialStatus={existing?.status ?? null}
            mandatoryTotal={mandatoryTotal}
            mandatoryDoneOthers={mandatoryDoneOthers}
            thisMandatory={thisMandatory}
            partiallyEligible={existing?.exposure_status === 'partially_eligible'}
          />
        )}
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full min-h-full bg-bg px-5 py-7 lg:px-6">
      <div className="bg-surface border border-line rounded-panel p-5">
        <p className="text-sm text-ink-soft">{children}</p>
        <Link href="/penilaian" className="text-xs text-brand-ink hover:underline mt-3 inline-block">
          ← Kembali ke Daftar Penilaian Saya
        </Link>
      </div>
    </main>
  );
}
