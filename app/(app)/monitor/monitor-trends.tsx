'use client';

import { useMemo, useState } from 'react';
import { displayName } from '@/lib/employee-name';

export type PeriodTrendPoint = { label: string; kpi: number | null; s360: number | null };
export type EmpMonthly = {
  id: string; name: string; nickname?: string | null;
  monthly: (number | null)[];        // KPI bulanan
  monthly360: (number | null)[];     // Skor 360° per-kuartal, dipetakan datar ke bulan
  monthlyFinal: (number | null)[];   // Skor Akhir per-kuartal, dipetakan datar ke bulan
};
export type MoverRow = { name: string; nickname?: string | null; delta: number; curr: number };
/** Pergerakan 360° per pegawai + rincian per-aspek (di aspek mana naik/turun). */
export type AspectDelta = { aspect: string; delta: number };
export type MoverRow360 = { name: string; nickname?: string | null; delta: number; curr: number; aspects: AspectDelta[] };
/**
 * Dekomposisi penyebab perubahan Δ antar dua periode berdata terakhir (untuk Sorotan):
 * memisah selisih total menjadi (a) perubahan SKOR pegawai yang dinilai di KEDUA periode
 * ("konsisten") dan (b) perubahan KOMPOSISI (pegawai masuk/keluar dari populasi yang dinilai).
 * `total = real + cohort` (identitas eksak): total = currAvg−prevAvg; real = selisih rerata pada
 * pegawai konsisten; cohort = sisanya (efek pegawai baru/keluar & pergeseran populasi).
 */
export type DeltaCause = {
  total: number | null;   // selisih rerata keseluruhan (currAvg − prevAvg)
  real: number | null;    // kontribusi perubahan skor pegawai konsisten
  cohort: number | null;  // kontribusi perubahan komposisi (masuk/keluar)
  commonN: number;        // jumlah pegawai konsisten (berdata di kedua periode)
  enteredN: number;       // pegawai baru berdata (curr saja)
  leftN: number;          // pegawai tak lagi berdata (prev saja)
};
type Series = { label: string; color: string; points: (number | null)[]; showValues?: boolean };

const C_KPI = '#059669';   // emerald
const C_360 = '#4f46e5';   // indigo
const C_FINAL = '#d97706';  // amber — Skor Akhir

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
              {/* Nilai di tiap titik — dilewati untuk seri per-kuartal (showValues=false) agar
                  garis datar 360°/Skor Akhir tak menumpuk label di grafik bulanan. Seri ganda
                  (per-periode): seri ke-2 di BAWAH titik. Label titik TEPI dirata-kan ke dalam. */}
              {s.showValues !== false && (
                <text
                  x={x(i) + (n > 1 && i === 0 ? 2 : n > 1 && i === n - 1 ? -2 : 0)}
                  y={y(v) + (series.length > 1 && sIdx > 0 ? 13 : -6)}
                  textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
                  style={{ fontSize: 9, fontWeight: 700 }} fill={s.color}>
                  {v.toFixed(2)}
                </text>
              )}
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

const INSIGHT_DOT: Record<'up' | 'down' | 'flat', string> = {
  up: 'bg-emerald-500', down: 'bg-rose-500', flat: 'bg-gray-400',
};

/** Format selisih bertanda 2-desimal: +5.30 / −1.82. */
const sgn = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;
const toneOf = (d: number): 'up' | 'down' | 'flat' => (Math.abs(d) < 1.5 ? 'flat' : d > 0 ? 'up' : 'down');
const CAUSE_NUM: Record<'up' | 'down' | 'flat', string> = {
  up: 'text-emerald-700', down: 'text-rose-600', flat: 'text-gray-500',
};

/**
 * Sorotan penyebab: satu metrik (KPI / 360°) → baris utama arah & besar perubahan, lalu URAIAN
 * PENYEBAB — berapa dari perubahan skor pegawai konsisten vs berapa dari perubahan komposisi
 * (pegawai masuk/keluar penilaian). Menjawab "naik/turunnya karena apa". Uraian ditampilkan saat
 * ada komponen bermakna (≥1.5) — termasuk kasus saling meniadakan (total kecil tapi penyebabnya besar).
 */
