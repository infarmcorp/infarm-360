/**
 * Logo Infarm — memuat lambang resmi dari `public/infarm-logo-symbol.png`
 * (hasil crop dari `infarm-id-logo.png`, tanpa wordmark "INFARM.ID").
 * Taruh berkas logo di folder `public/` (Next.js menyajikannya di root `/`).
 * Ukuran diatur lewat `className` (mis. w-9 h-9); object-contain agar rasio terjaga.
 */
export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/infarm-logo-symbol.png" alt="Logo Infarm" className={`object-contain ${className}`} />
  );
}
