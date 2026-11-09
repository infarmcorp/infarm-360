'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// Tombol pager (Design System Infarm): putih bergaris, tinggi 36px, sudut membulat.
const PAGER_BTN = 'inline-flex items-center gap-1 min-h-9 px-3 rounded-xl border border-line bg-surface text-[13px] text-ink-soft font-semibold transition-colors hover:text-brand hover:border-infarm-light disabled:opacity-40 disabled:pointer-events-none';

/**
 * Kontrol tabel bersama — fondasi paginasi 5-baris & filter checkbox yang dipakai
 * lintas halaman (Bobot, Monitoring, Progress, Kepatuhan, Suksesi, Review, dll).
 * Tujuan: satu perilaku pager/filter konsisten, bukan tiap tabel meng-copy state sendiri.
 *
 *  - usePager(items, pageSize=5): kelola state halaman + potong slice; auto-clamp saat
 *    daftar menyusut (mis. setelah filter) supaya tak "halaman kosong".
 *  - <Pager>: bilah Sebelumnya/Berikutnya + indikator "Halaman x / y" (sembunyi bila 1 hal).
 *  - <CheckboxFilter>: satu toggle checkbox bergaya seragam (reset ke hal 1 di pemanggil).
 */
export const DEFAULT_PAGE_SIZE = 5;

export function usePager<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const cur = Math.min(page, pageCount - 1); // clamp: daftar bisa menyusut (filter/hapus)
  const shown = useMemo(
    () => items.slice(cur * pageSize, cur * pageSize + pageSize),
    [items, cur, pageSize],
  );
  const rangeFrom = items.length === 0 ? 0 : cur * pageSize + 1;
  const rangeTo = Math.min(items.length, cur * pageSize + pageSize);
  return { page: cur, setPage, pageCount, shown, total: items.length, rangeFrom, rangeTo };
}

export function Pager({
  page, pageCount, setPage, total, rangeFrom, rangeTo, unit = 'baris',
}: {
  page: number; pageCount: number; setPage: (n: number) => void;
  total?: number; rangeFrom?: number; rangeTo?: number; unit?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    // mt-auto: di dalam StableHeight pager menempel di dasar bingkai (posisinya tetap).
    <div className="mt-auto flex items-center justify-between gap-2 text-[13px] text-ink-soft">
      <button
        onClick={() => setPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className={PAGER_BTN}
      ><ChevronLeft className="w-4 h-4" aria-hidden /> Sebelumnya</button>
      <span className="text-center">
        Halaman <span className="font-mono font-semibold text-ink">{page + 1} / {pageCount}</span>
        {total != null && rangeFrom != null && rangeTo != null && (
          <span className="block text-[11px] text-ink-soft font-mono">{rangeFrom}–{rangeTo} dari {total} {unit}</span>
        )}
      </span>
      <button
        onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
        disabled={page >= pageCount - 1}
        className={PAGER_BTN}
      >Berikutnya <ChevronRight className="w-4 h-4" aria-hidden /></button>
    </div>
  );
}

/**
 * Bingkai tabel/daftar berpager yang TINGGINYA TETAP: tinggi hanya boleh naik (dicatat dari tinggi
 * terbesar yang pernah tampil), jadi halaman terakhir yang barisnya lebih sedikit, hasil filter yang
 * menyusut, atau pager yang hilang tak membuat konten di bawahnya melompat. Letakkan tabel lalu
 * <Pager> di dalamnya — pager menempel di dasar bingkai. Diukur ulang dari nol bila LEBAR bingkai
 * berubah (jendela diubah ukurannya) atau `resetKey` berubah (mis. ganti periode).
 *
 * Sekaligus: sel yang terpotong "…" oleh kelas `.table-1line` diberi tooltip teks lengkap saat disorot.
 */
export function StableHeight({ children, className = 'gap-3', resetKey }: {
  children: React.ReactNode; className?: string; resetKey?: string | number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let max = 0;
    let width = el.clientWidth;
    el.style.minHeight = '';
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; max = 0; el.style.minHeight = ''; }
      const h = el.offsetHeight;
      if (h > max) { max = h; el.style.minHeight = `${h}px`; }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [resetKey]);

  // Tooltip teks lengkap untuk isi sel yang terpotong (dicek saat disorot, bukan tiap render).
  const onMouseOver = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.table-1line td')) return;
    for (let n: HTMLElement | null = target; n && n !== ref.current; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 1) {
        if (!n.title || n.dataset.autoTitle) { n.title = n.textContent?.trim() ?? ''; n.dataset.autoTitle = '1'; }
        return;
      }
      if (n.dataset.autoTitle) { n.removeAttribute('title'); delete n.dataset.autoTitle; }
      if (n.tagName === 'TD') return;
    }
  };

  return <div ref={ref} onMouseOver={onMouseOver} className={`flex flex-col ${className}`}>{children}</div>;
}

