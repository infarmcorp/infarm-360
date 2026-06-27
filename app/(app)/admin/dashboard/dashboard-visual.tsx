'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Award, Target, Flame, TrendingUp, TrendingDown, Building2, Users, BarChart3 } from 'lucide-react';
import {
  TALENT_BOXES, PLAYER_BOXES, type PlayerClass, perfLabelOf,
} from '@/lib/scoring';
import { heatColor, HEAT_LEGEND_GRADIENT } from '@/lib/score-color';

/** Baris pegawai (primitif, serializable) yang dihitung di server. */
export type Row = {
  id: string;
  name: string;
  dept: string;
  kpiAvg: number | null;
  s360: number | null;
  final: number | null;
  boxKey: string | null;
  player: PlayerClass | null;
};

export type SuccessionPlan = { id: string; plan: string; status: string };

/** Baris heatmap KPI per divisi: satu sel per bulan (null = belum ada data). */
export type DeptMonthRow = { dept: string; cells: { ym: string; avg: number | null }[] };

type Props = {
  rows: Row[];
  deptScores: [string, number][];
  aspectScores: { aspek: string; score: number }[];
  monthly: { ym: string; avg: number }[];
  deptMonthly: DeptMonthRow[];
  months: string[];
  yearLabel: number;
  yearMonthly: { ym: string; avg: number }[];
  year360: { label: string; avg: number }[];
  yearKpiAvg: number | null;
  year360Avg: number | null;
  successionPlans: SuccessionPlan[];
  has360: boolean;
  periodLabel: string;
  kpiStandard: number;
};

type SubTab = 'compilation' | 'kpi' | 'feedback' | 'table';

const PLAYER_DESC: Record<PlayerClass, string> = {
  A: 'KPI ≥80 · 360° ≥80',
  B_CULTURE: 'KPI <80 · 360° ≥80',
  B_KPI: 'KPI ≥80 · 360° <80',
  C: 'KPI <80 · 360° <80',
};

/** Label ringkas untuk badge tabel. */
const PLAYER_BADGE: Record<PlayerClass, string> = {
  A: 'A', B_CULTURE: 'B · Culture', B_KPI: 'B · KPI', C: 'C',
};
const PLAYER_COLOR: Record<PlayerClass, string> = {
  A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  B_CULTURE: 'bg-blue-50 text-blue-700 border-blue-200',
  B_KPI: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  C: 'bg-rose-50 text-rose-700 border-rose-200',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const ymLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} '${y.slice(2)}`;
};
const firstName = (n: string) => n.split(' ')[0];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: 'compilation', label: 'Kompilasi Kinerja Organisasi', icon: Building2 },
  { key: 'kpi', label: 'Analisis Hasil KPI', icon: Award },
  { key: 'feedback', label: 'Analisis 360 Feedback', icon: TrendingUp },
  { key: 'table', label: 'Tabel Hasil Seluruh Pegawai', icon: Users },
];

export function DashboardVisual({ rows, deptScores, aspectScores, monthly, deptMonthly, months, yearLabel, yearMonthly, year360, yearKpiAvg, year360Avg, successionPlans, has360, periodLabel, kpiStandard }: Props) {
  const [tab, setTab] = useState<SubTab>('compilation');

  return (
    <div className="space-y-5">
      {/* Sub-tab nav */}
      <div className="flex border-b border-gray-200 gap-1.5 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-all shrink-0 ${
                active ? 'border-emerald-700 text-emerald-950' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon className="w-4 h-4 text-emerald-700" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'compilation' && <CompilationTab rows={rows} deptScores={deptScores} aspectScores={aspectScores} successionPlans={successionPlans} has360={has360} periodLabel={periodLabel} />}
      {tab === 'kpi' && <KpiTab rows={rows} deptScores={deptScores} monthly={monthly} deptMonthly={deptMonthly} months={months} kpiStandard={kpiStandard} yearLabel={yearLabel} yearMonthly={yearMonthly} yearKpiAvg={yearKpiAvg} />}
      {tab === 'feedback' && <FeedbackTab rows={rows} aspectScores={aspectScores} has360={has360} periodLabel={periodLabel} yearLabel={yearLabel} year360={year360} year360Avg={year360Avg} />}
      {tab === 'table' && <TableTab rows={rows} has360={has360} />}
    </div>
  );
}

/* ───────────────────────── TAB 1 — KOMPILASI (talenta) ───────────────────────── */
const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  approved: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-250', label: '🟢 Disetujui' },
  rejected: { cls: 'bg-rose-50 text-rose-800 border-rose-250', label: '🔴 Ditolak' },
  submitted: { cls: 'bg-blue-50 text-blue-800 border-blue-200', label: '🔵 Diajukan' },
  draft: { cls: 'bg-amber-50 text-amber-800 border-amber-250', label: '🟡 Draf' },
};

