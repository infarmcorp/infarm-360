'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitAssessment } from '../actions';

type Group = { id: string; name: string; indicators: { id: string; text: string }[] };
type Question = { id: string; text: string };

export function AssessForm({
  targetId,
  groups,
  questions,
  initialScores,
  initialAnswers,
}: {
  targetId: string;
  groups: Group[];
  questions: Question[];
  initialScores: Record<string, { rating: number | null; comment: string }>;
  initialAnswers: Record<string, string>;
}) {
  const router = useRouter();
  const allIndicators = groups.flatMap((g) => g.indicators);

  const [ratings, setRatings] = useState<Record<string, number | null>>(() => {
    const o: Record<string, number | null> = {};
    allIndicators.forEach((i) => { o[i.id] = initialScores[i.id]?.rating ?? null; });
    return o;
  });
  const [comments, setComments] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    allIndicators.forEach((i) => { o[i.id] = initialScores[i.id]?.comment ?? ''; });
    return o;
  });
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    questions.forEach((q) => { o[q.id] = initialAnswers[q.id] ?? ''; });
    return o;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ratedCount = allIndicators.filter((i) => ratings[i.id] != null).length;
  const allRated = ratedCount === allIndicators.length;

  async function save(status: 'draft' | 'submitted') {
    setBusy(true);
    setError(null);
    const payload = {
      targetId,
      status,
      scores: allIndicators.map((i) => ({
        indicatorId: i.id,
        rating: ratings[i.id] ?? null,
        comment: comments[i.id] ?? '',
      })),
      answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' })),
    };
    const res = await submitAssessment(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    if (status === 'submitted') {
      router.push('/penilaian');
      router.refresh();
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.id}>
          <h2 className="text-sm font-extrabold text-emerald-800 border-b border-emerald-100 pb-1 mb-3">
            {g.name}
          </h2>
          <div className="space-y-4">
            {g.indicators.map((ind) => (
              <div key={ind.id}>
                <p className="text-sm text-gray-700 mb-1.5">{ind.text}</p>
                <div className="flex items-center gap-1.5 mb-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRatings((p) => ({ ...p, [ind.id]: n }))}
                      className={`w-8 h-8 rounded-lg text-sm font-bold border transition-colors ${
                        ratings[ind.id] === n
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-500 border-gray-300 hover:border-emerald-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={comments[ind.id]}
                  onChange={(e) => setComments((p) => ({ ...p, [ind.id]: e.target.value }))}
                  placeholder="Komentar (opsional)"
                  className="w-full text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {questions.length > 0 && (
        <section>
          <h2 className="text-sm font-extrabold text-indigo-800 border-b border-indigo-100 pb-1 mb-3">
            Umpan Balik Kualitatif
          </h2>
          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.id}>
                <p className="text-sm text-gray-700 mb-1.5">{q.text}</p>
                <textarea
                  rows={2}
                  value={answers[q.id]}
                  onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                  placeholder="Jawaban (opsional)"
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-xs text-gray-400">
          {ratedCount}/{allIndicators.length} indikator dinilai
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => save('draft')}
            className="text-sm font-bold px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Simpan Draf
          </button>
          <button
            type="button"
            disabled={busy || !allRated}
            onClick={() => save('submitted')}
            title={allRated ? '' : 'Lengkapi semua rating dulu'}
            className="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
          >
            {busy ? 'Memproses…' : 'Kirim Penilaian 360°'}
          </button>
        </div>
      </div>
    </div>
  );
}
