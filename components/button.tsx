/**
 * Button — 3 varian: primary (brand solid, SATU aksi utama), ghost (border, aksi sekunder),
 * danger (teks merah, aksi destruktif). Warna dari design token. Untuk deretan aksi tabel,
 * sisakan satu primary yang terlihat; aksi lain masuk ke OverflowMenu.
 */
type Variant = 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary', className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-control font-semibold text-sm px-4 py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
  const v = variant === 'primary'
    ? 'bg-brand text-white hover:bg-brand-ink'
    : variant === 'danger'
      ? 'bg-transparent text-danger-ink border border-line hover:border-danger-ink'
      : 'bg-transparent text-ink-soft border border-line hover:text-ink hover:border-line-strong';
  return <button className={`${base} ${v} ${className}`} {...props} />;
}
