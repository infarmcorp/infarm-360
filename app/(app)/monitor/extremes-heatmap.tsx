'use client';

import { useMemo, useState } from 'react';
import { PieChart, X } from 'lucide-react';
import { CARD, CardTitle } from '@/components/infarm-ui';
import { PerEmployeeHeatmap, type HeatCol, type HeatRow } from './per-employee-heatmap';

/**
 * Unit terkoordinasi: donut FREKUENSI (di atas) + heatmap per-pegawai (di bawah), berbagi state.
 * Donut menghitung berapa orang yang titik TERLEMAH/TERKUAT-nya jatuh di tiap aspek/indikator
 * (4 teratas + "Lainnya", maks 5 irisan). Klik satu irisan → heatmap MENYARING hanya pegawai yang
 * terlemah/terkuatnya (sesuai section yang diklik) di kolom itu. Klik lagi / "Tampilkan semua" → reset.
 *
 * Semua dari data heatmap yang sudah dihitung server (rumus 360° resmi) — tanpa query tambahan.
 */
export function ExtremesHeatmap({
  pieTitle, pieSubtitle, heatTitle, heatSubtitle, columns, rows, pageSize = 5,
}: {
  pieTitle: string; pieSubtitle?: string; heatTitle: string; heatSubtitle?: string;
  columns: HeatCol[]; rows: HeatRow[]; pageSize?: number;
}) {
  const [sel, setSel] = useState<Sel | null>(null);

  // Titik terlemah/terkuat tiap pegawai (null bila <2 kolom berdata atau min==max → tak bermakna).
  const rowExtremes = useMemo(() => {
    const m = new Map<string, { minKey: string; maxKey: string }>();
    for (const r of rows) {
      let min: { key: string; v: number } | null = null, max: { key: string; v: number } | null = null;
      for (const c of columns) {
        const v = r.cells[c.key];
        if (v == null) continue;
        if (!min || v < min.v) min = { key: c.key, v };
        if (!max || v > max.v) max = { key: c.key, v };
      }
      if (min && max && min.key !== max.key) m.set(r.id, { minKey: min.key, maxKey: max.key });
    }
    return m;
  }, [columns, rows]);

  const { weak, strong } = useMemo(() => {
    const weakN = new Map<string, number>(), strongN = new Map<string, number>();
    for (const ex of rowExtremes.values()) {
      weakN.set(ex.minKey, (weakN.get(ex.minKey) ?? 0) + 1);
      strongN.set(ex.maxKey, (strongN.get(ex.maxKey) ?? 0) + 1);
    }
    const labelOf = (key: string) => { const c = columns.find((x) => x.key === key); return c ? (c.full ?? c.label) : key; };
    return { weak: rankSlices(weakN, labelOf, WEAK), strong: rankSlices(strongN, labelOf, STRONG) };
  }, [rowExtremes, columns]);

  const filteredRows = useMemo(() => {
    if (!sel) return rows;
    const keys = new Set(sel.keys);
    return rows.filter((r) => {
      const ex = rowExtremes.get(r.id);
      if (!ex) return false;
      return keys.has(sel.kind === 'weak' ? ex.minKey : ex.maxKey);
    });
  }, [sel, rows, rowExtremes]);

  if (weak.length === 0 && strong.length === 0) return null;

  const toggle = (kind: Kind, sl: Slice) => {
    const id = selId(kind, sl.keys);
    setSel((cur) => (cur && selId(cur.kind, cur.keys) === id ? null : { kind, keys: sl.keys, label: sl.label }));
  };
  const activeId = sel ? selId(sel.kind, sel.keys) : null;

  return (
    <div className="mb-4">
      {/* DONUT FREKUENSI (di atas) */}
      <div className={`${CARD} mb-4`}>
        <CardTitle icon={PieChart}>{pieTitle}</CardTitle>
        {pieSubtitle && <p className="text-xs text-ink-soft mt-1 mb-4">{pieSubtitle}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PieBlock heading="Paling Sering Terlemah" kind="weak" slices={weak} activeId={activeId} onPick={toggle} tone="danger" />
          <PieBlock heading="Paling Sering Terkuat" kind="strong" slices={strong} activeId={activeId} onPick={toggle} tone="brand" />
        </div>
        <p className="text-xs text-ink-soft mt-4">
          <strong>Klik satu irisan</strong> untuk menyaring heatmap di bawah — hanya pegawai yang{' '}
          <span className="text-danger-ink font-semibold">terlemah</span>/<span className="text-brand-ink font-semibold">terkuat</span>-nya
          di aspek/indikator itu. Irisan menjumlah 100% (4 teratas + Lainnya); ini titik ekstrem <em>relatif</em> tiap orang, bukan skor mutlak.
        </p>
      </div>

      {/* Banner filter aktif */}
      {sel && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 mb-4 ${
          sel.kind === 'weak' ? 'bg-danger-tint' : 'bg-brand-tint'}`}>
          <span className="text-[13px] text-ink">
            Menampilkan <strong className="font-mono">{filteredRows.length}</strong> pegawai dengan{' '}
            <strong className={sel.kind === 'weak' ? 'text-danger-ink' : 'text-brand-ink'}>
              {sel.kind === 'weak' ? 'terlemah' : 'terkuat'}</strong> di: <strong>{sel.label}</strong>
          </span>
          <button type="button" onClick={() => setSel(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold min-h-9 px-3 rounded-full border border-line bg-surface text-ink-soft hover:text-brand hover:border-infarm-light">
            Tampilkan semua <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* HEATMAP (di bawah) — baris tersaring mengikuti irisan yang diklik */}
      <PerEmployeeHeatmap title={heatTitle} subtitle={heatSubtitle} columns={columns} rows={filteredRows} pageSize={pageSize} />
    </div>
  );
}

type Kind = 'weak' | 'strong';
type Slice = { keys: string[]; label: string; n: number; color: string };
type Sel = { kind: Kind; keys: string[]; label: string };

// Palet Design System Infarm: Terlemah = rona danger, Terkuat = rona brand, Lainnya = abu garis.
const WEAK = ['#a23c33', '#c4564b', '#e08a80', '#f2c1bb'];
const STRONG = ['#006b31', '#00843b', '#5fb877', '#96d296'];
const OTHER = '#c9cec7';

const selId = (kind: Kind, keys: string[]) => `${kind}|${[...keys].sort().join(',')}`;

function rankSlices(counts: Map<string, number>, labelOf: (k: string) => string, palette: string[]): Slice[] {
  const ranked = [...counts.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  const top = ranked.slice(0, 4);
  const rest = ranked.slice(4);
  const slices: Slice[] = top.map((it, i) => ({ keys: [it.key], label: labelOf(it.key), n: it.n, color: palette[i] }));
  if (rest.length) slices.push({ keys: rest.map((r) => r.key), label: `${rest.length} lainnya`, n: rest.reduce((s, r) => s + r.n, 0), color: OTHER });
  return slices;
}

function PieBlock({ heading, kind, slices, activeId, onPick, tone }: {
  heading: string; kind: Kind; slices: Slice[]; activeId: string | null;
  onPick: (kind: Kind, sl: Slice) => void; tone: 'danger' | 'brand';
}) {
  const headCls = tone === 'danger' ? 'text-danger-ink' : 'text-brand-ink';
  const total = slices.reduce((s, x) => s + x.n, 0);
  if (total === 0) {
    return (
      <div>
        <h4 className={`text-[13px] font-bold uppercase tracking-[0.08em] mb-3 ${headCls}`}>{heading}</h4>
        <p className="text-xs text-ink-soft italic">Belum ada data.</p>
      </div>
    );
  }
  const R = 62, RIN = 38, CX = 70, CY = 70;
  // Sudut awal tiap irisan = jumlah porsi irisan sebelumnya (dihitung di muka, tanpa variabel yang dimutasi).
  const fracs = slices.map((s) => s.n / total);
  const arcs = slices.map((s, i) => {
    const frac = fracs[i];
    const a0 = -Math.PI / 2 + fracs.slice(0, i).reduce((x, y) => x + y, 0) * Math.PI * 2;
    const a1 = a0 + frac * Math.PI * 2;
    return { s, a0, a1, frac, id: selId(kind, s.keys) };
  });
  const single = slices.length === 1;
  const anyActive = activeId != null && arcs.some((a) => a.id === activeId);

  return (
    <div>
      <h4 className={`text-[13px] font-bold uppercase tracking-[0.08em] mb-3 ${headCls}`}>{heading}</h4>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 140 140" className="w-[140px] h-[140px] shrink-0" role="img" aria-label={heading}>
          {single ? (
            <circle cx={CX} cy={CY} r={(R + RIN) / 2} fill="none" stroke={slices[0].color} strokeWidth={R - RIN}
              className="cursor-pointer" onClick={() => onPick(kind, slices[0])} />
          ) : (
            arcs.map(({ s, a0, a1, id }) => {
              const dim = anyActive && id !== activeId;
              return (
                <path key={id} d={donutArc(CX, CY, R, RIN, a0, a1)} fill={s.color}
                  stroke="#fff" strokeWidth={id === activeId ? 2.5 : 1.5}
                  className="cursor-pointer transition-opacity" style={{ opacity: dim ? 0.32 : 1 }}
                  onClick={() => onPick(kind, s)}>
                  <title>{`${s.label}: ${s.n} · ${((s.n / total) * 100).toFixed(0)}% — klik untuk saring`}</title>
                </path>
              );
            })
          )}
          <text x={CX} y={CY - 3} textAnchor="middle" className="fill-ink font-mono" fontSize={19} fontWeight={700}>{total}</text>
          <text x={CX} y={CY + 12} textAnchor="middle" className="fill-ink-soft" fontSize={10} fontWeight={600}>pegawai</text>
        </svg>
        <ul className="flex-1 min-w-0 space-y-1.5">
          {arcs.map(({ s, frac, id }) => {
            const active = id === activeId;
            return (
              <li key={id}>
                <button type="button" onClick={() => onPick(kind, s)}
                  className={`w-full flex items-start gap-2 text-xs text-left rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-infarm-surface ${active ? 'bg-neutral-tint ring-1 ring-line-strong' : ''}`}
                  title="Klik untuk saring heatmap">
                  <span className="w-3 h-3 rounded-sm shrink-0 mt-0.5" style={{ backgroundColor: s.color }} />
                  <span className={`break-words leading-tight flex-1 min-w-0 ${active ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{s.label}</span>
                  <span className="font-mono text-ink-soft shrink-0 whitespace-nowrap">{s.n} · {(frac * 100).toFixed(0)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Path SVG untuk satu sektor donut (annular sector) dari sudut a0→a1 (radian). Koordinat DIBULATKAN
 * ke 3 desimal: Math.cos/sin bisa berbeda ~1e-14 antara Node (server) & browser (client) → tanpa
 * pembulatan, string `d` tak identik → hydration mismatch. Pembulatan menjamin output deterministik.
 */
function donutArc(cx: number, cy: number, rOut: number, rIn: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => [(cx + r * Math.cos(a)).toFixed(3), (cy + r * Math.sin(a)).toFixed(3)] as const;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(rOut, a0), [x1, y1] = p(rOut, a1);
  const [x2, y2] = p(rIn, a1), [x3, y3] = p(rIn, a0);
  return `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`;
}
