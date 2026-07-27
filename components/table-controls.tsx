'use client';

import { useMemo, useState } from 'react';

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