export function CheckboxFilter({
  checked, onChange, label, count,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; count?: number;
}) {
  return (
    <label className="flex items-center gap-1.5 min-h-9 text-xs font-semibold text-ink-soft cursor-pointer select-none hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-brand"
      />
      {label}{count != null && <span className="text-ink-faint font-normal font-mono">({count})</span>}
    </label>
  );
}

export type MultiCheckOption = { value: string; label: string; count?: number };

/**
 * Filter MULTI-PILIH lewat klik centang (dropdown checklist) — pengganti dropdown "pilih satu".
 * Pola sama dengan pemilih pegawai di Manajemen Akses: tombol menampilkan ringkasan pilihan,
 * klik membuka panel berisi daftar centang + "Pilih semua" / "Bersihkan".
 *
 * Konvensi lingkup: `selected` KOSONG = TANPA saring (semua tampil). Pemanggil menyaring dengan
 * `selected.size === 0 || selected.has(nilai)`. "Bersihkan" & "Pilih semua" sama-sama berarti
 * "semua tampil" (endpoint identik) — sengaja, agar logika pemanggil tetap satu baris.
 */
export function MultiCheckFilter({
  label, options, selected, onChange,
}: {
  label: string;
  options: MultiCheckOption[];
  selected: Set<string>;            // kosong = semua
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Tutup saat klik di luar panel.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(next);
  };
  const summary = selected.size === 0 ? 'Semua' : `${selected.size} dipilih`;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 min-h-9 text-[13px] px-3 border rounded-control bg-infarm-surface transition-colors focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint ${
          open ? 'border-brand' : 'border-line hover:border-line-strong'}`}>
        <span className="font-semibold text-ink-soft">{label}:</span>
        <span className={selected.size ? 'text-brand-ink font-bold' : 'text-ink'}>{summary}</span>
        <ChevronDown className="w-3.5 h-3.5 text-ink-faint" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface shadow-card p-1.5">
          <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-line-soft">
            <button type="button" onClick={() => onChange(new Set(options.map((o) => o.value)))}
              className="text-[11px] font-bold text-brand-ink hover:underline">Pilih semua</button>
            <button type="button" onClick={() => onChange(new Set())}
              className="text-[11px] font-bold text-ink-soft hover:underline">Bersihkan</button>
          </div>
          {options.length === 0 && <p className="text-xs text-ink-soft italic px-2 py-1.5">Tak ada pilihan.</p>}
          {options.map((o) => {
            const on = selected.has(o.value);
            return (
              <label key={o.value} className={`flex items-center gap-2 px-2 py-1.5 rounded-control cursor-pointer text-[13px] ${on ? 'bg-brand-tint' : 'hover:bg-infarm-surface'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(o.value)} className="accent-brand" />
                <span className="flex-1 min-w-0 truncate text-ink">{o.label}</span>
                {o.count != null && <span className="text-[11px] text-ink-faint font-mono">{o.count}</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
