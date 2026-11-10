import { ClipboardList, Star } from 'lucide-react';
import { fmt2 } from '@/lib/scoring';
import type { AspectRaw, EssayGroup, RawEntry } from '@/lib/report';
import { TABLE_HEAD } from '@/components/infarm-ui';

/**
 * Section 5 — RINCIAN KOMENTAR MURNI (RAW FEEDBACK) per Aspek & Indikator.
 * Anonim: TIDAK menampilkan nama/identitas penilai. Per aspek → per indikator, tabel pasangan
 * Rating | Komentar per penilai (urut rating) untuk kalibrasi. Esai dikelompokkan per pertanyaan.
 * Laporan pelanggaran (dulu Catatan di Luar Pemetaan) TIDAK tampil di sini sejak 2026-11-10 — pindah ke
 * halaman HRD "Laporan Pelanggaran".
 */
const sortEntries = (xs: RawEntry[]) =>
  [...xs].sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99)); // tanpa rating → paling bawah

const RATING_COLOR = (r: number) =>
  r >= 4 ? 'bg-brand-tint text-brand-ink' : r === 3 ? 'bg-warn-tint text-warn-ink' : 'bg-danger-tint text-danger-ink';

const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function RawFeedback({ byAspect, essays, badge = 'HRD VIEW' }: { byAspect: AspectRaw[]; essays: EssayGroup[]; badge?: string }) {
  const hasAny = byAspect.some((a) => a.indicators.length > 0) || essays.length > 0;
  return (
    <section className="mt-4 break-inside-avoid bg-surface border border-line rounded-card shadow-card print:shadow-none overflow-hidden">
      {/* Pita gelap di layar; saat cetak putih bergaris (warna latar tak dijamin ikut tercetak). */}
      <div className="bg-infarm-dark text-white print:bg-white print:text-ink print:border-b print:border-line px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.04em] flex items-center gap-2">
          <ClipboardList className="w-4 h-4 shrink-0" aria-hidden />
          Rincian Komentar Murni (Raw Feedback) per Aspek &amp; Indikator
        </h2>
        <span className="text-[10px] font-bold bg-brand text-white print:bg-white print:text-brand-ink print:border print:border-brand px-2 py-1 rounded-control">{badge}</span>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-xs uppercase tracking-[0.08em] text-ink-soft font-bold">
          Raw text &amp; rating
        </p>

        {byAspect.filter((a) => a.indicators.length > 0).map((a) => (
          <div key={a.name} className="border border-line rounded-control overflow-hidden">
            <div className="px-3 py-2 bg-brand-tint border-b border-line flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-brand-ink flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 shrink-0" aria-hidden /> {a.name}
              </span>
              {a.indicators.length > 0 && (
                <span className="text-xs font-semibold text-ink-soft"><span className="data-value">{a.indicators.length}</span> indikator</span>
              )}
            </div>
            <div className="divide-y divide-line">
              {a.indicators.map((ind) => {
                const m = avg(ind.ratings);
                return (
                  <div key={ind.num} className="p-3">
                    <p className="text-[13px] font-bold text-ink">Pertanyaan #<span className="data-value">{ind.num}</span> <span className="font-normal text-ink-soft">({a.name})</span></p>
                    <p className="text-xs italic text-ink-soft mb-1.5">“{ind.text}”</p>
                    <p className="text-xs text-ink-soft mb-2">
                      {m != null
                        ? <>Rerata <strong className="data-value text-ink">{fmt2(m)}</strong> · <span className="data-value">{ind.ratings.length}</span> penilai</>
                        : <span className="italic">Belum ada rating</span>}
                    </p>
                    {/* Pasangan rating-komentar per penilai (anonim), urut rating terendah → tertinggi
                        untuk kalibrasi rating vs evidence. */}
                    {ind.entries.length > 0 && (
                      <table className="w-full text-[13px] border border-line rounded-control overflow-hidden">
                        <thead>
                          <tr className={`${TABLE_HEAD} print:bg-white`}>
                            <th className="text-left px-2.5 py-1.5 w-16">Rating</th>
                            <th className="text-left px-2.5 py-1.5">Komentar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {sortEntries(ind.entries).map((e, i) => (
                            <tr key={i} className="align-top">
                              <td className="px-2.5 py-1.5">
                                {e.rating != null
                                  ? <span className={`text-xs data-value font-bold px-1.5 py-0.5 rounded-control ${RATING_COLOR(e.rating)}`}>{e.rating}</span>
                                  : <span className="text-xs text-ink-faint">—</span>}
                              </td>
                              <td className="px-2.5 py-1.5 text-ink">
                                {e.comment
                                  ? <span className="italic">“{e.comment}”</span>
                                  : <span className="text-xs text-ink-faint italic">tanpa komentar</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Esai dikelompokkan per pertanyaan */}
        {essays.length > 0 && (
          <div className="border border-line rounded-control overflow-hidden">
            <div className="px-3 py-2 bg-infarm-surface print:bg-white border-b border-line">
              <span className="text-[13px] font-bold text-ink">Jawaban Esai (per Pertanyaan)</span>
            </div>
            <div className="divide-y divide-line">
              {essays.map((e, i) => (
                <div key={i} className="p-3">
                  <p className="text-[13px] font-bold text-ink mb-1.5">“{e.question}” <span className="font-normal text-ink-soft">· <span className="data-value">{e.answers.length}</span> jawaban</span></p>
                  <ul className="space-y-0.5 list-disc pl-4 marker:text-ink-faint">
                    {e.answers.map((ans, j) => (
                      <li key={j} className="text-[13px] text-ink"><span className="italic">“{ans}”</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasAny && <p className="text-[13px] text-ink-soft">Belum ada umpan balik dari penilai.</p>}
      </div>
    </section>
  );
}
