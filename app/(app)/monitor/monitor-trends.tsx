'use client';

import { useMemo, useState } from 'react';

export type PeriodTrendPoint = { label: string; kpi: number | null; s360: number | null };
export type EmpMonthly = { id: string; name: string; monthly: (number | null)[] };
export type MoverRow = { name: string; delta: number; curr: number };
type Series = { label: string; color: string; points: (number | null)[] };

const C_KPI = '#059669';   // emerald
const C_360 = '#4f46e5';   // indigo

/** Line chart SVG ringkas, responsif; garis putus pada nilai null (data bulan kosong). */
function LineChart({ xLabels, series, yMax = 100 }: { xLabels: string[]; series: Series[]; yMax?: number }) {
  const W = 600, H = 240, padL = 40, padR = 16, padT = 12, padB = 34;
  // Inset horizontal titik plot: beri jarak dari sumbu-Y (kiri) & tepi kanan agar titik data
  // pertama/terakhir + label nilainya tak menempel garis sumbu.
  const padInX = 15;
  const plotL = padL + padInX, plotR = W - padR - padInX, plotW = plotR - plotL;
  const innerH = H - padT - padB;
  const n = xLabels.length;
  const x = (i: number) => (n <= 1 ? (plotL + plotR) / 2 : plotL + (i * plotW) / (n - 1));
  const y = (v: number) => padT + innerH - (Math.max(0, Math.min(v, yMax)) / yMax) * innerH;
  const grid = [0, 25, 50, 75, 100];
  // Segmen garis: pisahkan pada titik null agar tak menyambung melintasi lubang data.
  const segments = (pts: (number | null)[]) => {
    const segs: { i: number; v: number }[][] = [];
    let cur: { i: number; v: number }[] = [];
    pts.forEach((v, i) => {
      if (v == null) { if (cur.length) { segs.push(cur); cur = []; } }
      else cur.push({ i, v });
    });
    if (cur.length) segs.push(cur);
    return segs;
  };
  const step = n > 12 ? Math.ceil(n / 12) : 1; // jarangkan label bila bulan banyak

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img">
      {grid.map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#e5e7eb" strokeWidth={1} />
          <text x={padL - 6} y={y(g) + 3} textAnchor="end" className="fill-gray-400" style={{ fontSize: 9 }}>{g}</text>
        </g>
      ))}
      {xLabels.map((lb, i) => (i % step === 0 ? (
        <text key={i} x={x(i)} y={H - padB + 14} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 9 }}>{lb}</text>
      ) : null))}
      {series.map((s, sIdx) => (
        <g key={s.label}>
          {segments(s.points).map((seg, si) => (
            <polyline key={si} fill="none" stroke={s.color} strokeWidth={2}
              points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
          ))}
          {s.points.map((v, i) => (v == null ? null : (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />
              {/* Nilai di tiap titik. Seri ganda (per-periode): seri ke-2 di BAWAH titik agar tak
                  bertumpuk dgn seri ke-1 yang di atas. Label titik TEPI dirata-kan ke dalam
                  (pertama=start, terakhir=end) agar tak menembus sumbu-Y kiri / tepi kanan. */}
              <text
                x={x(i) + (n > 1 && i === 0 ? 2 : n > 1 && i === n - 1 ? -2 : 0)}
                y={y(v) + (series.length > 1 && sIdx > 0 ? 13 : -6)}
                textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
                style={{ fontSize: 9, fontWeight: 700 }} fill={s.color}>
                {v.toFixed(2)}
              </text>
            </g>
          )))}
        </g>
      ))}
    </svg>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
          <span className="w-3 h-1 rounded-full" style={{ backgroundColor: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Kartu ringkas PERUBAHAN antar-periode (Δ) — melengkapi grafik garis "Tren Tim per Periode":
 * periode terakhir yang berdata vs sebelumnya, untuk Avg KPI & Avg 360°. Menjawab "naik/turun
 * berapa" yang sulit dibaca dari sedikit titik. Selisih dihitung dari `periodsTrend` yang sama
 * (sudah difilter ke periode berdata) — tanpa data/rumus baru.
 */
function DeltaMetric({ label, curr, prev }: { label: string; curr: number | null; prev: number | null }) {
  const d = curr != null && prev != null ? curr - prev : null;
  const cls = d == null ? 'text-gray-400' : d > 0 ? 'text-emerald-700' : d < 0 ? 'text-rose-600' : 'text-gray-500';
  const arrow = d == null ? '' : d > 0 ? '▲' : d < 0 ? '▼' : '▬';
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-xl font-black font-mono text-slate-800">{curr != null ? curr.toFixed(2) : '—'}</span>
        <span className={`text-xs font-bold ${cls}`}>
          {d == null ? '—' : `${arrow} ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`}
        </span>
      </div>
      <div className="text-[10px] text-gray-400">{prev != null ? `dari ${prev.toFixed(2)}` : 'periode pertama'}</div>
    </div>
  );
}

/** Interpretasi 1-baris dari selisih: <1.5 stabil · <5 naik/turun · ≥5 naik/turun tajam. */
function insightOf(label: string, d: number | null): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  if (d == null) return null;
  const mag = Math.abs(d);
  const val = `(${d >= 0 ? '+' : '−'}${mag.toFixed(2)})`;
  if (mag < 1.5) return { text: `${label} relatif stabil ${val}`, tone: 'flat' };
  const dir = d > 0 ? 'naik' : 'turun';
  return { text: `${label} ${dir}${mag >= 5 ? ' tajam' : ''} ${val}`, tone: d > 0 ? 'up' : 'down' };
}

