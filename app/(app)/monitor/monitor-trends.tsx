'use client';

import { useMemo, useState } from 'react';

export type PeriodTrendPoint = { label: string; kpi: number | null; s360: number | null };
export type EmpMonthly = { id: string; name: string; monthly: (number | null)[] };
type Series = { label: string; color: string; points: (number | null)[] };

const C_KPI = '#059669';   // emerald
const C_360 = '#4f46e5';   // indigo

/** Line chart SVG ringkas, responsif; garis putus pada nilai null (data bulan kosong). */
function LineChart({ xLabels, series, yMax = 100 }: { xLabels: string[]; series: Series[]; yMax?: number }) {
  const W = 600, H = 240, padL = 34, padR = 12, padT = 12, padB = 34;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = xLabels.length;
  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1));
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
                  bertumpuk dgn seri ke-1 yang di atas. */}
              <text x={x(i)} y={y(v) + (series.length > 1 && sIdx > 0 ? 13 : -6)}
                textAnchor="middle" style={{ fontSize: 9, fontWeight: 700 }} fill={s.color}>
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
  periodsTrend, monthLabels, teamMonthly, employees, has360,
}: {
  periodsTrend: PeriodTrendPoint[];
  monthLabels: string[];
  teamMonthly: (number | null)[];
  employees: EmpMonthly[];
  has360: boolean;
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
          <div className="max-w-2xl">
            <LineChart xLabels={periodLabels} series={periodSeries} />
            <Legend items={has360 ? [{ label: 'Avg KPI', color: C_KPI }, { label: 'Avg 360°', color: C_360 }] : [{ label: 'Avg KPI', color: C_KPI }]} />
          </div>
        )}
      </ChartCard>

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
