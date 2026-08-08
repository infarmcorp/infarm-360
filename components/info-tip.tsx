'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip bantuan inline — ikon "ⓘ" kecil yang memunculkan 1 kalimat penjelasan.
 * Aksesibel: muncul saat hover, fokus keyboard, ATAU tap (mobile).
 *
 * POSISI: balon dirender lewat PORTAL ke <body> dengan `position: fixed`, BUKAN absolute di
 * dalam sel tabel. Alasan: InfoTip banyak dipakai di header tabel yang dibungkus
 * `overflow-x-auto` — balon absolute ikut terpotong wadah itu (kalimat terpotong/hilang).
 * Gaya teks juga di-reset (normal-case/whitespace-normal) karena `th` memakai `uppercase`
 * dan sebagian `whitespace-nowrap` yang membuat kalimat jadi satu baris panjang.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const TIP_W = 260; // px — samakan dengan style width balon di bawah

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Tengah terhadap ikon, lalu jepit ke viewport agar tak keluar layar di HP.
    const half = TIP_W / 2;
    const left = Math.min(Math.max(r.left + r.width / 2 - half, 8), window.innerWidth - TIP_W - 8);
    setPos({ top: r.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, place]);

  return (
    <span className="inline-flex items-center align-middle">
      <button
        ref={btnRef}
        type="button"
        aria-label={label ?? 'Penjelasan'}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line-strong text-[9px] font-bold leading-none text-ink-faint hover:border-ink-faint hover:text-ink-soft"
      >
        i
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          id={id}
          style={{ top: pos.top, left: pos.left, width: TIP_W }}
          className="fixed z-50 rounded-panel bg-ink p-2.5 text-[11px] font-normal normal-case leading-snug tracking-normal whitespace-normal break-words text-white shadow-lg"
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
