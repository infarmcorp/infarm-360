import Link from 'next/link';

/**
 * Sub-tab bergaris bawah — MODEL SERAGAM seluruh aplikasi (acuan: Dashboard Organisasi),
 * diterjemahkan ke token redesign (brand/ink/line, bukan emerald/gray mentah).
 *
 * Pakai untuk navigasi ANTAR-TAMPILAN sebuah halaman (URL `?tab=`). Saklar DI DALAM satu
 * tampilan (mis. Input Manual ↔ Impor Excel, Teratas ↔ Terbawah) tetap segmented pill agar
 * hierarkinya terbaca: tab halaman = garis bawah, saklar isi = pill.
 */
export function TabBar({ children }: { children: React.ReactNode }) {
  return <div className="flex border-b border-line gap-1.5 overflow-x-auto">{children}</div>;
}

export function Tab({ href, active, icon: Icon, children }: {
  href: string; active: boolean; icon?: React.ElementType; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-colors shrink-0 ${
        active ? 'border-brand text-brand-ink' : 'border-transparent text-ink-soft hover:text-ink'
      }`}
    >
      {Icon && <Icon className={`w-4 h-4 ${active ? 'text-brand' : 'text-ink-faint'}`} />}
      <span className="inline-flex items-center">{children}</span>
    </Link>
  );
}
