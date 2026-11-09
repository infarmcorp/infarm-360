import { Sparkles, Star } from 'lucide-react';
import { CARD, CardTitle } from '@/components/infarm-ui';
import { SummaryText } from './summary-text';

/**
 * Tampilan READ-ONLY ringkasan aspek 360° tulisan HRD (lapis 2) — dipakai di jalur
 * SPV (Laporan Kinerja Tim) saat status 'in_review'/'finalized'. Anonim (tak menyebut
 * penilai); SPV tidak bisa mengedit (itu wewenang HRD via AspectSummaryEditor).
 * Hanya menampilkan aspek yang sudah diisi HRD.
 */
export function AspectSummaryView({
  summaries,
  title = 'Evaluasi Aspek Budaya & Perilaku 360°',
  intro = 'Rangkuman evaluasi 360° dari HRD per aspek (anonim, tanpa identitas penilai).',
}: {
  summaries: Record<string, string>;
  title?: string;
  intro?: string;
}) {
  const entries = Object.entries(summaries).filter(([, v]) => v && v.trim());
  if (entries.length === 0) return null;

  return (
    <section className={`${CARD} print:shadow-none mt-4 break-inside-avoid`}>
      <CardTitle icon={Sparkles}>{title}</CardTitle>
      <p className="text-xs text-ink-soft mt-1.5">{intro}</p>
      <div className="mt-3 space-y-3">
        {entries.map(([name, text]) => (
          <div key={name} className="border border-line rounded-control bg-infarm-surface print:bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-line">
              <span className="text-[13px] font-bold text-brand-ink flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 shrink-0" aria-hidden /> {name}
              </span>
            </div>
            <SummaryText text={text} className="text-[13px] p-3 text-ink leading-relaxed" />
          </div>
        ))}
      </div>
    </section>
  );
}
