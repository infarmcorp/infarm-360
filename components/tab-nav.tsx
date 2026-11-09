import Link from 'next/link';

/*
 * Sub-tab halaman — MODEL SERAGAM seluruh aplikasi, gaya TAB MAP (pemilik 2026-11-06): tab aktif putih menyatu
 * dengan lembar `TabPanel` di bawahnya. Kapsul (`pillCls`) khusus PILIHAN/FILTER di dalam satu tampilan, agar
 * sub-tab tak terbaca sebagai filter.
 *
 * Pakai untuk navigasi ANTAR-TAMPILAN sebuah halaman: `Tab` (URL `?tab=`) atau `TabButton` (state klien). Selalu
 * bungkus `TabBar` + `TabPanel` dalam satu elemen agar tak terpisah oleh `space-y-*` induknya.
 */
const tabCls = (active: boolean) =>
  `inline-flex items-center gap-2 shrink-0 whitespace-nowrap min-h-9 px-3.5 py-2 text-[13px] rounded-t-xl border border-b-0 transition-colors ${
    active ? 'bg-surface border-line text-brand-ink font-bold' : 'border-transparent text-ink-soft font-semibold hover:text-ink'}`;

/** Garis bawah = bayangan dalam (bukan border), sehingga tertutup tab aktif dan tak terpotong `overflow-x-auto`. */
export function TabBar({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-0.5 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]">{children}</div>;
}

export function Tab({ href, active, icon: Icon, children }: {
  href: string; active: boolean; icon?: React.ElementType; children: React.ReactNode;
}) {
  return (
    <Link href={href} prefetch={false} className={tabCls(active)}>
      {Icon && <Icon className="w-4 h-4" aria-hidden />}
      {children}
    </Link>
  );
}

export function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon?: React.ElementType; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={tabCls(active)}>
      {Icon && <Icon className="w-4 h-4" aria-hidden />}
      {children}
    </button>
  );
}

/** Lembar putih isi tab; garis atasnya milik `TabBar`. */
export function TabPanel({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`bg-surface border border-t-0 border-line rounded-b-card p-3 sm:p-4 min-w-0 ${className}`}>{children}</div>;
}
