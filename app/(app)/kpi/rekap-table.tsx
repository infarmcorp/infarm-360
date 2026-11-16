'use client';

import { usePager, StableHeight } from '@/components/table-controls';
import { colPercents } from '@/lib/table-cols';
import { playerLabelOf, type PlayerClass, fmt2, NO_SCORE_LABEL, NO_SCORE_TITLE } from '@/lib/scoring';
import { TABLE_HEAD } from '@/components/infarm-ui';

/**
 * Tabel Rekapitulasi Kuartal (klien) — paginasi 5-baris (usePager bersama). Data dihitung
 * di server (RekapView); komponen ini hanya menyajikan + memotong per halaman agar DOM/
 * payload monitoring seluruh pegawai tetap ringan. Pager digambar lokal bergaya Design System
 * Infarm (sama dengan Tabel Hasil Seluruh Pegawai di Dashboard); perilakunya tetap usePager.
 */
export type RekapRow = {
  id: string; name: string; dept: string; is_active: boolean;
  monthly: (number | null)[];
  kpiAvg: number | null; s360: number | null; final: number | null;
  player: PlayerClass | null;
  katText: string; katClass: string;
};

const fmt = (v: number | null) => (v != null ? fmt2(v) : '—');
const PAGER_BTN = 'text-[13px] font-semibold min-h-10 px-3.5 rounded-control bg-neutral-tint text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed';

export function RekapTable({ rows, monthLabels, has360 }: {
  rows: RekapRow[]; monthLabels: string[]; has360: boolean;
}) {
  const { page, setPage, pageCount, shown, total, rangeFrom, rangeTo } = usePager(rows);
  const colCount = monthLabels.length + (has360 ? 4 : 3);

  return (
    <div className="space-y-3">
      <StableHeight>
      <div className="overflow-x-auto">
        {/* table-fixed + colgroup: lebar kolom TETAP antar halaman (tak bergeser saat paging). */}
        <table className="w-full table-fixed table-1line text-left text-[13px]"
          style={{ minWidth: Math.round((200 + monthLabels.length * 76 + 96 + (has360 ? 100 : 0) + 96 + 210) * 0.9) }}>
          <colgroup>
            {colPercents([
              200, // Pegawai + divisi
              ...monthLabels.map(() => 76), // skor bulanan
              96, // Rataan KPI
              has360 && 100, // Hasil 360° ("No Score")
              96, // Skor Akhir
              210, // Kategori (+ · kelas Player)
            ]).map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className={TABLE_HEAD}>
              <th className="py-2.5 px-3 rounded-l-lg">Pegawai</th>
              {monthLabels.map((m, i) => <th key={i} className="py-2.5 px-3 text-center">{m}</th>)}
              <th className="py-2.5 px-3 text-center">Rerata KPI</th>
              {has360 && <th className="py-2.5 px-3 text-center">Hasil 360°</th>}
              <th className="py-2.5 px-3 text-center">Skor Akhir</th>
              <th className="py-2.5 px-3 text-right rounded-r-lg">Kategori</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.length === 0 && (
              <tr><td colSpan={colCount} className="py-6 text-center text-[13px] text-ink-soft">Tidak ada pegawai dalam lingkup Anda.</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="py-3 px-3 break-words">
                  <span className="font-semibold text-ink block">{r.name}</span>
                  <span className="text-xs text-ink-soft">{r.dept}</span>
                </td>
                {r.monthly.map((v, i) => (
                  <td key={i} className="py-3 px-3 text-center font-mono text-ink-soft">{fmt(v)}</td>
                ))}
                <td className="py-3 px-3 text-center font-mono font-semibold text-ink">{fmt(r.kpiAvg)}</td>
                {has360 && <td className="py-3 px-3 text-center font-mono text-ink-soft">{r.s360 != null ? fmt(r.s360) : <span className="text-xs font-semibold text-warn-ink font-sans" title={NO_SCORE_TITLE}>{NO_SCORE_LABEL}</span>}</td>}
                <td className="py-3 px-3 text-center font-mono font-bold text-brand">{fmt(r.final)}</td>
                <td className="py-3 px-3 text-right">
                  <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${r.katClass}`}>
                    {r.katText}{r.player ? ` · ${playerLabelOf(r.player)}` : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-soft font-mono">{rangeFrom}–{rangeTo} / {total} pegawai</span>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))} className={PAGER_BTN}>← Sebelumnya</button>
            <span className="text-xs text-ink-soft font-mono">Hal. {page + 1}/{pageCount}</span>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, page + 1))} className={PAGER_BTN}>Berikutnya →</button>
          </div>
        </div>
      )}
      </StableHeight>
    </div>
  );
}
