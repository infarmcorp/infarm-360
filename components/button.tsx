/**
 * Button — 3 varian (Design System Infarm, skala rapat): primary (hijau brand solid, tebal, SATU aksi utama),
 * ghost (putih bergaris, aksi sekunder), danger (teks merah bergaris, aksi destruktif). Tinggi 36px (`md`) /
 * 32px (`sm`), teks 13px. Untuk deretan aksi tabel, sisakan satu primary yang terlihat; aksi lain masuk ke
 * OverflowMenu.
 */
type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export function Button({
  variant = 'primary', size = 'md', className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const sz = size === 'sm' ? 'min-h-8 px-3 text-[13px]' : 'min-h-9 px-4 text-[13px]';
  const base = `inline-flex items-center justify-center gap-1.5 rounded-xl ${sz} transition-colors disabled:opacity-60 disabled:cursor-not-allowed`;
  const v = variant === 'primary'
    ? 'bg-brand text-white font-bold border border-brand hover:bg-brand-ink hover:border-brand-ink'
    : variant === 'danger'
      ? 'bg-surface text-danger-ink font-semibold border border-line hover:border-danger-ink hover:bg-danger-tint'
      : 'bg-surface text-ink-soft font-semibold border border-line hover:text-brand hover:border-infarm-light';
  return <button className={`${base} ${v} ${className}`} {...props} />;
}
