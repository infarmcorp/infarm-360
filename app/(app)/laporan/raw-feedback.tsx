import type { AspectRaw, EssayGroup } from '@/lib/report';

/**
 * Section 5 — RINCIAN KOMENTAR MURNI (RAW FEEDBACK) per Aspek & Indikator (HRD ONLY).
 * Anonim: TIDAK menampilkan nama/identitas penilai. Per aspek → per indikator, dengan
 * akumulasi rating mentah (mis. 4,5,2,3,4,1) + komentar. Esai dikelompokkan per pertanyaan.
 */
const RATING_COLOR = (r: number) =>
  r >= 4 ? 'bg-brand-tint text-brand-ink' : r === 3 ? 'bg-warn-tint text-warn-ink' : 'bg-danger-tint text-danger-ink';

const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function RawFeedback({ byAspect, essays, badge = 'HRD VIEW' }: { byAspect: AspectRaw[]; essays: EssayGroup[]; badge?: string }) {
  const hasAny = byAspect.some((a) => a.indicators.length > 0) || essays.length > 0;
  return (
    <section className="mt-6 break-inside-avoid">
      <div className="bg-sidebar text-white rounded-t-panel px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
          📋 Rincian Komentar Murni (Raw Feedback) per Aspek &amp; Indikator
        </h2>
        <span className="text-[10px] font-black bg-brand text-white px-2 py-1 rounded-control">{badge}</span>
      </div>
      <div className="border border-t-0 border-line rounded-b-panel p-4 space-y-4">
        <p className="text-[10px] uppercase tracking-wider text-ink-faint font-bold">
          Raw text &amp; rating
        </p>

        {byAspect.filter((a) => a.indicators.length > 0).map((a) => (
          <div key={a.name} className="border border-line rounded-panel overflow-hidden">
            <div className="px-3 py-2 bg-brand-tint/60 border-b border-line-soft flex items-center justify-between">
              <span className="text-xs font-extrabold text-brand-ink flex items-center gap-1.5">★ {a.name}</span>
              <span className="text-[10px] font-bold text-ink-faint uppercase">{a.indicators.length} indikator</span>
            </div>
            <div className="divide-y divide-line-soft">
              {a.indicators.map((ind) => {
                const m = avg(ind.ratings);
                return (
                  <div key={ind.num} className="p-3">
                    <p className="text-xs font-bold text-ink">Pertanyaan #{ind.num} <span className="font-normal text-ink-faint">({a.name})</span></p>
                    <p className="text-[11px] italic text-ink-faint mb-1.5">“{ind.text}”</p>
                    {/* Akumulasi rating mentah */}
                    <div className="flex flex-wrap items-center gap-1 mb-1.5">
                      <span className="text-[10px] font-bold text-ink-faint uppercase mr-1">Rating:</span>
                      {ind.ratings.length === 0
                        ? <span className="text-[10px] text-ink-faint italic">belum ada</span>
                        : ind.ratings.map((r, i) => (
                            <span key={i} className={`text-[10px] data-value font-bold px-1.5 py-0.5 rounded-control ${RATING_COLOR(r)}`}>{r}</span>
                          ))}
                      {m != null && <span className="text-[10px] text-ink-faint ml-1">· rerata <strong>{m.toFixed(2)}</strong> ({ind.ratings.length} penilai)</span>}
                    </div>
                    {/* Komentar mentah (anonim) */}
                    {ind.comments.length > 0 ? (
                      <ul className="space-y-0.5">
                        {ind.comments.map((c, i) => (
                          <li key={i} className="text-xs text-ink-soft flex gap-1.5">
                            <span className="text-ink-faint/50 shrink-0">•</span><span className="italic">“{c}”</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-[10px] text-ink-faint italic">Tidak ada komentar tertulis.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Esai dikelompokkan per pertanyaan */}
        {essays.length > 0 && (
          <div className="border border-line rounded-panel overflow-hidden">
            <div className="px-3 py-2 bg-neutral-tint border-b border-line-soft">
              <span className="text-xs font-extrabold text-ink">Jawaban Esai (per Pertanyaan)</span>
            </div>
            <div className="divide-y divide-line-soft">
              {essays.map((e, i) => (
                <div key={i} className="p-3">
                  <p className="text-xs font-bold text-ink mb-1.5">“{e.question}” <span className="font-normal text-ink-faint">· {e.answers.length} jawaban</span></p>
                  <ul className="space-y-0.5">
                    {e.answers.map((ans, j) => (
                      <li key={j} className="text-xs text-ink-soft flex gap-1.5">
                        <span className="text-ink-faint/50 shrink-0">•</span><span className="italic">“{ans}”</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasAny && <p className="text-sm text-ink-soft">Belum ada umpan balik dari penilai.</p>}
      </div>
    </section>
  );
}
