import { formatWib } from '@/lib/late';
import { Note } from '@/components/infarm-ui';
import { StatusChip } from '@/components/status-chip';

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
  // Nomor soal berurutan lintas aspek: nomor awal tiap aspek = jumlah indikator aspek sebelumnya.
  const startNo = groups.map((_, gi) => groups.slice(0, gi).reduce((s, g) => s + g.indicators.length, 0));
  return (
    <div className="space-y-4">
      <Note title="Penilaian terkunci — deadline sudah lewat">
        Penilaian ini sudah Anda kirim dan deadline{deadline ? <> (<span className="data-value">{formatWib(deadline)}</span>)</> : null} sudah
        lewat, sehingga jawaban hanya dapat dilihat. Bila ada kekeliruan, hubungi HRD.
      </Note>

      {groups.map((g, gi) => (
        <section key={g.id} className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
          <h2 className="px-4 py-3 border-b border-line text-base font-bold text-ink bg-infarm-surface">{g.name}</h2>
          <ul className="divide-y divide-line-soft">
            {g.indicators.map((ind, ii) => {
              const n = startNo[gi] + ii + 1;
              const s = scores[ind.id];
              const kp = s?.rating != null ? ind.ratingKeyPoints?.[String(s.rating)] : null;
              return (
                <li key={ind.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-semibold text-ink"><span className="data-value text-ink-faint mr-1.5">{n}.</span>{ind.text}</p>
                    <StatusChip tone={s?.rating != null ? 'brand' : 'neutral'} className="shrink-0 whitespace-nowrap">
                      {s?.rating != null ? <>Skor <span className="data-value">{s.rating}</span>{kp ? ` · ${kp}` : ''}</> : 'Belum dinilai'}
                    </StatusChip>
                  </div>
                  <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap">{s?.comment?.trim() || '—'}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {questions.length > 0 && (
        <section className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
          <h2 className="px-4 py-3 border-b border-line text-base font-bold text-ink bg-infarm-surface">Umpan Balik Kualitatif</h2>
          <ul className="divide-y divide-line-soft">
            {questions.map((q) => (
              <li key={q.id} className="px-4 py-3">
                <p className="text-[13px] font-semibold text-ink">{q.text}</p>
                <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap">{answers[q.id]?.trim() || '—'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