const INSIGHT_DOT: Record<'up' | 'down' | 'flat', string> = {
  up: 'bg-emerald-500', down: 'bg-rose-500', flat: 'bg-gray-400',
};

function DeltaSummary({ periodsTrend, has360 }: { periodsTrend: PeriodTrendPoint[]; has360: boolean }) {
  const n = periodsTrend.length;
  const curr = n >= 1 ? periodsTrend[n - 1] : null;
  const prev = n >= 2 ? periodsTrend[n - 2] : null;
  if (!curr) return null;
  const insights = prev
    ? [insightOf('KPI tim', curr.kpi != null && prev.kpi != null ? curr.kpi - prev.kpi : null),
       ...(has360 ? [insightOf('360° tim', curr.s360 != null && prev.s360 != null ? curr.s360 - prev.s360 : null)] : [])]
      .filter((x): x is { text: string; tone: 'up' | 'down' | 'flat' } => x != null)
    : [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 h-full flex flex-col">
      <div className="text-[11px] font-bold text-gray-600 mb-2">
        {prev ? <>Perubahan <span className="text-gray-800">{prev.label} → {curr.label}</span></> : <>Periode <span className="text-gray-800">{curr.label}</span></>}
      </div>
      <div className="space-y-2">
        <DeltaMetric label="Avg KPI" curr={curr.kpi} prev={prev?.kpi ?? null} />
        {has360 && <DeltaMetric label="Avg 360°" curr={curr.s360} prev={prev?.s360 ?? null} />}
      </div>
      {insights.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Sorotan</div>
          <div className="space-y-1">
            {insights.map((it) => (
              <div key={it.text} className="flex items-start gap-1.5 text-[11px] leading-snug text-gray-600">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${INSIGHT_DOT[it.tone]}`} />
                <span>{it.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!prev && <p className="text-[10px] text-gray-400 mt-2">Perlu ≥2 periode berdata untuk selisih.</p>}
    </div>
  );
}

/**
 * Top Movers — pegawai dengan kenaikan/penurunan KPI TERBESAR antar dua periode berdata terakhir.
 * "Actionable" untuk tim kecil: langsung menyorot siapa yang melonjak / perlu perhatian. `movers`
 * sudah diurut selisih menurun di server; komponen memilih 3 teratas naik & 3 teratas turun.
 */
function MoverLine({ m, up }: { m: MoverRow; up: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className={`font-bold ${up ? 'text-emerald-700' : 'text-rose-600'}`}>{up ? '▲' : '▼'}</span>
      <span className="flex-1 min-w-0 truncate text-gray-700">{m.name}</span>
      <span className={`font-mono font-bold ${up ? 'text-emerald-700' : 'text-rose-600'}`}>
        {m.delta >= 0 ? '+' : '−'}{Math.abs(m.delta).toFixed(2)}
      </span>
      <span className="font-mono text-[10px] text-gray-400 w-10 text-right">{m.curr.toFixed(1)}</span>
    </div>
  );
}

function TopMovers({ movers, labels }: { movers: MoverRow[]; labels: { prev: string; curr: string } | null }) {
  const risers = movers.filter((m) => m.delta > 0).slice(0, 3);
  const fallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
  return (
    <ChartCard title="Pergerakan KPI" hint={labels && <span className="text-[11px] text-gray-400">{labels.prev} → {labels.curr}</span>}>
      {!labels || movers.length === 0 ? (
        <p className="text-xs text-gray-500 italic py-6 text-center">Perlu ≥2 periode berdata (pegawai bernilai di keduanya) untuk pergerakan.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Naik</div>
            {risers.length ? <div className="space-y-1.5">{risers.map((m) => <MoverLine key={m.name} m={m} up />)}</div>
              : <p className="text-[11px] text-gray-400 italic">Tak ada kenaikan.</p>}
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-rose-600 mb-1.5">Turun</div>
            {fallers.length ? <div className="space-y-1.5">{fallers.map((m) => <MoverLine key={m.name} m={m} up={false} />)}</div>
              : <p className="text-[11px] text-gray-400 italic">Tak ada penurunan.</p>}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {hint}
      </div>
      {children}
    </div>
  );
}

/**
 * Grafik tren Monitor Kinerja (lintas periode/bulan — tak terpengaruh filter periode):
 *  A. Tren Tim per Periode (Avg KPI & Avg 360°)
 *  B. Tren KPI Tim per Bulan
 *  C. Tren KPI Pegawai per Bulan (dropdown: rata-rata tim / satu pegawai)
 */
export function MonitorTrends({
  periodsTrend, monthLabels, teamMonthly, employees, has360, movers, moverLabels,
}: {
  periodsTrend: PeriodTrendPoint[];
  monthLabels: string[];
  teamMonthly: (number | null)[];
  employees: EmpMonthly[];
  has360: boolean;
  movers: MoverRow[];
  moverLabels: { prev: string; curr: string } | null;
}) {
  const [sel, setSel] = useState('team'); // 'team' = rata-rata tim; selain itu = employee id
  const empC = useMemo(() => employees.find((e) => e.id === sel) ?? null, [employees, sel]);
  const cPoints = sel === 'team' ? teamMonthly : (empC?.monthly ?? []);
  const cLabel = sel === 'team' ? 'Rata-rata Tim' : (empC?.name ?? '');

  const periodLabels = periodsTrend.map((p) => p.label);
  const periodSeries: Series[] = [
    { label: 'Avg KPI', color: C_KPI, points: periodsTrend.map((p) => p.kpi) },
    ...(has360 ? [{ label: 'Avg 360°', color: C_360, points: periodsTrend.map((p) => p.s360) }] : []),
  ];

  return (
    <div className="mt-5 space-y-4">
      <h2 className="text-sm font-bold text-gray-700">Tren Kinerja</h2>

      <ChartCard title="Tren Tim per Periode">
        {periodsTrend.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div className="lg:col-span-2 min-w-0">
              <LineChart xLabels={periodLabels} series={periodSeries} />
              <Legend items={has360 ? [{ label: 'Avg KPI', color: C_KPI }, { label: 'Avg 360°', color: C_360 }] : [{ label: 'Avg KPI', color: C_KPI }]} />
            </div>
            <DeltaSummary periodsTrend={periodsTrend} has360={has360} />
          </div>
        )}
      </ChartCard>

      <TopMovers movers={movers} labels={moverLabels} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Tren KPI Tim per Bulan">
          {monthLabels.length === 0 ? <Empty /> : (
            <LineChart xLabels={monthLabels} series={[{ label: 'KPI Tim', color: C_KPI, points: teamMonthly }]} />
          )}
        </ChartCard>

        <ChartCard
          title="Tren KPI Pegawai per Bulan"
          hint={
            <select value={sel} onChange={(e) => setSel(e.target.value)}
              className="text-[11px] px-2 py-1 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
              <option value="team">Rata-rata Tim</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          }
        >
          {monthLabels.length === 0 ? <Empty /> : (
            <>
              <LineChart xLabels={monthLabels} series={[{ label: cLabel, color: C_KPI, points: cPoints }]} />
              <Legend items={[{ label: cLabel, color: C_KPI }]} />
            </>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-gray-500 italic py-8 text-center">Belum ada data untuk ditampilkan.</p>;
}
