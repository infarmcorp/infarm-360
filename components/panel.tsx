/**
 * Panel — kartu modul putih Design System Infarm (garis tepi + sudut 16px + bayangan tipis) di atas kanvas.
 * Menggantikan pola inline `rounded-2xl border bg-white shadow-sm p-5`. Hanya container modul UTAMA — bukan
 * tiap grup info (kurangi nested card). PanelLabel = judul kartu (16px tebal, h3 → Montserrat di `.infarm-ds`).
 */
export function Panel({ children, className = '', padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-card border border-line bg-surface shadow-card ${padded ? 'p-4 sm:p-5' : ''} ${className}`}>
      {children}
    </section>
  );
}

export function PanelLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-base font-bold leading-snug text-ink ${className}`}>{children}</h3>;
}
