import { Sparkles } from 'lucide-react';

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
    <section className="mt-6 break-inside-avoid">
      <div className="bg-brand text-white rounded-t-panel px-4 py-2.5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> {title}
        </h2>
      </div>
      <div className="border border-t-0 border-line rounded-b-panel p-4 space-y-3">
        <p className="text-[11px] text-ink-soft bg-brand-tint/60 border border-brand-ink/15 rounded-control p-2">
          {intro}
        </p>
        {entries.map(([name, text]) => (
          <div key={name} className="border border-line rounded-panel overflow-hidden">
            <div className="px-3 py-2 bg-neutral-tint border-b border-line-soft">
              <span className="text-xs font-bold text-brand-ink flex items-center gap-1.5">★ {name}</span>
            </div>
            <p className="text-xs p-3 text-ink-soft leading-relaxed whitespace-pre-wrap">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
