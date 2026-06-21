'use client';

import { useRouter } from 'next/navigation';

type PeriodOpt = { id: string; label: string; status: string; year: number };

/**
 * Filter Dashboard (server-side via searchParams): pilih Tahun, Periode/Kuartal & Divisi.
 * Mengubah salah satu menavigasi `/admin/dashboard?period=&dept=` agar SELURUH chart
 * (KPI, 360°, talenta, tabel) dihitung ulang konsisten untuk lingkup terpilih.
 *
 * Tahun = filter bantu murni-klien yang mempersempit daftar periode (mis. hanya kuartal 2026).
 * Tahun aktual diturunkan dari periode terpilih (`currentPeriod`) — tak ada searchParam baru.
 */
export function DashboardFilters({
  periods, depts, currentPeriod, currentDept,
}: {
  periods: PeriodOpt[];
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

  // Daftar tahun (desc) + tahun terpilih = tahun dari periode aktif.
  const years = [...new Set(periods.map((p) => p.year).filter((y) => y > 0))].sort((a, b) => b - a);
  const currentYear = periods.find((p) => p.id === currentPeriod)?.year ?? years[0] ?? 0;
  const yearPeriods = periods.filter((p) => p.year === currentYear);

  // Ganti tahun → lompat ke periode tahun itu (utamakan yang aktif, jika tidak ambil teratas).
  const onYear = (year: number) => {
    const inYear = periods.filter((p) => p.year === year);
    const target = inYear.find((p) => p.status === 'active') ?? inYear[0];
    if (target) go(target.id, currentDept);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
      <div className="space-y-1.5">
        <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Tahun</label>
        <select value={currentYear} onChange={(e) => onYear(Number(e.target.value))}
          className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer">
          {years.length === 0 && <option value={0}>—</option>}
          {years.map((y) => <option key={y} value={y}>🗓️ {y}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Periode / Kuartal</label>
        <select value={currentPeriod} onChange={(e) => go(e.target.value, currentDept)}
          className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer">
          {yearPeriods.map((p) => (
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
