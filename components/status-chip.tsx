/**
 * StatusChip — pil status soft-tint (bg pucat + teks warna), BUKAN solid fill. Untuk status
 * periode/laporan/dsb. Warna dari design token (Design System Infarm: pil bulat, 11px tebal).
 */
type Tone = 'neutral' | 'brand' | 'warn' | 'danger';

export function StatusChip({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  const map: Record<Tone, string> = {
    neutral: 'bg-neutral-tint text-ink-soft',
    brand: 'bg-brand-tint text-brand-ink',
    warn: 'bg-warn-tint text-warn-ink',
    danger: 'bg-danger-tint text-danger-ink',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5 whitespace-nowrap ${map[tone]} ${className}`}>
      {children}
    </span>
  );
}
