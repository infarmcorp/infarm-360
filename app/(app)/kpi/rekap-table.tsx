'use client';

import { usePager, Pager } from '@/components/table-controls';
import { playerLabelOf, type PlayerClass, fmt2 } from '@/lib/scoring';

/**
 * Tabel Rekapitulasi Kuartal (klien) — paginasi 5-baris (komponen bersama). Data dihitung
 * di server (RekapView); komponen ini hanya menyajikan + memotong per halaman agar DOM/
 * payload monitoring seluruh pegawai tetap ringan.
 */
export type RekapRow = {
  id: string; name: string; dept: string; is_active: boolean;
  monthly: (number | null)[];
  kpiAvg: number | null; s360: number | null; final: number | null;
  player: PlayerClass | null;
  katText: string; katClass: string;
};

const fmt = (v: number | null) => (v != null ? fmt2(v) : '—');

export function RekapTable({ rows, monthLabels, has360 }: {
  rows: RekapRow[]; monthLabels: string[]; has360: boolean;
}) {
  const { page, setPage, pageCount, shown, total, rangeFrom, rangeTo } = usePager(rows);
  const colCount = monthLabels.length + (has360 ? 4 : 3);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[640px]">
          <thead>
            <tr className="bg-neutral-tint border-b border-line text-[10px] uppercase tracking-[0.05em] text-ink-faint font-semibold">
              <th className="py-2.5 px-3">Pegawai</th>
              {monthLabels.map((m, i) => <th key={i} className="py-2.5 px-3 text-center">{m}</th>)}
              <th className="py-2.5 px-3 text-center">Rataan KPI</th>
              {has360 && <th className="py-2.5 px-3 text-center">Hasil 360°</th>}
              <th className="py-2.5 px-3 text-center">Skor Akhir</th>
              <th className="py-2.5 px-3 text-right">Kategori</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.length === 0 && (
              <tr><td colSpan={colCount} className="py-6 text-center text-ink-faint italic">Tidak ada pegawai dalam lingkup Anda.</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-tint/40">
                <td className="py-3 px-3">
                  <span className="font-bold text-ink block">{r.name}</span>
                  <span className="text-[10px] text-ink-faint">{r.dept}</span>
                </td>
                {r.monthly.map((v, i) => (
                  <td key={i} className="py-3 px-3 text-center data-value text-ink-faint">{fmt(v)}</td>
                ))}
                <td className="py-3 px-3 text-center data-value font-bold text-brand-ink">{fmt(r.kpiAvg)}</td>
                {has360 && <td className="py-3 px-3 text-center data-value font-bold text-ink-soft">{fmt(r.s360)}</td>}
                <td className="py-3 px-3 text-center data-value font-bold text-ink text-sm">{fmt(r.final)}</td>
                <td className={`py-3 px-3 text-right font-bold ${r.katClass}`}>{r.katText}{r.player ? ` · ${playerLabelOf(r.player)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />
    </div>
  );
}
