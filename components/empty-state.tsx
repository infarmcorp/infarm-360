import Link from 'next/link';
import type { ReactNode } from 'react';
import { Check, Inbox } from 'lucide-react';
import { renderIcon } from '@/components/emoji-icon';

/**
 * Empty-state berpandu — dipakai saat sebuah halaman belum punya data (belum ada
 * periode, pemetaan, skor, dst). Alih-alih tabel kosong/teks buntu, tampilkan
 * langkah berikutnya + tombol aksi agar pengguna baru tahu harus berbuat apa.
 * Murni presentasional (server component) — boleh dipakai di server maupun client.
 *
 * `icon`: pemanggil lama mengisi emoji (📊 🗓️ …) — dipetakan ke ikon lucide (emoji-icon.tsx), jadi emoji tak
 * pernah tampil (Design System Infarm). Elemen React juga diterima.
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
    <div className="bg-surface border border-dashed border-line-strong rounded-card p-6 sm:p-8 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-brand-tint text-brand flex items-center justify-center shrink-0">
        {renderIcon(icon, Inbox, 'w-6 h-6')}
      </div>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {description && <p className="text-[13px] text-ink-soft max-w-md leading-relaxed">{description}</p>}

      {steps && steps.length > 0 && (
        <ol className="text-left text-[13px] text-ink-soft space-y-1.5 mt-1 w-full max-w-md">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold font-mono ${
                s.done ? 'bg-brand text-white' : 'bg-neutral-tint text-ink-soft'
              }`}>
                {s.done ? <Check className="w-3 h-3" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className={s.done ? 'text-ink-faint line-through' : 'text-ink'}>{s.text}</span>
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
                ? 'inline-flex items-center justify-center min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white text-[13px] font-bold transition-colors'
                : 'inline-flex items-center justify-center min-h-9 px-4 rounded-xl border border-line bg-surface text-ink-soft text-[13px] font-semibold hover:text-brand hover:border-infarm-light transition-colors'}
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}

      {note && <p className="text-xs text-ink-soft italic mt-1 max-w-md">{note}</p>}
    </div>
  );
}
