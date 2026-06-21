/**
 * Logo Infarm — memuat berkas gambar resmi dari `public/logo.png`.
 * Taruh berkas logo di `public/logo.png` (Next.js menyajikan folder public/ di root `/`).
 * Ukuran diatur lewat `className` (mis. w-9 h-9); object-contain agar rasio terjaga.
 */
export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Logo Infarm" className={`object-contain ${className}`} />
  );
}
