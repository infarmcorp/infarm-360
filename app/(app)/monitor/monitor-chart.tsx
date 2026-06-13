'use client';

import { useState } from 'react';

export type TrendPoint = { ym: string; label: string; kpi: number; s360: number; final: number };
export type EmpTrend = { id: string; name: string; dept: string; trend: TrendPoint[] };

const xPct = (idx: number, len: number) => (len <= 1 ? 300 : 60 + idx * (480 / (len - 1)));
const yOf = (v: number) => 240 - (v * 200) / 100;

export function MonitorChart({ employees }: { employees: EmpTrend[] }) {
  const [empId, setEmpId] = useState<string>(employees[0]?.id ?? '');
  const [dept, setDept] = useState<string>('all');

  const depts = Array.from(new Set(employees.map((e) => e.dept)));
  const visible = employees.filter((e) => dept === 'all' || e.dept === dept);
  const selected = employees.find((e) => e.id === empId) ?? visible[0] ?? null;
  const trend = selected?.trend ?? [];

  return (
    <div className="space-y-5">
      {/* Filter */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Filter Divisi</label>
          <select value={dept} onChange={(e) => { setDept(e.target.value); }}
            className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer">
            <option value="all">📁 Semua Divisi</option>
            {depts.map((d) => <option key={d} value={d}>🏢 {d}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Pilih Pegawai</label>
          <select value={selected?.id ?? ''} onChange={(e) => setEmpId(e.target.value)}
            className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-indigo-700 focus:outline-none cursor-pointer">
            {visible.length === 0 && <option value="">— tidak ada pegawai —</option>}
            {visible.map((e) => <option key={e.id} value={e.id}>👤 {e.name}</option>)}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-sky-900 uppercase tracking-tight flex items-center gap-2">
              <span>Tren Bulanan: KPI, Evaluasi 360° &amp; Skor Akhir</span>
              <span className="text-[10px] bg-sky-100 text-sky-800 py-0.5 px-2.5 rounded-full font-bold">{trend.length} Bulan</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {selected ? selected.name : '—'} · KPI per bulan, 360° dari kuartal terkait, Skor Akhir (bobot 50/50 − punishment).
            </p>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-600 font-bold uppercase tracking-wider">
            <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t-2 border-dashed border-emerald-500 inline-block" /><span>KPI</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t-2 border-dashed border-indigo-400 inline-block" /><span>360°</span></div>
            <div className="flex items-center gap-1.5"><span className="w-4 h-1 bg-sky-500 rounded-full inline-block" /><span>Skor Akhir</span></div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 min-h-[300px] flex items-end overflow-x-auto">
          {trend.length > 0 ? (
            <svg width="100%" height="280" viewBox="0 0 600 280" className="overflow-visible font-sans min-w-[520px]">
              {[0, 25, 50, 75, 100].map((val) => {
                const y = yOf(val);
                return (
                  <g key={val} className="opacity-80">
                    <line x1="45" y1={y} x2="570" y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
                    <text x="12" y={y + 4} className="fill-gray-400 font-mono font-bold text-[10px]">{val}</text>
                  </g>
                );
              })}
              {(() => {
                const kpiPts: string[] = [], s360Pts: string[] = [], finalPts: string[] = [];
                trend.forEach((h, idx) => {
                  const x = xPct(idx, trend.length);
                  kpiPts.push(`${x},${yOf(h.kpi)}`);
                  s360Pts.push(`${x},${yOf(h.s360)}`);
                  finalPts.push(`${x},${yOf(h.final)}`);
                });
                return (
                  <>
                    {trend.length > 1 && (
                      <>
                        <polyline points={kpiPts.join(' ')} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4,4" />
                        <polyline points={s360Pts.join(' ')} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4,4" />
                        <polyline points={finalPts.join(' ')} fill="none" stroke="#0ea5e9" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                      </>
                    )}
                    {trend.map((h, idx) => {
                      const x = xPct(idx, trend.length);
                      const finalY = yOf(h.final);
                      return (
                        <g key={h.ym} className="group cursor-pointer">
                          <line x1={x} y1="40" x2={x} y2="240" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2" className="opacity-0 group-hover:opacity-60 transition-opacity" />
                          <circle cx={x} cy={finalY} r="7" className="fill-sky-500 stroke-white stroke-2" />
                          <circle cx={x} cy={finalY} r="3.5" className="fill-white" />
                          <circle cx={x} cy={yOf(h.kpi)} r="5" className="fill-emerald-400 stroke-white stroke-1" />
                          <circle cx={x} cy={yOf(h.s360)} r="5" className="fill-indigo-400 stroke-white stroke-1" />
                          <text x={x} y="260" textAnchor="middle" className="fill-slate-600 font-bold text-[10px]">{h.label}</text>
                          <g className="invisible group-hover:visible transition-all duration-200">
                            <rect x={x - 75} y={Math.max(10, finalY - 80)} width="150" height="65" rx="8" className="fill-slate-900" />
                            <text x={x} y={Math.max(10, finalY - 80) + 16} textAnchor="middle" className="fill-white text-[10px] font-black">{h.label}</text>
                            <text x={x} y={Math.max(10, finalY - 80) + 29} textAnchor="middle" className="fill-emerald-400 text-[9px] font-bold">KPI: {h.kpi.toFixed(1)}</text>
                            <text x={x} y={Math.max(10, finalY - 80) + 42} textAnchor="middle" className="fill-indigo-300 text-[9px] font-bold">360°: {h.s360 > 0 ? h.s360.toFixed(1) : '—'}</text>
                            <text x={x} y={Math.max(10, finalY - 80) + 55} textAnchor="middle" className="fill-sky-300 text-[10px] font-black">Skor Akhir: {h.final.toFixed(1)}</text>
                          </g>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          ) : (
            <div className="w-full text-center text-xs text-gray-400 italic py-20">Belum ada data bulanan untuk pegawai ini.</div>
          )}
        </div>

        {/* Tabel ringkas */}
        {trend.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-2 pr-3">Bulan</th>
                  <th className="py-2 px-3 text-center">KPI</th>
                  <th className="py-2 px-3 text-center">360°</th>
                  <th className="py-2 pl-3 text-center">Skor Akhir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trend.map((h) => (
                  <tr key={h.ym}>
                    <td className="py-2 pr-3 font-semibold text-gray-700">{h.label}</td>
                    <td className="py-2 px-3 text-center font-mono text-emerald-700">{h.kpi.toFixed(1)}</td>
                    <td className="py-2 px-3 text-center font-mono text-indigo-700">{h.s360 > 0 ? h.s360.toFixed(1) : '—'}</td>
                    <td className="py-2 pl-3 text-center font-mono font-black text-sky-700">{h.final.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
