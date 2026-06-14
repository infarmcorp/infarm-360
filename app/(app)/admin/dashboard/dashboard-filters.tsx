'use client';

import { useRouter } from 'next/navigation';

/**
 * Filter Dashboard (server-side via searchParams): pilih Periode/Kuartal & Divisi.
 * Mengubah salah satu menavigasi `/admin/dashboard?period=&dept=` agar SELURUH chart
 * (KPI, 360°, talenta, tabel) dihitung ulang konsisten untuk lingkup terpilih.
 */
export function DashboardFilters({
  periods, depts, currentPeriod, currentDept,
}: {
  periods: { id: string; label: string; status: string }[];
  depts: string[];
  currentPeriod: string;
  currentDept: string;
}) {
  const router = useRouter();
  const go = (period: string, dept: string) => {
    const qs = new URLSearchParams();
    qs.set('period', period);
    if (dept && dept !== 'all') qs.set('dept', dept);
    router.push(`/admin/dashboard?${qs.toString()}`);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
      <div className="space-y-1.5">
        <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Periode / Kuartal</label>
        <select value={currentPeriod} onChange={(e) => go(e.target.value, currentDept)}
          className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer">
          {periods.map((p) => (
            <option key={p.id} value={p.id}>📦 {p.label}{p.status === 'active' ? ' · Aktif' : ''}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Divisi</label>
        <select value={currentDept} onChange={(e) => go(currentPeriod, e.target.value)}
          className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-indigo-700 focus:outline-none cursor-pointer">
          <option value="all">📁 Semua Divisi</option>
          {depts.map((d) => <option key={d} value={d}>🏢 {d}</option>)}
        </select>
      </div>
    </div>
  );
}
