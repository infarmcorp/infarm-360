import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Empty-state berpandu — dipakai saat sebuah halaman belum punya data (belum ada
 * periode, pemetaan, skor, dst). Alih-alih tabel kosong/teks buntu, tampilkan
 * langkah berikutnya + tombol aksi agar pengguna baru tahu harus berbuat apa.
 * Murni presentasional (server component) — boleh dipakai di server maupun client.
 */
export type EmptyStep = { text: ReactNode; done?: boolean };
export type EmptyAction = { label: string; href: string; primary?: boolean };

export function EmptyState({
  icon = '🚀', title, description, steps, actions, note,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  steps?: EmptyStep[];
  actions?: EmptyAction[];
  note?: ReactNode;
}) {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl shrink-0">
        {icon}
      </div>
      <h2 className="text-base font-extrabold text-gray-800">{title}</h2>
      {description && <p className="text-sm text-gray-500 max-w-md">{description}</p>}

      {steps && steps.length > 0 && (
        <ol className="text-left text-sm text-gray-600 space-y-1.5 mt-1 w-full max-w-md">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                s.done ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {s.done ? '✓' : i + 1}
              </span>
              <span className={s.done ? 'text-gray-500 line-through' : ''}>{s.text}</span>
            </li>
          ))}
        </ol>
      )}

      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {actions.map((a) => (
            <Link
              key={a.href + a.label}
              href={a.href}
              className={a.primary
                ? 'text-xs font-bold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white'
                : 'text-xs font-bold px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50'}
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}

      {note && <p className="text-[11px] text-gray-500 italic mt-1 max-w-md">{note}</p>}
    </div>
  );
}
