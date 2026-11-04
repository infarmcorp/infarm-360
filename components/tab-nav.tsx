import Link from 'next/link';
import { pillCls } from '@/components/infarm-ui';

/*
 * Sub-tab halaman — MODEL SERAGAM seluruh aplikasi, gaya pil Design System Infarm (`pillCls`: aktif hijau
 * solid, lainnya putih bergaris).
 *
 * Pakai untuk navigasi ANTAR-TAMPILAN sebuah halaman (URL `?tab=`). Saklar DI DALAM satu tampilan
 * (mis. Input Manual ↔ Impor Excel) tetap segmented control kecil agar hierarkinya terbaca.
 */
export function TabBar({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto pb-1">{children}</div>;
}

export function Tab({ href, active, icon: Icon, children }: {
  href: string; active: boolean; icon?: React.ElementType; children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${pillCls(active)} shrink-0 whitespace-nowrap`}>
      {Icon && <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-ink-faint'}`} />}
      <span className="inline-flex items-center">{children}</span>
    </Link>
  );
}
