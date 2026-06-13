'use client';

import { motion } from 'motion/react';
import { Award, Target, Flame, TrendingUp } from 'lucide-react';
import {
  TALENT_BOXES, PLAYER_BOXES, type PlayerClass,
} from '@/lib/scoring';

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

type Props = {
  rows: Row[];
  deptScores: [string, number][];
  aspectScores: { aspek: string; score: number }[];
  has360: boolean;
  periodLabel: string;
};

const PLAYER_DESC: Record<PlayerClass, string> = {
  A: 'Skor ≥90 · KPI ≥90 · 360° ≥80',
  B: 'Skor Akhir ≥ 80',
  C: 'Skor Akhir 70–79,99',
  D: 'Skor Akhir < 70',
};

const firstName = (n: string) => n.split(' ')[0];

export function DashboardVisual({ rows, deptScores, aspectScores, has360, periodLabel }: Props) {
  const scored = rows.filter((r) => r.final != null);
  const orgAvg = scored.length ? scored.reduce((s, r) => s + (r.final ?? 0), 0) / scored.length : 0;
  const aPlayers = rows.filter((r) => r.player === 'A').length;
  const coaching = scored.filter((r) => (r.final ?? 99) < 85).length;
  const dominant = (['A', 'B', 'C', 'D'] as PlayerClass[])
    .map((k) => ({ k, n: rows.filter((r) => r.player === k).length }))
    .sort((a, b) => b.n - a.n)[0];

  // Grup 9-Box & 4-Box.
  const boxGroups = new Map<string, Row[]>();
  rows.forEach((r) => { if (r.boxKey) { const a = boxGroups.get(r.boxKey) ?? []; a.push(r); boxGroups.set(r.boxKey, a); } });
  const playerGroups = new Map<PlayerClass, Row[]>();
  rows.forEach((r) => { if (r.player) { const a = playerGroups.get(r.player) ?? []; a.push(r); playerGroups.set(r.player, a); } });

  const top = [...scored].sort((a, b) => (b.final ?? 0) - (a.final ?? 0)).slice(0, 4);
  const bottom = [...scored].filter((r) => (r.final ?? 99) < 85).sort((a, b) => (a.final ?? 99) - (b.final ?? 99)).slice(0, 4);

  const kpiRows = [
    { band: 'hi', label: 'KPI ≥ 90' },
    { band: 'mid', label: 'KPI 80–89,99' },
    { band: 'lo', label: 'KPI < 80' },
  ] as const;
  const s360Cols = [
    { band: 'hi', label: '360° ≥ 80' },
    { band: 'mid', label: '360° 70–79,99' },
    { band: 'lo', label: '360° < 70' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Stat mini grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Award className="w-6 h-6" />} tint="emerald" value={orgAvg.toFixed(1)} label="Rataan Skor Akhir Organisasi" />
        <Stat icon={<Target className="w-6 h-6" />} tint="blue" value={String(aPlayers)} label="A Player" />
        <Stat icon={<Flame className="w-6 h-6" />} tint="amber" value={String(coaching)} label="Perlu Coaching (<85)" />
        <Stat icon={<TrendingUp className="w-6 h-6" />} tint="indigo" value={dominant?.n ? `${dominant.k} Player` : '—'} label="Kategori Dominan" />
      </div>

      {/* Bar: distribusi kategori (player) + departemen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2"><span>📊</span> Distribusi Kategori Pemain</h4>
          <div className="space-y-4">
            {PLAYER_BOXES.map((b, idx) => {
              const count = playerGroups.get(b.key)?.length ?? 0;
              const denom = scored.length || 1;
              const max = Math.max(...PLAYER_BOXES.map((p) => playerGroups.get(p.key)?.length ?? 0), 1);
              return (
                <div key={b.key} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-gray-600">
                    <span>{b.label}</span>
                    <span className="text-gray-900 font-mono">{count} Pegawai ({((count / denom) * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(count / max) * 100}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.1 }} style={{ backgroundColor: b.color }}
                      className="h-full rounded-full shadow-inner" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2"><span>🏢</span> Skor KPI Rata-rata per Departemen</h4>
          <div className="space-y-4">
            {deptScores.length === 0 && <p className="text-xs text-gray-400 italic">Belum ada data KPI.</p>}
            {deptScores.map(([dept, score], idx) => (
              <div key={dept} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-700">{dept}</span>
                  <span className="text-xs font-bold text-emerald-800 font-mono bg-emerald-50 px-2 py-0.5 rounded-md">{score.toFixed(1)}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(score, 100)}%` }}
                    transition={{ duration: 1, delay: idx * 0.08 }} className="h-full bg-emerald-600 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar: sub-aspek 360 */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs relative overflow-hidden">
        <h4 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2"><span>✨</span> Evaluasi Budaya 360° (Rataan Sub-Aspek)</h4>
        {!has360 && (
          <div className="mb-4 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-[11px] text-amber-900 font-semibold">360° nonaktif di {periodLabel} — aspek di bawah dari penilaian yang sudah terkirim (jika ada).</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {aspectScores.length === 0 && <p className="text-xs text-gray-400 italic">Belum ada skor 360° terkirim.</p>}
          {aspectScores.map((asp, idx) => {
            const c = asp.score >= 90 ? 'bg-indigo-600' : asp.score >= 80 ? 'bg-indigo-500' : 'bg-amber-500';
            return (
              <div key={asp.aspek} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">⭐ {asp.aspek}</span>
                  <span className="text-xs font-semibold text-indigo-900 font-mono bg-indigo-50 px-2 py-0.5 rounded-md">{asp.score.toFixed(1)} / 100</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-md overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(asp.score, 100)}%` }}
                    transition={{ duration: 1, delay: idx * 0.08 }} className={`h-full rounded-md ${c}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 9-Box grid */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Klasifikasi Talenta — Matriks 9-Box (KPI × 360°)</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-4">Pemetaan {[...boxGroups.values()].reduce((s, a) => s + a.length, 0)} pegawai (KPI &amp; 360° tersedia).</p>
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
              <div className="flex items-end justify-center text-[9px] font-bold text-gray-400 uppercase">KPI ↓ / 360° →</div>
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
                        {emps.slice(0, 4).map((e) => (
                          <span key={e.id} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold"
                            title={`${e.name} · KPI ${e.kpiAvg?.toFixed(1)} · 360 ${e.s360?.toFixed(1)}`}>{firstName(e.name)}</span>
                        ))}
                        {emps.length > 4 && <span className="text-[9px] text-gray-400 font-bold self-center">+{emps.length - 4}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-gray-400 italic mt-2">Band KPI: ≥90 / 80–89,99 / &lt;80 · Band 360°: ≥80 / 70–79,99 / &lt;70. Pegawai tanpa KPI/360° tidak dihitung.</p>
      </div>

      {/* 4-Box cards */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Klasifikasi Pemain — Matriks 4-Box (A / B / C / D Player)</h3>
        <p className="text-xs text-gray-400 mt-0.5 mb-4">Pemetaan {[...playerGroups.values()].reduce((s, a) => s + a.length, 0)} pegawai berdasarkan Skor Akhir.</p>
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
                <span className="text-[9px] text-gray-400 font-semibold mt-0.5 leading-tight">{PLAYER_DESC[box.key]}</span>
                <div className="mt-2 flex flex-wrap gap-1">
                  {emps.slice(0, 6).map((e) => (
                    <span key={e.id} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold"
                      title={`${e.name} · Skor ${e.final?.toFixed(1)} · KPI ${e.kpiAvg?.toFixed(1)} · 360 ${e.s360 != null ? e.s360.toFixed(1) : 'N/A'}`}>{firstName(e.name)}</span>
                  ))}
                  {emps.length > 6 && <span className="text-[9px] text-gray-400 font-bold self-center">+{emps.length - 6}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 italic mt-2">
          A: Skor ≥90 &amp; KPI ≥90 &amp; 360° ≥80 · B: ≥80 · C: ≥70 · D: &lt;70.
          {!has360 && <span className="text-amber-700 font-semibold not-italic"> Tanpa 360° → Skor Akhir = 100% KPI, A Player tidak tersedia.</span>}
        </p>
      </div>

      {/* Top / bottom performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <h3 className="text-xs font-bold text-emerald-800 tracking-wider uppercase mb-3 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-emerald-50 text-emerald-800">🏆</span><span>Bintang Performa Utama</span>
          </h3>
          <div className="divide-y divide-gray-100">
            {top.length === 0 && <p className="text-xs text-gray-400 italic py-2">Belum ada Skor Akhir.</p>}
            {top.map((e, idx) => (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-emerald-800 w-5">#{idx + 1}</span>
                  <div>
                    <span className="font-bold text-gray-800 block text-xs">{e.name}</span>
                    <span className="text-[10px] text-gray-400 block">{e.dept}</span>
                  </div>
                </div>
                <span className="font-mono font-extrabold text-sm text-emerald-800">{e.final?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
          <h3 className="text-xs font-bold text-rose-700 tracking-wider uppercase mb-3 flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-rose-50 text-rose-700">⚠️</span><span>Sasaran Mentoring / Coaching</span>
          </h3>
          <div className="divide-y divide-gray-100">
            {bottom.length === 0 && <p className="text-xs text-gray-400 italic py-2">Tidak ada di bawah 85.</p>}
            {bottom.map((e) => (
              <div key={e.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-800 font-bold flex items-center justify-center text-[11px]">{e.name.substring(0, 2)}</div>
                  <div>
                    <span className="font-bold text-gray-800 block text-xs">{e.name}</span>
                    <span className="text-[10px] text-gray-400 block">{e.dept}</span>
                  </div>
                </div>
                <span className="font-mono font-extrabold text-sm text-rose-700">{e.final?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const TINT: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
};

function Stat({ icon, tint, value, label }: { icon: React.ReactNode; tint: string; value: string; label: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-xs flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${TINT[tint]}`}>{icon}</div>
      <div>
        <div className="text-2xl font-semibold text-gray-800">{value}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  );
}