function CauseBlock({ label, cause }: { label: string; cause: DeltaCause | null }) {
  if (!cause || cause.total == null) return null;
  const { total, real, cohort, commonN, enteredN, leftN } = cause;
  const tone = toneOf(total);
  const dir = tone === 'flat' ? 'relatif stabil' : total > 0 ? `naik${total >= 5 ? ' tajam' : ''}` : `turun${total <= -5 ? ' tajam' : ''}`;
  const composChanged = enteredN > 0 || leftN > 0;
  // Tampilkan uraian bila ada komponen penyebab yang bermakna (≥1.5) — juga saat saling meniadakan.
  const showBreak = real == null
    ? composChanged
    : (Math.abs(total) >= 1.5 || Math.abs(real) >= 1.5 || (cohort != null && Math.abs(cohort) >= 1.5));
  const composNote = composChanged
    ? `${enteredN > 0 ? `+${enteredN} masuk` : ''}${enteredN > 0 && leftN > 0 ? ', ' : ''}${leftN > 0 ? `−${leftN} keluar` : ''}`
    : 'populasi tetap';
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5 text-[11px] leading-snug text-gray-700">
        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${INSIGHT_DOT[tone]}`} />
        <span><span className="font-semibold">{label}</span> {dir} <span className={`font-mono font-bold ${CAUSE_NUM[tone]}`}>({sgn(total)})</span></span>
      </div>
      {showBreak && (
        <div className="ml-3 pl-1.5 border-l border-gray-200 space-y-0.5 text-[10px] text-gray-500">
          {real == null ? (
            <div>Seluruhnya dari perubahan komposisi — tak ada pegawai yang dinilai di kedua periode.</div>
          ) : (
            <>
              <div>
                Perubahan skor pegawai:{' '}
                <span className={`font-mono font-bold ${CAUSE_NUM[toneOf(real)]}`}>{sgn(real)}</span>
                <span className="text-gray-400"> ({commonN} pegawai konsisten)</span>
              </div>
              {cohort != null && (
                <div>
                  Perubahan komposisi:{' '}
                  <span className={`font-mono font-bold ${CAUSE_NUM[toneOf(cohort)]}`}>{sgn(cohort)}</span>
                  <span className="text-gray-400"> ({composNote})</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DeltaSummary({
  periodsTrend, has360, kpiCause, s360Cause,
}: {
  periodsTrend: PeriodTrendPoint[]; has360: boolean;
  kpiCause: DeltaCause | null; s360Cause: DeltaCause | null;
}) {
  const n = periodsTrend.length;
  const curr = n >= 1 ? periodsTrend[n - 1] : null;
  const prev = n >= 2 ? periodsTrend[n - 2] : null;
  if (!curr) return null;
  const hasCause = !!prev && ((kpiCause?.total != null) || (has360 && s360Cause?.total != null));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 h-full flex flex-col">
      <div className="text-[11px] font-bold text-gray-600 mb-2">
        {prev ? <>Perubahan <span className="text-gray-800">{prev.label} → {curr.label}</span></> : <>Periode <span className="text-gray-800">{curr.label}</span></>}
      </div>
      <div className="space-y-2">
        <DeltaMetric label="Avg KPI" curr={curr.kpi} prev={prev?.kpi ?? null} />
        {has360 && <DeltaMetric label="Avg 360°" curr={curr.s360} prev={prev?.s360 ?? null} />}
      </div>
      {hasCause && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Penyebab perubahan</div>
          <div className="space-y-2">
            <CauseBlock label="KPI tim" cause={kpiCause} />
            {has360 && <CauseBlock label="360° tim" cause={s360Cause} />}
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
      <span className="flex-1 min-w-0 truncate text-gray-700" title={m.name}>{displayName(m.nickname, m.name)}</span>
      <span className={`font-mono font-bold ${up ? 'text-emerald-700' : 'text-rose-600'}`}>
        {m.delta >= 0 ? '+' : '−'}{Math.abs(m.delta).toFixed(2)}
      </span>
      <span className="font-mono text-[10px] text-gray-400 w-10 text-right">{m.curr.toFixed(1)}</span>
    </div>
  );
}

/** Tombol toggle "Lihat semua (N) / Tampilkan lebih sedikit" — tampil hanya bila ada yang tersembunyi. */
function ShowAllToggle({ expanded, total, onToggle }: { expanded: boolean; total: number; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className="mt-3 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline">
      {expanded ? 'Tampilkan lebih sedikit' : `Lihat semua (${total})`}
    </button>
  );
}

const TOP_N = 3; // default tampil per kolom (Naik/Turun) sebelum "Lihat semua"

function TopMovers({ movers, labels }: { movers: MoverRow[]; labels: { prev: string; curr: string } | null }) {
  const [expanded, setExpanded] = useState(false);
  const allRisers = movers.filter((m) => m.delta > 0);
  const allFallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta);
  const risers = expanded ? allRisers : allRisers.slice(0, TOP_N);
  const fallers = expanded ? allFallers : allFallers.slice(0, TOP_N);
  const hasMore = allRisers.length > TOP_N || allFallers.length > TOP_N;
  return (
    <ChartCard title="Pergerakan KPI" hint={labels && <span className="text-[11px] text-gray-400">{labels.prev} → {labels.curr}</span>}>
      {!labels || movers.length === 0 ? (
        <p className="text-xs text-gray-500 italic py-6 text-center">Perlu ≥2 periode berdata (pegawai bernilai di keduanya) untuk pergerakan.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Naik {allRisers.length > 0 && <span className="text-gray-400 font-normal">({allRisers.length})</span>}</div>
              {risers.length ? <div className="space-y-1.5">{risers.map((m) => <MoverLine key={m.name} m={m} up />)}</div>
                : <p className="text-[11px] text-gray-400 italic">Tak ada kenaikan.</p>}
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-rose-600 mb-1.5">Turun {allFallers.length > 0 && <span className="text-gray-400 font-normal">({allFallers.length})</span>}</div>
              {fallers.length ? <div className="space-y-1.5">{fallers.map((m) => <MoverLine key={m.name} m={m} up={false} />)}</div>
                : <p className="text-[11px] text-gray-400 italic">Tak ada penurunan.</p>}
            </div>
          </div>
          {hasMore && <ShowAllToggle expanded={expanded} total={allRisers.length + allFallers.length} onToggle={() => setExpanded((v) => !v)} />}
        </>
      )}
    </ChartCard>
  );
}

/**
 * Pergerakan 360° — selisih Skor 360° per pegawai antara dua periode berdata terakhir, DENGAN
 * rincian PER-ASPEK: di aspek mana tiap pegawai naik/turun. Aspek diurut penurunan-dulu (paling
 * merah di depan) agar "di aspek mana turun" langsung terbaca. Melengkapi Pergerakan KPI.
 */
function AspectChips({ aspects }: { aspects: AspectDelta[] }) {
  // Penurunan dulu (delta menaik: paling negatif di depan), maksimal 4 aspek bermakna.
  const shown = [...aspects].sort((a, b) => a.delta - b.delta).slice(0, 4);
  if (shown.length === 0) return <span className="text-[10px] text-gray-400 italic">tak ada perubahan aspek berarti</span>;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
      {shown.map((a) => {
        const down = a.delta < 0;
        return (
          <span key={a.aspect} className="text-[10px] whitespace-nowrap">
            <span className={down ? 'text-rose-600' : 'text-emerald-700'} aria-hidden>{down ? '▼' : '▲'}</span>{' '}
            <span className="text-gray-600">{a.aspect}</span>{' '}
            <span className={`font-mono font-bold ${down ? 'text-rose-600' : 'text-emerald-700'}`}>{sgn(a.delta)}</span>
          </span>
        );
      })}
    </div>
  );
}

function Mover360Line({ m, up }: { m: MoverRow360; up: boolean }) {
  return (
    <div className="border-b border-gray-100 last:border-0 pb-1.5 last:pb-0">
      <div className="flex items-center gap-2 text-[12px]">
        <span className={`font-bold ${up ? 'text-emerald-700' : 'text-rose-600'}`}>{up ? '▲' : '▼'}</span>
        <span className="flex-1 min-w-0 truncate text-gray-700" title={m.name}>{displayName(m.nickname, m.name)}</span>
        <span className={`font-mono font-bold ${up ? 'text-emerald-700' : 'text-rose-600'}`}>
          {m.delta >= 0 ? '+' : '−'}{Math.abs(m.delta).toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-gray-400 w-10 text-right">{m.curr.toFixed(1)}</span>
      </div>
      <div className="ml-5 mt-0.5"><AspectChips aspects={m.aspects} /></div>
    </div>
  );
}

function TopMovers360({ movers, labels }: { movers: MoverRow360[]; labels: { prev: string; curr: string } | null }) {
  const [expanded, setExpanded] = useState(false);
  const allRisers = movers.filter((m) => m.delta > 0);
  const allFallers = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta);
  const risers = expanded ? allRisers : allRisers.slice(0, TOP_N);
  const fallers = expanded ? allFallers : allFallers.slice(0, TOP_N);
  const hasMore = allRisers.length > TOP_N || allFallers.length > TOP_N;
  return (
    <ChartCard title="Pergerakan 360°" hint={labels && <span className="text-[11px] text-gray-400">{labels.prev} → {labels.curr}</span>}>
      {!labels || movers.length === 0 ? (
        <p className="text-xs text-gray-500 italic py-6 text-center">Perlu ≥2 periode ber-360° (pegawai bernilai di keduanya) untuk pergerakan.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">Naik {allRisers.length > 0 && <span className="text-gray-400 font-normal">({allRisers.length})</span>}</div>
              {risers.length ? <div className="space-y-1.5">{risers.map((m) => <Mover360Line key={m.name} m={m} up />)}</div>
                : <p className="text-[11px] text-gray-400 italic">Tak ada kenaikan.</p>}
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-rose-600 mb-1.5">Turun {allFallers.length > 0 && <span className="text-gray-400 font-normal">({allFallers.length})</span>}</div>
              {fallers.length ? <div className="space-y-1.5">{fallers.map((m) => <Mover360Line key={m.name} m={m} up={false} />)}</div>
                : <p className="text-[11px] text-gray-400 italic">Tak ada penurunan.</p>}
            </div>
          </div>
          {hasMore && <ShowAllToggle expanded={expanded} total={allRisers.length + allFallers.length} onToggle={() => setExpanded((v) => !v)} />}
          <p className="text-[10px] text-gray-400 mt-3">Rincian per-aspek: <span className="text-rose-600 font-bold">▼</span> aspek turun · <span className="text-emerald-700 font-bold">▲</span> aspek naik (relatif periode sebelumnya).</p>
        </>
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
  periodsTrend, monthLabels, teamMonthly, team360Monthly, teamFinalMonthly, employees, has360,
  movers, moverLabels, kpiCause, s360Cause, movers360, moverLabels360,
}: {
  periodsTrend: PeriodTrendPoint[];
  monthLabels: string[];
  teamMonthly: (number | null)[];
  team360Monthly: (number | null)[];
  teamFinalMonthly: (number | null)[];
  employees: EmpMonthly[];
  has360: boolean;
  movers: MoverRow[];
  moverLabels: { prev: string; curr: string } | null;
  kpiCause: DeltaCause | null;
  s360Cause: DeltaCause | null;
  movers360: MoverRow360[];
  moverLabels360: { prev: string; curr: string } | null;
}) {
  const [sel, setSel] = useState('team'); // 'team' = rata-rata tim; selain itu = employee id
  const empC = useMemo(() => employees.find((e) => e.id === sel) ?? null, [employees, sel]);
  const cPoints = sel === 'team' ? teamMonthly : (empC?.monthly ?? []);
  const c360 = sel === 'team' ? team360Monthly : (empC?.monthly360 ?? []);
  const cFinal = sel === 'team' ? teamFinalMonthly : (empC?.monthlyFinal ?? []);
  const cLabel = sel === 'team' ? 'Rata-rata Tim' : (empC ? displayName(empC.nickname, empC.name) : '');

  // Seri grafik bulanan: KPI (bulanan, berlabel) + 360° & Skor Akhir (per-kuartal, garis datar tanpa label).
  const monthlySeries = (kpi: (number | null)[], s360: (number | null)[], fin: (number | null)[], kpiLabel: string): Series[] => [
    { label: kpiLabel, color: C_KPI, points: kpi },
    ...(has360 ? [{ label: 'Skor 360° (per kuartal)', color: C_360, points: s360, showValues: false }] : []),
    { label: 'Skor Akhir (per kuartal)', color: C_FINAL, points: fin, showValues: false },
  ];
  const monthlyLegend = (kpiLabel: string) => [
    { label: kpiLabel, color: C_KPI },
    ...(has360 ? [{ label: 'Skor 360° (per kuartal)', color: C_360 }] : []),
    { label: 'Skor Akhir (per kuartal)', color: C_FINAL },
  ];

  const periodLabels = periodsTrend.map((p) => p.label);
  const periodSeries: Series[] = [
    { label: 'Avg KPI', color: C_KPI, points: periodsTrend.map((p) => p.kpi) },
    ...(has360 ? [{ label: 'Avg 360°', color: C_360, points: periodsTrend.map((p) => p.s360) }] : []),
  ];

  return (
    <div className="mt-3 space-y-4">
      <ChartCard title="Tren Tim per Periode">
        {periodsTrend.length === 0 ? <Empty /> : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div className="lg:col-span-2 min-w-0">
              <LineChart xLabels={periodLabels} series={periodSeries} />
              <Legend items={has360 ? [{ label: 'Avg KPI', color: C_KPI }, { label: 'Avg 360°', color: C_360 }] : [{ label: 'Avg KPI', color: C_KPI }]} />
            </div>
            <DeltaSummary periodsTrend={periodsTrend} has360={has360} kpiCause={kpiCause} s360Cause={s360Cause} />
          </div>
        )}
      </ChartCard>

      <TopMovers movers={movers} labels={moverLabels} />

      {has360 && <TopMovers360 movers={movers360} labels={moverLabels360} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Tren Kinerja Tim per Bulan">
          {monthLabels.length === 0 ? <Empty /> : (
            <>
              <LineChart xLabels={monthLabels} series={monthlySeries(teamMonthly, team360Monthly, teamFinalMonthly, 'KPI Tim')} />
              <Legend items={monthlyLegend('KPI Tim')} />
              <PeriodMetricNote />
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Tren Kinerja Pegawai per Bulan"
          hint={
            <select value={sel} onChange={(e) => setSel(e.target.value)}
              className="text-[11px] px-2 py-1 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
              <option value="team">Rata-rata Tim</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{displayName(e.nickname, e.name)}</option>)}
            </select>
          }
        >
          {monthLabels.length === 0 ? <Empty /> : (
            <>
              <LineChart xLabels={monthLabels} series={monthlySeries(cPoints, c360, cFinal, `${cLabel} · KPI`)} />
              <Legend items={monthlyLegend(`${cLabel} · KPI`)} />
              <PeriodMetricNote />
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

/** Catatan granularitas: KPI bulanan, sedangkan 360° & Skor Akhir dihitung sekali per kuartal. */
function PeriodMetricNote() {
  return (
    <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
      KPI bersifat bulanan. <span className="font-semibold text-gray-500">Skor 360°</span> &amp; <span className="font-semibold text-gray-500">Skor Akhir</span> dihitung
      per kuartal → ditampilkan sebagai garis datar sepanjang bulan-bulan kuartalnya (nilai per titik lihat "Tren Tim per Periode" &amp; tabel).
    </p>
  );
}
