import { formatWib } from '@/lib/late';

type Group = { id: string; name: string; indicators: { id: string; text: string; ratingKeyPoints?: Record<string, string> | null }[] };

/**
 * Tampilan BACA-SAJA penilaian terkirim setelah deadline (Decision 01, Screen 01 & 04).
 * Server component — tanpa input; ringkasan rating + evidence per indikator & jawaban esai.
 */
export function ReadOnlyView({ groups, questions, scores, answers, deadline }: {
  groups: Group[];
  questions: { id: string; text: string }[];
  scores: Record<string, { rating: number | null; comment: string }>;
  answers: Record<string, string>;
  deadline: string | null;
}) {
  let n = 0;
  return (
    <div className="space-y-4">
      <div className="rounded-panel border border-line bg-neutral-tint p-3.5">
        <p className="text-[13px] font-bold text-ink">Penilaian terkunci — deadline sudah lewat</p>
        <p className="text-[12px] text-ink-soft mt-0.5 leading-relaxed">
          Penilaian ini sudah Anda kirim dan deadline{deadline ? <> (<span className="data-value">{formatWib(deadline)}</span>)</> : null} sudah
          lewat, sehingga jawaban hanya dapat dilihat. Bila ada kekeliruan, hubungi HRD.
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.id} className="rounded-panel border border-line">
          <h2 className="px-4 py-2.5 border-b border-line text-[12.5px] font-bold text-ink bg-neutral-tint rounded-t-panel">{g.name}</h2>
          <ul className="divide-y divide-line-soft">
            {g.indicators.map((ind) => {
              n += 1;
              const s = scores[ind.id];
              const kp = s?.rating != null ? ind.ratingKeyPoints?.[String(s.rating)] : null;
              return (
                <li key={ind.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-semibold text-ink"><span className="data-value text-ink-faint mr-1.5">{n}.</span>{ind.text}</p>
                    <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-control border bg-brand-tint text-brand-ink border-brand-ink/20 whitespace-nowrap">
                      {s?.rating != null ? <>Skor <span className="data-value">{s.rating}</span>{kp ? ` · ${kp}` : ''}</> : 'Belum dinilai'}
                    </span>
                  </div>
                  <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap">{s?.comment?.trim() || '—'}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {questions.length > 0 && (
        <section className="rounded-panel border border-line">
          <h2 className="px-4 py-2.5 border-b border-line text-[12.5px] font-bold text-ink bg-neutral-tint rounded-t-panel">Umpan Balik Kualitatif</h2>
          <ul className="divide-y divide-line-soft">
            {questions.map((q) => (
              <li key={q.id} className="px-4 py-3">
                <p className="text-[13px] font-semibold text-ink">{q.text}</p>
                <p className="text-[12px] text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap">{answers[q.id]?.trim() || '—'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