function CompilationTab({ rows, deptScores, aspectScores, successionPlans, has360, periodLabel }: {
  rows: Row[]; deptScores: [string, number][]; aspectScores: { aspek: string; score: number }[];
  successionPlans: SuccessionPlan[]; has360: boolean; periodLabel: string;
}) {
  const scored = rows.filter((r) => r.final != null);
  const denom = scored.length || 1;

  // Distribusi Kategori Kinerja & Rencana Tindak Lanjut — band Skor Akhir (ala legacy).
  const band = (min: number, max: number) => scored.filter((r) => (r.final ?? -1) >= min && (r.final ?? -1) < max).length;
  const categories = [
    { label: 'Melampaui Ekspektasi (Skor ≥ 90)', count: band(90, 1e9), color: '#183c6c' },
    { label: 'Memenuhi Ekspektasi (Skor 80–89)', count: band(80, 90), color: '#388e3c' },
    { label: 'Perlu Peningkatan (Skor 70–79)', count: band(70, 80), color: '#ffc107' },
    { label: 'Di Bawah Ekspektasi (Skor < 70)', count: band(-1, 70), color: '#b71c1c' },
  ];
  const recommendations = [
    { label: 'Promosi Akselerasi Jabatan', count: band(90, 1e9), color: '#183c6c' },
    { label: 'Pertahankan Posisi & Jalur Bonus', count: band(80, 90), color: '#388e3c' },
    { label: 'Program Workshop & Intervensi', count: band(70, 80), color: '#ffc107' },
    { label: 'Pelatihan Intensif Mutu', count: band(-1, 70), color: '#b71c1c' },
  ];

  // Papan Pertimbangan Suksesi & Promosi — pegawai Skor Akhir ≥ 90 + rencana suksesinya.
  const planById = new Map(successionPlans.map((p) => [p.id, p]));
  const candidates = scored.filter((r) => (r.final ?? 0) >= 90).sort((a, b) => (b.final ?? 0) - (a.final ?? 0));
  const orgAvg = mean(scored.map((r) => r.final ?? 0));
  const aPlayers = rows.filter((r) => r.player === 'A').length;
  const coaching = scored.filter((r) => (r.final ?? 99) < 85).length;
  const dominant = PLAYER_BOXES
    .map((b) => ({ label: b.label, n: rows.filter((r) => r.player === b.key).length }))
    .sort((a, b) => b.n - a.n)[0];

  const boxGroups = new Map<string, Row[]>();
  rows.forEach((r) => { if (r.boxKey) { const a = boxGroups.get(r.boxKey) ?? []; a.push(r); boxGroups.set(r.boxKey, a); } });
  const playerGroups = new Map<PlayerClass, Row[]>();
  rows.forEach((r) => { if (r.player) { const a = playerGroups.get(r.player) ?? []; a.push(r); playerGroups.set(r.player, a); } });

  const top = [...scored].sort((a, b) => (b.final ?? 0) - (a.final ?? 0)).slice(0, 4);
  const bottom = [...scored].filter((r) => (r.final ?? 99) < 85).sort((a, b) => (a.final ?? 99) - (b.final ?? 99)).slice(0, 4);

  const kpiRows = [
    { band: 'hi', label: 'KPI ≥ 90' }, { band: 'mid', label: 'KPI 80–89,99' }, { band: 'lo', label: 'KPI < 80' },
  ] as const;
  const s360Cols = [
    { band: 'hi', label: '360° ≥ 80' }, { band: 'mid', label: '360° 70–79,99' }, { band: 'lo', label: '360° < 70' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Award className="w-6 h-6" />} tint="emerald" value={orgAvg.toFixed(1)} label="Rataan Skor Akhir Organisasi" />
        <Stat icon={<Target className="w-6 h-6" />} tint="blue" value={String(aPlayers)} label="A Player" />
        <Stat icon={<Flame className="w-6 h-6" />} tint="amber" value={String(coaching)} label="Perlu Coaching (<85)" />
        <Stat icon={<TrendingUp className="w-6 h-6" />} tint="indigo" value={dominant?.n ? dominant.label : '—'} label="Kategori Dominan" />
      </div>

      {/* Distribusi Kategori Kinerja + Rencana Tindak Lanjut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="📊 Distribusi Kategori Kinerja"><CountBars items={categories} denom={denom} /></Card>
        <Card title="🎯 Rencana Tindak Lanjut Organisasi"><CountBars items={recommendations} denom={denom} /></Card>
      </div>

      {/* Skor KPI per Divisi + Evaluasi Budaya 360° */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="🏢 Skor KPI Rata-rata per Divisi">
          <div className="space-y-4">
            {deptScores.length === 0 && <p className="text-xs text-gray-500 italic">Belum ada data KPI.</p>}
            {deptScores.map(([dept, score], i) => {
              const hc = heatColor(score);
              return (
                <div key={dept} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-700">{dept}</span>
                    <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: hc.bg, color: hc.fg }}>{score.toFixed(1)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(score, 100)}%` }}
                      transition={{ duration: 1, delay: i * 0.08 }} className="h-full rounded-md" style={{ backgroundColor: hc.bg }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="✨ Evaluasi Budaya 360° (Rataan Sub-Aspek)">
          {!has360 && <p className="text-[11px] text-amber-800 font-semibold mb-3 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">360° nonaktif di {periodLabel} — aspek dari penilaian terkirim (bila ada).</p>}
          <div className="space-y-4">
            {aspectScores.length === 0 && <p className="text-xs text-gray-500 italic">Belum ada skor 360° terkirim.</p>}
            {aspectScores.map((asp, idx) => {
              const hc = heatColor(asp.score);
              return (
                <div key={asp.aspek} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-700">⭐ {asp.aspek}</span>
                    <span className="text-xs font-semibold font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: hc.bg, color: hc.fg }}>{asp.score.toFixed(1)} / 100</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(asp.score, 100)}%` }}
                      transition={{ duration: 1, delay: idx * 0.08 }} className="h-full rounded-md" style={{ backgroundColor: hc.bg }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 9-Box */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Klasifikasi Talenta — Matriks 9-Box (KPI × 360°)</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">Pemetaan {[...boxGroups.values()].reduce((s, a) => s + a.length, 0)} pegawai (KPI &amp; 360° tersedia).</p>
        {!has360 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <span className="text-amber-700 text-sm leading-none mt-0.5">⚠️</span>
            <p className="text-[11px] text-amber-900 font-semibold leading-relaxed">
              {periodLabel} <strong>tanpa Evaluasi 360°</strong> — Matriks 9-Box butuh sumbu 360°. Gunakan Matriks 4-Box di bawah.
            </p>
          </div>
        )}
        <div className="overflow-x-auto">
          <div className="min-w-[660px]">
            <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-2 mb-2">
              <div className="flex items-end justify-center text-[10px] font-bold text-gray-500 uppercase">KPI ↓ / 360° →</div>
              {s360Cols.map((c) => (
                <div key={c.band} className="text-center text-[10px] font-extrabold text-indigo-700 bg-indigo-50/60 rounded-lg py-1.5 border border-indigo-100">{c.label}</div>
              ))}
            </div>
            {kpiRows.map((row) => (
              <div key={row.band} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-2 mb-2 items-stretch">
                <div className="flex items-center justify-center text-[10px] font-extrabold text-emerald-800 bg-emerald-50/60 rounded-lg px-2 border border-emerald-100 text-center">{row.label}</div>
                {s360Cols.map((col) => {
                  const box = TALENT_BOXES.find((b) => b.kpiBand === row.band && b.s360Band === col.band)!;
                  const emps = boxGroups.get(box.key) ?? [];
                  return (
                    <div key={col.band} style={{ borderTopColor: box.color }}
                      className="border border-gray-200 border-t-4 rounded-xl p-2.5 bg-white min-h-[92px] flex flex-col">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[11px] font-extrabold text-slate-800 leading-tight">{box.label}</span>
                        <span className="text-sm font-black font-mono shrink-0" style={{ color: box.color }}>{emps.length}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {emps.map((e) => (
                          <span key={e.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold"
                            title={`${e.name} · KPI ${e.kpiAvg?.toFixed(1)} · 360 ${e.s360?.toFixed(1)}`}>{firstName(e.name)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-gray-500 italic mt-2">Band KPI: ≥90 / 80–89,99 / &lt;80 · Band 360°: ≥80 / 70–79,99 / &lt;70. Pegawai tanpa KPI/360° tidak dihitung.</p>
      </div>

      {/* 4-Box */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Klasifikasi Pemain — Matriks 4-Box (A / B Culture / B KPI / C)</h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-4">Pemetaan {[...playerGroups.values()].reduce((s, a) => s + a.length, 0)} pegawai berdasarkan KPI × 360° (ambang 80).</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PLAYER_BOXES.map((box) => {
            const emps = playerGroups.get(box.key) ?? [];
            return (
              <div key={box.key} style={{ borderTopColor: box.color }}
                className="border border-gray-200 border-t-4 rounded-xl p-3 bg-white min-h-[120px] flex flex-col">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-[13px] font-black text-slate-800 leading-tight">{box.label}</span>
                  <span className="text-lg font-black font-mono shrink-0" style={{ color: box.color }}>{emps.length}</span>
                </div>
                <span className="text-[10px] text-gray-500 font-semibold mt-0.5 leading-tight">{PLAYER_DESC[box.key]}</span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {emps.map((e) => (
                    <span key={e.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold"
                      title={`${e.name} · KPI ${e.kpiAvg?.toFixed(1)} · 360 ${e.s360 != null ? e.s360.toFixed(1) : 'N/A'}`}>{firstName(e.name)}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500 italic mt-2">
          Berbasis KPI × 360° (ambang 80): A = KPI≥80 &amp; 360°≥80 · B Culture = KPI&lt;80 &amp; 360°≥80 ·
          B KPI = KPI≥80 &amp; 360°&lt;80 · C = keduanya &lt;80. Tanpa kelas D.
          {!has360 && <span className="text-amber-700 font-semibold not-italic"> Tanpa 360° → tak ada sumbu budaya, A &amp; B-Culture tidak tersedia.</span>}
        </p>
      </div>

      {/* Papan Pertimbangan Suksesi & Promosi (Skor ≥ 90) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <h3 className="text-xs font-extrabold text-indigo-950 tracking-wider uppercase mb-3 flex items-center gap-1.5">
          <span className="p-1 rounded-md bg-indigo-50 text-indigo-800">🎯</span>
          <span>Papan Pertimbangan Suksesi &amp; Promosi (Skor ≥ 90)</span>
        </h3>
        {candidates.length === 0 ? (
          <p className="text-xs text-gray-500 italic text-center py-6 font-medium">
            Belum ada pegawai dengan Skor Akhir ≥ 90 pada lingkup ini. Rencana suksesi belum diusulkan.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[520px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="py-2.5 px-4 font-extrabold">Nama Pegawai</th>
                  <th className="py-2.5 px-4 text-center font-extrabold">Skor Akhir</th>
                  <th className="py-2.5 px-4 font-extrabold">Rencana Suksesi (Pilihan HRD)</th>
                  <th className="py-2.5 px-4 text-center font-extrabold">Status Direksi</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((e) => {
                  const plan = planById.get(e.id);
                  const badge = plan ? (STATUS_BADGE[plan.status] ?? STATUS_BADGE.draft) : null;
                  return (
                    <tr key={e.id} className="border-b border-gray-100 last:border-none">
                      <td className="py-3 px-4"><div className="font-extrabold text-gray-800 text-sm">{e.name}</div><div className="text-[10px] text-gray-500 font-bold">{e.dept}</div></td>
                      <td className="py-3 px-4 text-center"><span className="font-mono font-black text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded inline-block text-[11px] border border-emerald-100">{e.final?.toFixed(1)}</span></td>
                      <td className="py-3 px-4">{plan ? <span className="font-extrabold text-slate-800 block">{plan.plan}</span> : <span className="text-gray-500 italic">Belum ada rencana — usulkan di menu Promosi &amp; Suksesi</span>}</td>
                      <td className="py-3 px-4 text-center">{badge ? <span className={`inline-block text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span> : <span className="text-gray-300 text-[10px]">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top / bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="🏆 Bintang Performa Utama" tone="emerald">
          <div className="divide-y divide-gray-100">
            {top.length === 0 && <p className="text-xs text-gray-500 italic py-2">Belum ada Skor Akhir.</p>}
            {top.map((e, idx) => (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-emerald-800 w-5">#{idx + 1}</span>
                  <div><span className="font-bold text-gray-800 block text-xs">{e.name}</span><span className="text-[10px] text-gray-500 block">{e.dept}</span></div>
                </div>
                <span className="font-mono font-extrabold text-sm text-emerald-800">{e.final?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="⚠️ Sasaran Mentoring / Coaching" tone="rose">
          <div className="divide-y divide-gray-100">
            {bottom.length === 0 && <p className="text-xs text-gray-500 italic py-2">Tidak ada di bawah 85.</p>}
            {bottom.map((e) => (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-800 font-bold flex items-center justify-center text-[11px]">{e.name.substring(0, 2)}</div>
                  <div><span className="font-bold text-gray-800 block text-xs">{e.name}</span><span className="text-[10px] text-gray-500 block">{e.dept}</span></div>
                </div>
                <span className="font-mono font-extrabold text-sm text-rose-700">{e.final?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────── TAB 2 — ANALISIS KPI ───────────────────────── */
function KpiTab({ rows, deptScores, monthly, deptMonthly, months, kpiStandard, yearLabel, yearMonthly, yearKpiAvg }: { rows: Row[]; deptScores: [string, number][]; monthly: { ym: string; avg: number }[]; deptMonthly: DeptMonthRow[]; months: string[]; kpiStandard: number; yearLabel: number; yearMonthly: { ym: string; avg: number }[]; yearKpiAvg: number | null }) {
  const kpis = rows.map((r) => r.kpiAvg).filter((v): v is number => v != null);
  const avgKpi = mean(kpis);
  const pctOverStd = kpis.length ? (kpis.filter((s) => s >= kpiStandard).length / kpis.length) * 100 : 0;

  const ranked = rows.filter((r) => r.kpiAvg != null).sort((a, b) => (b.kpiAvg ?? 0) - (a.kpiAvg ?? 0));
  const topEmp = ranked[0] ?? null;             // KPI tertinggi (pegawai + skor)
  const lowEmp = ranked.length ? ranked[ranked.length - 1] : null; // KPI terendah
  const top = ranked.slice(0, 6);
  const low = [...ranked].reverse().slice(0, 6);
  const maxMonthly = Math.max(...monthly.map((m) => m.avg), 1);

  return (
    <div className="space-y-6">
      <Banner tone="emerald" tag="Analisis Khusus KPI" title="Analisis Pencapaian KPI Bulanan Organisasi"
        desc="Evaluasi kinerja objektif berdasarkan target kuantitatif bulanan per departemen pada periode aktif." icon={<Award className="w-56 h-56" />} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Stat icon={<Award className="w-6 h-6" />} tint="emerald" value={avgKpi.toFixed(1)} label="Rerata KPI Organisasi" />
        <Stat icon={<Target className="w-6 h-6" />} tint="blue"
          value={topEmp?.kpiAvg != null ? topEmp.kpiAvg.toFixed(1) : '—'} label="Skor KPI Tertinggi" sub={topEmp?.name} />
        <Stat icon={<TrendingDown className="w-6 h-6" />} tint="rose"
          value={lowEmp?.kpiAvg != null ? lowEmp.kpiAvg.toFixed(1) : '—'} label="Skor KPI Terendah" sub={lowEmp?.name} />
        <Stat icon={<TrendingUp className="w-6 h-6" />} tint="indigo" value={`${pctOverStd.toFixed(0)}%`} label={`KPI Di Atas Standar (≥${kpiStandard})`} />
        <Stat icon={<BarChart3 className="w-6 h-6" />} tint="amber" value={`${monthly.length} Bulan`} label="Siklus Penilaian Terpilih" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2"><KpiHeatmap deptMonthly={deptMonthly} months={months} /></div>
        <KpiCategoryPie rows={rows} />
      </div>

      <Card title={`📈 Tren KPI Bulanan ${yearLabel} (Jan–Des)`}>
        <YearTrendCaption value={yearKpiAvg} label={`Rerata KPI ${yearLabel}`} unit="org-level, ikut filter divisi" />
        <TrendLine points={yearMonthly.map((m) => ({ label: ymShort(m.ym), value: m.avg }))} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="🏢 Rerata KPI Bulanan per Divisi">
          <div className="space-y-4">
            {deptScores.length === 0 && <p className="text-xs text-gray-500 italic">Belum ada data KPI.</p>}
            {deptScores.map(([dept, score], i) => {
              const hc = heatColor(score);
              return (
                <div key={dept} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">{dept}</span>
                    <span className="font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: hc.bg, color: hc.fg }}>{score.toFixed(1)} / 100</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-md overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(score, 100)}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 }} className="h-full rounded-md" style={{ backgroundColor: hc.bg }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="📅 Perkembangan KPI Bulanan">
          {monthly.length === 0 ? <p className="text-xs text-gray-500 italic font-bold">Tidak ada data bulan untuk periode ini.</p> : (
            <div className="space-y-4">
              {monthly.map((m, i) => {
                const hc = heatColor(m.avg);
                return (
                  <div key={m.ym} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">{ymLabel(m.ym)}</span>
                      <span className="font-bold font-mono px-2 py-0.5 rounded" style={{ backgroundColor: hc.bg, color: hc.fg }}>{m.avg.toFixed(1)}</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-md overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(m.avg / maxMonthly) * 100}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }} className="h-full rounded-md" style={{ backgroundColor: hc.bg }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Leaderboard title="🏆 Bintang KPI Teratas" tone="emerald" items={top} valueOf={(r) => r.kpiAvg} />
        <Leaderboard title="📈 KPI Terendah / Perlu Bimbingan" tone="rose" items={low} valueOf={(r) => r.kpiAvg} />
      </div>
    </div>
  );
}

/* ───────────────────────── TAB 3 — ANALISIS 360 ───────────────────────── */
function FeedbackTab({ rows, aspectScores, has360, periodLabel, yearLabel, year360, year360Avg }: { rows: Row[]; aspectScores: { aspek: string; score: number }[]; has360: boolean; periodLabel: string; yearLabel: number; year360: { label: string; avg: number }[]; year360Avg: number | null }) {
  const s360s = rows.map((r) => r.s360).filter((v): v is number => v != null);
  const avg360 = mean(s360s);
  const max360 = s360s.length ? Math.max(...s360s) : 0;
  const assessed = s360s.length;
  const ranked = rows.filter((r) => r.s360 != null).sort((a, b) => (b.s360 ?? 0) - (a.s360 ?? 0));

  return (
    <div className="space-y-6">
      {!has360 ? (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-3xs">
          <p className="text-sm font-black text-amber-900">Periode {periodLabel} tanpa Evaluasi 360°</p>
          <p className="text-xs text-amber-800 mt-1">Komponen 360° tidak aktif untuk periode ini, sehingga Skor Akhir = 100% KPI. Data di bawah hanya muncul bila ada penilaian terkirim.</p>
        </div>
      ) : (
        <Banner tone="emerald" tag="Analisis Khusus 360°" title="Analisis Umpan Balik Budaya 360°"
          desc="Capaian aspek budaya organisasi dari rata-rata penilaian terkirim (Self dikecualikan) pada periode aktif." icon={<TrendingUp className="w-56 h-56" />} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat icon={<TrendingUp className="w-6 h-6" />} tint="indigo" value={avg360.toFixed(1)} label="Rerata Skor 360° Organisasi" />
        <Stat icon={<Target className="w-6 h-6" />} tint="blue" value={max360.toFixed(1)} label="Skor 360° Tertinggi" />
        <Stat icon={<Users className="w-6 h-6" />} tint="emerald" value={String(assessed)} label="Pegawai Ternilai 360°" />
      </div>

      <Card title={`📈 Tren 360° per Kuartal ${yearLabel}`}>
        <YearTrendCaption value={year360Avg} label={`Rerata 360° ${yearLabel}`} unit="org-level, ikut filter divisi · hanya kuartal ber-360°" />
        <TrendLine points={year360.map((q) => ({ label: q.label, value: q.avg }))} />
      </Card>

      <Card title="✨ Evaluasi Budaya 360° (Rataan Sub-Aspek)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {aspectScores.length === 0 && <p className="text-xs text-gray-500 italic">Belum ada skor 360° terkirim.</p>}
          {aspectScores.map((asp, idx) => {
            const hc = heatColor(asp.score);
            return (
              <div key={asp.aspek} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">⭐ {asp.aspek}</span>
                  <span className="text-xs font-semibold font-mono px-2 py-0.5 rounded-md" style={{ backgroundColor: hc.bg, color: hc.fg }}>{asp.score.toFixed(1)} / 100</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(asp.score, 100)}%` }}
                    transition={{ duration: 1, delay: idx * 0.08 }} className="h-full rounded-md" style={{ backgroundColor: hc.bg }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Leaderboard title="🌟 360° Teratas" tone="indigo" items={ranked.slice(0, 6)} valueOf={(r) => r.s360} />
        <Leaderboard title="📉 360° Terendah" tone="rose" items={[...ranked].reverse().slice(0, 6)} valueOf={(r) => r.s360} />
      </div>
    </div>
  );
}

/* ───────────────────────── TAB 4 — TABEL ───────────────────────── */
function TableTab({ rows, has360 }: { rows: Row[]; has360: boolean }) {
  const [q, setQ] = useState('');
  const [player, setPlayer] = useState<'all' | PlayerClass>('all');
  const shown = rows.filter((r) => {
    if (q.trim() && !`${r.name} ${r.dept}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (player !== 'all' && r.player !== player) return false;
    return true;
  });
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Tabel Hasil Seluruh Pegawai</h3>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / divisi…"
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
          <select value={player} onChange={(e) => setPlayer(e.target.value as typeof player)}
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white">
            <option value="all">Semua Player</option>
            {PLAYER_BOXES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[640px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3 text-center">Rerata KPI</th>
              <th className="py-2 px-3 text-center">Skor 360°</th>
              <th className="py-2 px-3 text-center">Skor Akhir</th>
              <th className="py-2 px-3">9-Box</th>
              <th className="py-2 pl-3 text-center">Player</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sm text-gray-500">Tidak ada pegawai sesuai filter.</td></tr>}
            {shown.map((r) => {
              const box = r.boxKey ? TALENT_BOXES.find((b) => b.key === r.boxKey) : null;
              return (
                <tr key={r.id}>
                  <td className="py-3 pr-3">
                    <span className="font-bold text-gray-800 block">{r.name}</span>
                    <span className="text-[11px] text-gray-500">{r.dept}</span>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-emerald-700">{r.kpiAvg != null ? r.kpiAvg.toFixed(1) : '—'}</td>
                  <td className="py-3 px-3 text-center font-mono text-indigo-700">{r.s360 != null ? r.s360.toFixed(1) : '—'}</td>
                  <td className="py-3 px-3 text-center font-mono font-black text-slate-800">{r.final != null ? r.final.toFixed(1) : '—'}</td>
                  <td className="py-3 px-3">
                    {box ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border"
                        style={{ color: box.color, borderColor: box.color, backgroundColor: `${box.color}14` }}>{box.label}</span>
                    ) : <span className="text-gray-500 text-xs italic">N/A</span>}
                  </td>
                  <td className="py-3 pl-3 text-center">
                    {r.player ? (
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PLAYER_COLOR[r.player]}`}>{PLAYER_BADGE[r.player]}</span>
                    ) : <span className="text-gray-500 text-xs">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500 italic mt-3">
        Skor Akhir = blend KPI+360 (50/50) − punishment, dikunci periode aktif. 9-Box butuh KPI &amp; 360; N/A bila salah satu belum ada.
        Player (A/B/C) berbasis KPI × 360° (ambang 80).{!has360 && ' Tanpa 360° → A & B-Culture tidak tersedia.'}
      </p>
    </div>
  );
}

/* ───────────────────────── Heatmap KPI / Divisi × Bulan ───────────────────────── */
/** Label bulan ringkas dari 'YYYY-MM' (mis. "Jan"). */
const ymShort = (ym: string) => MONTHS[Number(ym.split('-')[1]) - 1] ?? ym;

/** Keterangan ringkas di atas trendline: angka rerata tahun + konteks lingkup. */
function YearTrendCaption({ value, label, unit }: { value: number | null; label: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <span className="text-2xl font-black text-slate-800 font-mono">{value != null ? value.toFixed(1) : '—'}</span>
      <span className="text-xs font-bold text-gray-600">{label}</span>
      <span className="text-[10px] text-gray-500">· {unit}</span>
    </div>
  );
}

/**
 * Trendline SVG sederhana (garis + titik berlabel) — dipakai untuk tren tahunan KPI/360°.
 * Domain-y adaptif (min−/max+ dibulatkan ke 5, lebar minimal 10) agar variasi terlihat;
 * warna titik mengikuti palet skor terpadu (`heatColor`). Label di dalam SVG sengaja
 * dikecualikan dari audit kontras (lihat CLAUDE.md) — ukuran fixed agar grafik tak berdesakan.
 */
function TrendLine({ points }: { points: { label: string; value: number }[] }) {
  if (points.length === 0) return <p className="text-xs text-gray-500 italic">Belum ada data untuk tahun ini.</p>;
  const W = 640, H = 200, padL = 30, padR = 14, padT = 20, padB = 26;
  const vals = points.map((p) => p.value);
  let lo = Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5);
  let hi = Math.min(100, Math.ceil((Math.max(...vals) + 4) / 5) * 5);
  if (hi - lo < 10) { hi = Math.min(100, lo + 10); lo = Math.max(0, hi - 10); }
  const x = (i: number) => points.length === 1
    ? (padL + W - padR) / 2
    : padL + (i * (W - padL - padR)) / (points.length - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const grid = [lo, (lo + hi) / 2, hi];
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" style={{ height: H }} preserveAspectRatio="xMidYMid meet">
        {grid.map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={padL - 5} y={y(g) + 3} textAnchor="end" fill="#6b7280" fontSize={10}>{g.toFixed(0)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#94a3b8" strokeWidth={2} />
        {points.map((p, i) => {
          const { bg } = heatColor(p.value);
          return (
            <g key={`${p.label}-${i}`}>
              <circle cx={x(i)} cy={y(p.value)} r={4.5} fill={bg} stroke="#fff" strokeWidth={1.5} />
              <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fill="#374151" fontSize={10} fontWeight={700}>{p.value.toFixed(1)}</text>
              <text x={x(i)} y={H - 8} textAnchor="middle" fill="#6b7280" fontSize={10}>{p.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Pie/donut distribusi pegawai per kelas capaian KPI (palet diskrit, lihat CLAUDE.md):
 *   ≥90 Melampaui (biru #183c6c) · 80–89 Memenuhi (hijau #388e3c) ·
 *   70–79 Perlu Peningkatan (kuning #ffc107) · <70 Di Bawah (merah #b71c1c).
 * Klasifikasi memakai rerata KPI pegawai (rows.kpiAvg), bukan Skor Akhir — selaras tab KPI.
 */
const KPI_CATS = [
  { key: 'exceed', label: 'Melampaui Ekspektasi', hint: 'KPI ≥ 90', color: '#183c6c', test: (v: number) => v >= 90 },
  { key: 'meet', label: 'Memenuhi Ekspektasi', hint: 'KPI 80–89', color: '#388e3c', test: (v: number) => v >= 80 && v < 90 },
  { key: 'improve', label: 'Perlu Peningkatan', hint: 'KPI 70–79', color: '#ffc107', test: (v: number) => v >= 70 && v < 80 },
  { key: 'below', label: 'Di Bawah Ekspektasi', hint: 'KPI < 70', color: '#b71c1c', test: (v: number) => v < 70 },
] as const;

function KpiCategoryPie({ rows }: { rows: Row[] }) {
  const kpis = rows.map((r) => r.kpiAvg).filter((v): v is number => v != null);
  const total = kpis.length;
  const counts = KPI_CATS.map((c) => ({ ...c, n: kpis.filter((v) => c.test(v)).length }));
  const R = 52, SW = 22, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col">
      <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Distribusi Kategori KPI</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">Komposisi pegawai per kelas capaian KPI</p>
      {total === 0 ? (
        <p className="text-xs text-gray-500 italic">Belum ada data KPI.</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <svg viewBox="0 0 140 140" className="w-40 h-40 shrink-0">
            <g transform="rotate(-90 70 70)">
              {counts.map((c) => {
                if (c.n === 0) return null;
                const len = (c.n / total) * C;
                const seg = (
                  <circle key={c.key} cx={70} cy={70} r={R} fill="none" stroke={c.color}
                    strokeWidth={SW} strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={-acc} />
                );
                acc += len;
                return seg;
              })}
            </g>
            <text x={70} y={66} textAnchor="middle" fill="#1f2937" fontSize={24} fontWeight={800}>{total}</text>
            <text x={70} y={84} textAnchor="middle" fill="#6b7280" fontSize={9}>Pegawai</text>
          </svg>
          <div className="w-full space-y-1.5">
            {counts.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                <span className="font-semibold text-gray-700 flex-1 leading-tight">{c.label}
                  <span className="text-gray-500 font-normal"> · {c.hint}</span></span>
                <span className="font-mono font-bold text-gray-800">{c.n}</span>
                <span className="font-mono text-gray-500 w-9 text-right">{((c.n / total) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiHeatmap({ deptMonthly, months }: { deptMonthly: DeptMonthRow[]; months: string[] }) {
  if (deptMonthly.length === 0 || months.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight mb-1">Capaian KPI / Divisi</h3>
        <p className="text-xs text-gray-500 italic mt-2">Belum ada data KPI bulanan untuk lingkup ini.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Capaian KPI / Divisi</h3>
          <p className="text-xs text-gray-500 mt-0.5">Rerata skor KPI per divisi</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
          <span>Rendah</span>
          <span className="h-2.5 w-24 rounded-full" style={{ background: HEAT_LEGEND_GRADIENT }} />
          <span>Tinggi</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs min-w-[560px]">
          <thead>
            <tr>
              <th className="text-left py-2 px-3 text-[10px] font-extrabold uppercase tracking-wider text-gray-500 sticky left-0 bg-white">Divisi</th>
              {months.map((ym) => (
                <th key={ym} className="text-center py-2 px-2 text-[10px] font-extrabold uppercase tracking-wider text-gray-500 whitespace-nowrap">{ymLabel(ym)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deptMonthly.map((row) => (
              <tr key={row.dept}>
                <td className="py-2 px-3 font-bold text-slate-700 whitespace-nowrap sticky left-0 bg-white">{row.dept}</td>
                {row.cells.map((c) => {
                  const { bg, fg } = heatColor(c.avg);
                  return (
                    <td key={c.ym} className="text-center font-mono font-bold rounded-md py-2.5 px-2"
                      style={{ backgroundColor: bg, color: fg }}
                      title={`${row.dept} · ${ymLabel(c.ym)} · ${c.avg != null ? c.avg.toFixed(2) : 'tanpa data'}`}>
                      {c.avg != null ? c.avg.toFixed(2) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500 italic mt-3">Sel = rerata KPI seluruh pegawai divisi pada bulan itu (lingkup periode &amp; filter divisi aktif). &ldquo;—&rdquo; = belum ada input KPI.</p>
    </div>
  );
}

/* ───────────────────────── Komponen bersama ───────────────────────── */
const TINT: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  rose: 'bg-rose-50 text-rose-600',
};

function Stat({ icon, tint, value, label, sub }: { icon: React.ReactNode; tint: string; value: string; label: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-xs flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${TINT[tint]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {sub && <div className="text-[11px] font-bold text-gray-600 truncate" title={sub}>{sub}</div>}
      </div>
    </div>
  );
}

/** Bar berlabel + hitung (Distribusi Kategori Kinerja & Rencana Tindak Lanjut). */
function CountBars({ items, denom }: { items: { label: string; count: number; color: string }[]; denom: number }) {
  const max = Math.max(...items.map((c) => c.count), 1);
  return (
    <div className="space-y-4">
      {items.map((it, idx) => (
        <div key={it.label} className="space-y-1">
          <div className="flex justify-between text-xs font-medium text-gray-600">
            <span>{it.label}</span>
            <span className="text-gray-900 font-mono">{it.count} Pegawai ({((it.count / denom) * 100).toFixed(1)}%)</span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(it.count / max) * 100}%` }}
              transition={{ duration: 0.8, delay: idx * 0.1 }} style={{ backgroundColor: it.color }}
              className="h-full rounded-full shadow-inner" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, tone, children }: { title: string; tone?: 'emerald' | 'rose'; children: React.ReactNode }) {
  const head = tone === 'emerald' ? 'text-emerald-800' : tone === 'rose' ? 'text-rose-700' : 'text-gray-800';
  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
      <h4 className={`text-sm font-semibold mb-4 ${head}`}>{title}</h4>
      {children}
    </div>
  );
}

function Banner({ tone, tag, title, desc, icon }: { tone: 'emerald' | 'indigo'; tag: string; title: string; desc: string; icon: React.ReactNode }) {
  const grad = tone === 'emerald' ? 'from-emerald-700 to-teal-800' : 'from-indigo-700 to-blue-800';
  return (
    <div className={`bg-gradient-to-r ${grad} rounded-3xl p-5 sm:p-6 text-white shadow-md relative overflow-hidden`}>
      <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4 scale-150">{icon}</div>
      <div className="relative z-10 space-y-2">
        <span className="px-2.5 py-1 rounded-full bg-white/15 text-white/90 text-[10px] font-extrabold uppercase tracking-wide border border-white/20">{tag}</span>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight">{title}</h2>
        <p className="text-xs sm:text-sm text-white/90 leading-relaxed max-w-3xl">{desc}</p>
      </div>
    </div>
  );
}

function bandBadge(v: number | null) {
  if (v == null) return null;
  const cls = v >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : v >= 80 ? 'bg-blue-50 text-blue-700 border-blue-200'
    : v >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-rose-50 text-rose-700 border-rose-200';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{perfLabelOf(v)}</span>;
}

function Leaderboard({ title, tone, items, valueOf }: { title: string; tone: 'emerald' | 'rose' | 'indigo'; items: Row[]; valueOf: (r: Row) => number | null }) {
  const head = tone === 'emerald' ? 'text-emerald-800' : tone === 'indigo' ? 'text-indigo-800' : 'text-rose-700';
  const chip = tone === 'emerald' ? 'text-emerald-800 bg-emerald-50 border-emerald-150'
    : tone === 'indigo' ? 'text-indigo-800 bg-indigo-50 border-indigo-150' : 'text-rose-800 bg-rose-50 border-rose-150';
  const rowBg = tone === 'rose' ? 'bg-rose-50/10 border-rose-100 border-dashed' : tone === 'indigo' ? 'bg-indigo-50/20 border-indigo-100' : 'bg-emerald-50/20 border-emerald-100';
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
      <h3 className={`text-xs font-bold tracking-wider uppercase mb-4 border-b border-gray-100 pb-2.5 ${head}`}>{title}</h3>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-xs text-gray-500 italic">Belum ada data.</p>}
        {items.map((e, idx) => {
          const v = valueOf(e);
          return (
            <div key={e.id} className={`p-3 rounded-xl border flex items-center justify-between gap-4 ${rowBg}`}>
              <div className="flex items-center gap-3">
                <span className={`font-mono text-xs font-black w-5 ${head}`}>#{idx + 1}</span>
                <div><span className="font-bold text-gray-800 text-xs block">{e.name}</span><span className="text-[10px] text-gray-500 block">{e.dept}</span></div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`font-mono font-black text-xs px-2 py-1 rounded border ${chip}`}>{v != null ? v.toFixed(1) : '—'}</span>
                {bandBadge(v)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
