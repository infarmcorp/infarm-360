/**
 * Judul pengelompok section untuk Monitor Kinerja — memisahkan halaman jadi zona berhierarki
 * (makro → mikro): Ringkasan → Komposisi → Arah → Rincian per Pegawai. Aksen warna tipis + garis
 * pemisah atas untuk kejelasan visual. Presentasional.
 */
const TONE: Record<string, string> = {
  emerald: '#059669', indigo: '#4f46e5', amber: '#d97706', slate: '#64748b',
};

export function SectionHeader({ label, hint, tone = 'slate' }: { label: string; hint?: string; tone?: keyof typeof TONE }) {
  return (
    <div className="mt-6 mb-3 flex items-center gap-2 border-t border-gray-100 pt-4">
      <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: TONE[tone] }} />
      <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-600">{label}</h2>
      {hint && <span className="text-[11px] text-gray-400">· {hint}</span>}
    </div>
  );
}
