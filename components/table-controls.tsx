'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
    <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
      <button
        onClick={() => setPage(Math.max(0, page - 1))}
        disabled={page === 0}
        className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
      >← Sebelumnya</button>
      <span className="text-center">
        Halaman {page + 1} / {pageCount}
        {total != null && rangeFrom != null && rangeTo != null && (
          <span className="block text-[10px] text-gray-400">{rangeFrom}–{rangeTo} dari {total} {unit}</span>
        )}
      </span>
      <button
        onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
        disabled={page >= pageCount - 1}
        className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
      >Berikutnya →</button>
    </div>
  );
}

export function CheckboxFilter({
  checked, onChange, label, count,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; count?: number;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-indigo-600"
      />
      {label}{count != null && <span className="text-gray-400 font-normal">({count})</span>}
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
        className="flex items-center gap-1.5 text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-600">
        <span className="font-semibold text-gray-700">{label}:</span>
        <span className={selected.size ? 'text-emerald-700 font-bold' : 'text-gray-500'}>{summary}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="text-gray-400"><path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg p-1.5">
          <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-gray-100">
            <button type="button" onClick={() => onChange(new Set(options.map((o) => o.value)))}
              className="text-[10px] font-bold text-emerald-700 hover:underline">Pilih semua</button>
            <button type="button" onClick={() => onChange(new Set())}
              className="text-[10px] font-bold text-gray-500 hover:underline">Bersihkan</button>
          </div>
          {options.length === 0 && <p className="text-[11px] text-gray-400 italic px-2 py-1.5">Tak ada pilihan.</p>}
          {options.map((o) => {
            const on = selected.has(o.value);
            return (
              <label key={o.value} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${on ? 'bg-emerald-50/60' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(o.value)} className="accent-emerald-600" />
                <span className="flex-1 min-w-0 truncate text-gray-800">{o.label}</span>
                {o.count != null && <span className="text-[10px] text-gray-400">{o.count}</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
