'use client';

import { useId, useState } from 'react';

/**
 * Tooltip bantuan inline — ikon "ⓘ" kecil yang memunculkan 1 kalimat penjelasan.
 * Aksesibel: muncul saat hover, fokus keyboard, ATAU tap (mobile). Teks di-reset ke gaya
 * normal (normal-case/tracking) agar terbaca meski dipasang di header tabel uppercase.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex items-center align-middle">
      <button
        type="button"
        aria-label={label ?? 'Penjelasan'}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-gray-300 text-[9px] font-bold leading-none text-gray-400 hover:border-gray-400 hover:text-gray-600"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-lg bg-gray-900 p-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
