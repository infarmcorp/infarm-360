'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export type Option = { value: string; label: string };

/**
 * Dropdown dengan kotak pencarian — pengganti <select> untuk daftar nama panjang.
 * Klik/Enter untuk membuka, ketik untuk menyaring, ↑/↓ untuk menyorot, Enter memilih,
 * Esc menutup. Klik di luar menutup. Beraksesibilitas: role combobox/listbox + ARIA.
 */
export function SearchableSelect({
  value, onChange, options, placeholder = '— pilih —', disabled, className = '',
  searchPlaceholder = 'Cari nama…', ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0); // indeks opsi tersorot (keyboard)
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options;
  }, [q, options]);

  // Reset sorotan saat hasil filter berubah / dibuka.
  useEffect(() => { setActive(0); }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Gulir opsi tersorot ke tampilan.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(opt: Option) {
    onChange(opt.value);
    setOpen(false);
    setQ('');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  const activeId = open && filtered[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`w-full flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={selected ? '' : 'text-gray-500'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-white sticky top-0">
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden="true" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-label={ariaLabel ?? searchPlaceholder}
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
          </div>
          <div ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-500 italic">Tidak ada yang cocok.</div>}
            {filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                id={`${listId}-opt-${i}`}
                data-idx={i}
                role="option"
                aria-selected={o.value === value}
                onClick={() => choose(o)}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  i === active ? 'bg-emerald-50' : ''
                } ${o.value === value ? 'font-bold text-emerald-900' : 'text-gray-700'} hover:bg-emerald-50`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
