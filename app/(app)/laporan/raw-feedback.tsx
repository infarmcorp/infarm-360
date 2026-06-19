import type { AspectRaw, EssayGroup } from '@/lib/report';

/**
 * Section 5 — RINCIAN KOMENTAR MURNI (RAW FEEDBACK) per Aspek & Indikator (HRD ONLY).
 * Anonim: TIDAK menampilkan nama/identitas penilai. Per aspek → per indikator, dengan
 * akumulasi rating mentah (mis. 4,5,2,3,4,1) + komentar. Esai dikelompokkan per pertanyaan.
 */
const RATING_COLOR = (r: number) =>
  r >= 4 ? 'bg-emerald-100 text-emerald-800' : r === 3 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';

const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function RawFeedback({ byAspect, essays }: { byAspect: AspectRaw[]; essays: EssayGroup[] }) {
  const hasAny = byAspect.some((a) => a.indicators.length > 0) || essays.length > 0;
  return (
    <section className="mt-6 break-inside-avoid">
      <div className="bg-slate-800 text-white rounded-t-xl px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
          📋 Rincian Komentar Murni (Raw Feedback) per Aspek &amp; Indikator
        </h2>
        <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-1 rounded">HRD VIEW</span>
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-xl p-4 space-y-4">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          Umpan balik murni (raw text &amp; rating) dari penilai — anonim, tanpa identitas penilai.
        </p>

        {byAspect.filter((a) => a.indicators.length > 0).map((a) => (
          <div key={a.name} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-indigo-50/60 border-b border-gray-150 flex items-center justify-between">
              <span className="text-xs font-extrabold text-indigo-800 flex items-center gap-1.5">★ {a.name}</span>
              <span className="text-[10px] font-bold text-gray-500 uppercase">{a.indicators.length} indikator</span>
            </div>
            <div className="divide-y divide-gray-100">
              {a.indicators.map((ind) => {
                const m = avg(ind.ratings);
                return (
                  <div key={ind.num} className="p-3">
                    <p className="text-xs font-bold text-gray-800">Pertanyaan #{ind.num} <span className="font-normal text-gray-500">({a.name})</span></p>
                    <p className="text-[11px] italic text-gray-500 mb-1.5">“{ind.text}”</p>
                    {/* Akumulasi rating mentah */}
                    <div className="flex flex-wrap items-center gap-1 mb-1.5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase mr-1">Rating:</span>
                      {ind.ratings.length === 0
                        ? <span className="text-[10px] text-gray-500 italic">belum ada</span>
                        : ind.ratings.map((r, i) => (
                            <span key={i} className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${RATING_COLOR(r)}`}>{r}</span>
                          ))}
                      {m != null && <span className="text-[10px] text-gray-500 ml-1">· rerata <strong>{m.toFixed(1)}</strong> ({ind.ratings.length} penilai)</span>}
                    </div>
                    {/* Komentar mentah (anonim) */}
                    {ind.comments.length > 0 ? (
                      <ul className="space-y-0.5">
                        {ind.comments.map((c, i) => (
                          <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                            <span className="text-gray-300 shrink-0">•</span><span className="italic">“{c}”</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-[10px] text-gray-500 italic">Tidak ada komentar tertulis.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Esai dikelompokkan per pertanyaan */}
        {essays.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-gray-150">
              <span className="text-xs font-extrabold text-slate-700">Jawaban Esai (per Pertanyaan)</span>
            </div>
            <div className="divide-y divide-gray-100">
              {essays.map((e, i) => (
                <div key={i} className="p-3">
                  <p className="text-xs font-bold text-gray-800 mb-1.5">“{e.question}” <span className="font-normal text-gray-500">· {e.answers.length} jawaban</span></p>
                  <ul className="space-y-0.5">
                    {e.answers.map((ans, j) => (
                      <li key={j} className="text-xs text-gray-700 flex gap-1.5">
                        <span className="text-gray-300 shrink-0">•</span><span className="italic">“{ans}”</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasAny && <p className="text-sm text-gray-500">Belum ada umpan balik dari penilai.</p>}
      </div>
    </section>
  );
}
