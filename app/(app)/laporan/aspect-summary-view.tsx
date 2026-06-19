import { Sparkles } from 'lucide-react';

/**
 * Tampilan READ-ONLY ringkasan aspek 360° tulisan HRD (lapis 2) — dipakai di jalur
 * SPV (Laporan Kinerja Tim) saat status 'in_review'/'finalized'. Anonim (tak menyebut
 * penilai); SPV tidak bisa mengedit (itu wewenang HRD via AspectSummaryEditor).
 * Hanya menampilkan aspek yang sudah diisi HRD.
 */
export function AspectSummaryView({ summaries }: { summaries: Record<string, string> }) {
  const entries = Object.entries(summaries).filter(([, v]) => v && v.trim());
  if (entries.length === 0) return null;

  return (
    <section className="mt-6 break-inside-avoid">
      <div className="bg-emerald-700 text-white rounded-t-xl px-4 py-2.5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Evaluasi Aspek Budaya &amp; Perilaku 360°
        </h2>
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-xl p-4 space-y-3">
        <p className="text-[11px] text-gray-500 bg-emerald-50/60 border border-emerald-100 rounded-lg p-2">
          Rangkuman evaluasi 360° dari HRD per aspek (anonim, tanpa identitas penilai).
        </p>
        {entries.map(([name, text]) => (
          <div key={name} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-150">
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">★ {name}</span>
            </div>
            <p className="text-xs p-3 text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
