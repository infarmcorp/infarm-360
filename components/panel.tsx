/**
 * Panel — kartu modul datar (border + radius, TANPA shadow) di atas kanvas ber-tint.
 * Menggantikan pola inline `rounded-2xl border bg-white shadow-sm p-5`. Hanya container modul
 * UTAMA — bukan tiap grup info (kurangi nested card). PanelLabel = judul kecil uppercase.
 */
export function Panel({ children, className = '', padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-panel border border-line bg-surface ${padded ? 'p-6' : ''} ${className}`}>
      {children}
    </section>
  );
}

export function PanelLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint ${className}`}>{children}</div>;
}
