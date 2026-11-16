'use client';

import { fmt2 } from '@/lib/scoring';

import { useMemo, useState } from 'react';
import { StableHeight } from '@/components/table-controls';
import { Grid3x3 } from 'lucide-react';
import { heatColorInfarm, HEAT_LEGEND_GRADIENT_INFARM } from '@/lib/score-color';
import { CARD, CardTitle, FIELD } from '@/components/infarm-ui';
import { displayName } from '@/lib/employee-name';

export type HeatCol = { key: string; label: string; full?: string; group?: string };
export type HeatRow = { id: string; name: string; nickname?: string | null; dept: string; cells: Record<string, number | null> };

// Lebar seragam tiap kolom heatmap (px) — header & sel dipatok sama agar semua kolom sejajar.
const CELL_W = 92;
// Lebar TETAP kolom non-skor (px) — table-fixed agar kolom tak bergeser saat ganti halaman/cari.
const NAME_W = 180;   // Pegawai + divisi (teks dibungkus)
const WEAK_W = 244;   // Terlemah (pl-8 + teks maks 200px + pr-3)
const STRONG_W = 224; // Terkuat (px-3 + teks maks 200px)
const SPACING = 4;    // border-spacing-1

/**
 * Heatmap PER-PEGAWAI (aspek atau indikator 360°) — tiap baris = 1 pegawai, tiap kolom = aspek/
 * indikator, sel diwarnai skor 0–100 dengan palet Design System Infarm `heatColorInfarm` + legenda gradien — SAMA
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
    <div className={`${CARD} mb-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <CardTitle icon={Grid3x3}>{title}</CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            <span>Rendah</span>
            <span className="h-2.5 w-24 rounded-full" style={{ background: HEAT_LEGEND_GRADIENT_INFARM }} />
            <span>Tinggi</span>
          </div>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama…"
            className={`${FIELD} w-44`} />
        </div>
      </div>
      {subtitle && <p className="text-xs text-ink-soft mt-1 mb-4">{subtitle}</p>}
      <StableHeight className="">
      <div className="overflow-x-auto">
        <table className="table-fixed table-1line border-separate border-spacing-1 text-xs"
          style={{ width: NAME_W + columns.length * CELL_W + WEAK_W + STRONG_W + (columns.length + 4) * SPACING }}>
          <colgroup>
            <col style={{ width: NAME_W }} />{/* Pegawai */}
            {columns.map((c) => <col key={c.key} style={{ width: CELL_W }} />)}
            <col style={{ width: WEAK_W }} />{/* Terlemah */}
            <col style={{ width: STRONG_W }} />{/* Terkuat */}
          </colgroup>
          <thead>
            {hasGroups && (
              <tr>
                <th className="sticky left-0 bg-surface z-10" />
                {groups.map((g, i) => (
                  <th key={`${g.label}-${i}`} colSpan={g.span} title={g.label}
                    className="px-1 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-soft text-center break-words leading-tight">{g.label}</th>
                ))}
                <th colSpan={2} />
              </tr>
            )}
            <tr>
              <th className="sticky left-0 bg-surface z-10 text-left py-2 px-3 text-xs font-semibold text-ink-soft">Pegawai</th>
              {columns.map((c) => (
                <th key={c.key} title={c.full ?? c.label}
                  className="py-2 px-1 text-xs font-semibold text-ink-soft align-bottom" style={{ width: CELL_W, minWidth: CELL_W, maxWidth: CELL_W }}>
                  <div className="break-words leading-tight">{c.label}</div>
                </th>
              ))}
              <th className="py-2 pl-8 pr-3 text-left text-xs font-semibold text-danger-ink whitespace-nowrap">Terlemah</th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-brand-ink whitespace-nowrap">Terkuat</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const { min, max } = extremes(r);
              return (
                <tr key={r.id}>
                  <td className="sticky left-0 bg-surface z-10 py-2 px-3 align-top">
                    <div className="text-xs font-semibold text-ink break-words leading-tight max-w-[160px]" title={r.name}>{displayName(r.nickname, r.name)}</div>
                    <div className="text-[11px] text-ink-soft break-words leading-tight max-w-[160px]">{r.dept}</div>
                  </td>
                  {columns.map((c) => {
                    const v = r.cells[c.key];
                    const { bg, fg } = heatColorInfarm(v);
                    return (
                      <td key={c.key}
                        className="text-center font-mono font-bold rounded-md py-2.5 px-1 whitespace-nowrap"
                        style={{ backgroundColor: bg, color: fg, width: CELL_W, minWidth: CELL_W, maxWidth: CELL_W }}
                        title={`${r.name} · ${c.full ?? c.label} · ${v != null ? fmt2(v) : 'tanpa data'}`}>
                        {v != null ? fmt2(v) : '—'}
                      </td>
                    );
                  })}
                  <td className="py-2 pl-8 pr-3 align-top">
                    <span className="text-xs text-danger-ink font-semibold break-words leading-tight block max-w-[200px]" title={colFull(min?.key)}>{colFull(min?.key)}</span>
                  </td>
                  <td className="py-2 px-3 align-top">
                    <span className="text-xs text-brand-ink font-semibold break-words leading-tight block max-w-[200px]" title={colFull(max?.key)}>{colFull(max?.key)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          Sel = skor 360° pegawai pada aspek/indikator itu. Kolom <span className="text-danger-ink font-semibold">Terlemah</span>/<span className="text-brand-ink font-semibold">Terkuat</span> menunjukkan yang terendah dan tertinggi tiap orang. Tanda “—” = tanpa data.
        </p>
        {filtered.length > pageSize && (
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}
              className="text-xs font-semibold min-h-9 px-3 rounded-full border border-line bg-surface text-ink-soft hover:text-brand hover:border-infarm-light disabled:opacity-40 disabled:cursor-not-allowed">← {pageSize} sebelumnya</button>
            <span className="text-xs font-mono text-ink-soft">{safePage * pageSize + 1}–{Math.min(filtered.length, safePage * pageSize + shown.length)} / {filtered.length}</span>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
              className="text-xs font-semibold min-h-9 px-3 rounded-full border border-line bg-surface text-ink-soft hover:text-brand hover:border-infarm-light disabled:opacity-40 disabled:cursor-not-allowed">{pageSize} berikutnya →</button>
          </div>
        )}
      </div>
      </StableHeight>
    </div>
  );
}
