import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AssessForm } from './assess-form';

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
    .from('periods').select('id, label').eq('status', 'active').limit(1).maybeSingle();
  if (!ap) return <Notice>Tidak ada periode aktif.</Notice>;

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
        .from('indicators').select('id, aspect_id, text, order_idx, is_active')
        .in('aspect_id', aspects.map((a) => a.id))
        .eq('is_active', true)
        .order('order_idx')
    : { data: [] };
  const indicators = indRows ?? [];

  const { data: qRows } = await supabase
    .from('qualitative_questions').select('id, text, order_idx')
    .eq('period_id', ap.id).order('order_idx');
  const questions = qRows ?? [];

  // Draf yang sudah ada (prefill).
  const { data: existing } = await supabase
    .from('assessments').select('id, status')
    .eq('assessor_id', user.id).eq('target_id', targetId).eq('period_id', ap.id)
    .maybeSingle();

  const initialScores: Record<string, { rating: number | null; comment: string }> = {};
  const initialAnswers: Record<string, string> = {};
  if (existing) {
    const { data: sc } = await supabase
      .from('assessment_indicator_scores').select('indicator_id, rating, comment')
      .eq('assessment_id', existing.id);
    (sc ?? []).forEach((s) => {
      initialScores[s.indicator_id] = { rating: s.rating, comment: s.comment ?? '' };
    });
    const { data: an } = await supabase
      .from('assessment_qual_answers').select('question_id, answer')
      .eq('assessment_id', existing.id);
    (an ?? []).forEach((a) => { initialAnswers[a.question_id] = a.answer ?? ''; });
  }

  const groups = aspects.map((a) => ({
    id: a.id,
    name: a.name,
    indicators: indicators.filter((i) => i.aspect_id === a.id).map((i) => ({ id: i.id, text: i.text })),
  }));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-800">Mulai Nilai</h1>
          <Link href="/penilaian" className="text-xs text-gray-500 hover:underline">← Daftar</Link>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Menilai <span className="font-bold text-gray-700">{target?.name ?? '—'}</span>
          {' '}({target?.dept}) · {mapping.relation} ·{' '}
          <span className={mapping.mandatory ? 'text-rose-600 font-semibold' : 'text-gray-500'}>
            {mapping.mandatory ? 'Wajib' : 'Opsional'}
          </span> · Periode {ap.label}
          {existing?.status === 'submitted' && (
            <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              Sudah terkirim — mengedit akan memperbarui
            </span>
          )}
        </p>

        <AssessForm
          targetId={targetId}
          groups={groups}
          questions={questions.map((q) => ({ id: q.id, text: q.text }))}
          initialScores={initialScores}
          initialAnswers={initialAnswers}
        />
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <p className="text-sm text-gray-600">{children}</p>
        <Link href="/penilaian" className="text-xs text-emerald-700 hover:underline mt-3 inline-block">
          ← Kembali ke Daftar Penilaian Saya
        </Link>
      </div>
    </main>
  );
}
