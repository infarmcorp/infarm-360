'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/**
 * OverflowMenu (⋯) — menampung aksi SEKUNDER/destruktif tabel agar row hanya menyisakan satu
 * primary action yang terlihat. Tutup saat klik-luar / Escape. Presentasional; tiap item memanggil
 * handler yang sudah ada (logic tak berubah).
 */
export type OverflowItem = {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  title?: string;
};

export function OverflowMenu({ items, label = 'Aksi lainnya' }: { items: OverflowItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft hover:border-infarm-light hover:text-brand">
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 min-w-[190px] rounded-xl border border-line bg-surface p-1 shadow-card">
          {items.map((it, i) => (
            <button key={i} type="button" role="menuitem" disabled={it.disabled} title={it.title}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={`block w-full rounded-control px-3 py-2 text-left text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                it.tone === 'danger' ? 'text-danger-ink hover:bg-danger-tint' : 'text-ink-soft hover:bg-infarm-surface hover:text-ink'
              }`}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
