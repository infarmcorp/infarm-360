'use client';

import { useMemo, useState } from 'react';
import { heatColor, HEAT_LEGEND_GRADIENT } from '@/lib/score-color';
import { displayName } from '@/lib/employee-name';

export type HeatCol = { key: string; label: string; full?: string; group?: string };
export type HeatRow = { id: string; name: string; nickname?: string | null; dept: string; cells: Record<string, number | null> };

// Lebar seragam tiap kolom heatmap (px) — header & sel dipatok sama agar semua kolom sejajar.
const CELL_W = 92;

/**
 * Heatmap PER-PEGAWAI (aspek atau indikator 360°) — tiap baris = 1 pegawai, tiap kolom = aspek/
 * indikator, sel diwarnai skor 0–100 dengan palet terpadu `heatColor` + legenda gradien — SAMA
 * dengan heatmap Dashboard Organisasi (Capaian KPI/Divisi). Untuk lingkup besar (HRD, >50 pegawai):
 * pencarian nama + paginasi; kolom **Terlemah/Terkuat** di kanan menyebut aspek/indikator terendah &
 * tertinggi tiap orang. Presentasional; skor dihitung di server (rumus 360° resmi).
 */
export function PerEmployeeHeatmap({
  title, subtitle, columns, rows, pageSize = 5,
}: { title: string; subtitle?: string; columns: HeatCol[]; rows: HeatRow[]; pageSize?: number }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => `${r.name} ${r.nickname ?? ''} ${r.dept}`.toLowerCase().includes(t));
  }, [q, rows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // Header grup (aspek) untuk heatmap indikator — segmen berurutan kolom dgn group sama.
  const hasGroups = columns.some((c) => c.group);
  const groups: { label: string; span: number }[] = [];
  if (hasGroups) {
    for (const c of columns) {
      const g = c.group ?? '';
      const last = groups[groups.length - 1];
      if (last && last.label === g) last.span += 1; else groups.push({ label: g, span: 1 });
    }
  }
  const colFull = (key?: string) => { const c = columns.find((x) => x.key === key); return c ? (c.full ?? c.label) : '—'; };
  const extremes = (r: HeatRow) => {
    let min: { key: string; v: number } | null = null, max: { key: string; v: number } | null = null;
    for (const c of columns) {
      const v = r.cells[c.key]; if (v == null) continue;
      if (!min || v < min.v) min = { key: c.key, v };
      if (!max || v > max.v) max = { key: c.key, v };
    }
    return { min, max };
  };

  if (rows.length === 0 || columns.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs mb-4">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">{title}</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
            <span>Rendah</span>
            <span className="h-2.5 w-24 rounded-full" style={{ background: HEAT_LEGEND_GRADIENT }} />
            <span>Tinggi</span>
          </div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama…"
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg w-36 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
        </div>
      </div>
      {subtitle && <p className="text-xs text-gray-500 mb-4">{subtitle}</p>}
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs">
          <thead>
            {hasGroups && (
              <tr>
                <th className="sticky left-0 bg-white z-10" />
                {groups.map((g, i) => (
                  <th key={`${g.label}-${i}`} colSpan={g.span} title={g.label}
                    className="px-1 py-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-500 text-center break-words leading-tight">{g.label}</th>
                ))}
                <th colSpan={2} />
              </tr>
            )}
            <tr>
              <th className="sticky left-0 bg-white z-10 text-left py-2 px-3 text-[10px] font-extrabold uppercase tracking-wider text-gray-500">Pegawai</th>
              {columns.map((c) => (
                <th key={c.key} title={c.full ?? c.label}
                  className="py-2 px-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-500 align-bottom" style={{ width: CELL_W, minWidth: CELL_W, maxWidth: CELL_W }}>
                  <div className="break-words leading-tight normal-case">{c.label}</div>
                </th>
              ))}
              <th className="py-2 pl-8 pr-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-rose-600 whitespace-nowrap">Terlemah</th>
              <th className="py-2 px-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 whitespace-nowrap">Terkuat</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const { min, max } = extremes(r);
              return (
                <tr key={r.id}>
                  <td className="sticky left-0 bg-white z-10 py-2 px-3 align-top">
                    <div className="text-xs font-bold text-slate-700 break-words leading-tight max-w-[160px]" title={r.name}>{displayName(r.nickname, r.name)}</div>
                    <div className="text-[10px] text-gray-400 break-words leading-tight max-w-[160px]">{r.dept}</div>
                  </td>
                  {columns.map((c) => {
                    const v = r.cells[c.key];
                    const { bg, fg } = heatColor(v);
                    return (
                      <td key={c.key}
                        className="text-center font-mono font-bold rounded-md py-2.5 px-1 whitespace-nowrap"
                        style={{ backgroundColor: bg, color: fg, width: CELL_W, minWidth: CELL_W, maxWidth: CELL_W }}
                        title={`${r.name} · ${c.full ?? c.label} · ${v != null ? v.toFixed(2) : 'tanpa data'}`}>
                        {v != null ? v.toFixed(2) : '—'}
                      </td>
                    );
                  })}
                  <td className="py-2 pl-8 pr-3 align-top">
                    <span className="text-[11px] text-rose-600 font-semibold break-words leading-tight block max-w-[200px]" title={colFull(min?.key)}>{colFull(min?.key)}</span>
                  </td>
                  <td className="py-2 px-3 align-top">
                    <span className="text-[11px] text-emerald-700 font-semibold break-words leading-tight block max-w-[200px]" title={colFull(max?.key)}>{colFull(max?.key)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <p className="text-[10px] text-gray-500 italic">
          Sel = skor 360° pegawai pada aspek/indikator itu (rendah → tinggi mengikuti gradien). Kolom <span className="text-rose-600 font-semibold not-italic">Terlemah</span> / <span className="text-emerald-700 font-semibold not-italic">Terkuat</span> menyebut yang terendah &amp; tertinggi tiap orang. &ldquo;—&rdquo; = tanpa data.
        </p>
        {filtered.length > pageSize && (
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">← {pageSize} sebelumnya</button>
            <span className="text-[11px] text-gray-500">{safePage * pageSize + 1}–{Math.min(filtered.length, safePage * pageSize + shown.length)} / {filtered.length}</span>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">{pageSize} berikutnya →</button>
          </div>
        )}
      </div>
    </div>
  );
}
