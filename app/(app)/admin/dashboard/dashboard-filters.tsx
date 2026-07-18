'use client';

import { useRouter } from 'next/navigation';

type PeriodOpt = { id: string; label: string; status: string; year: number };

/**
 * Filter Dashboard (server-side via searchParams): Tahun · Periode/Kuartal · Divisi.
 * Mengubah salah satu menavigasi `/admin/dashboard?period=&dept=` agar SELURUH chart dihitung
 * ulang konsisten untuk lingkup terpilih.
 *
 * Scope AGREGAT lewat sentinel di param `period`:
 *  - `all`         → "Semua Tahun" (agregat all-time).
 *  - `year:<YYYY>` → "Semua Kuartal" (agregat 1 tahun).
 *  - <uuid>        → satu kuartal spesifik.
 * Karena via URL, pipeline agregat (termasuk aspek budaya) hanya dihitung saat mode itu dipilih
 * (on-demand) — muat per-kuartal tak terbebani.
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

  const years = [...new Set(periods.map((p) => p.year).filter((y) => y > 0))].sort((a, b) => b - a);

  // Uraikan sentinel scope dari currentPeriod.
  const isAllYears = currentPeriod === 'all';
  const yearFromSentinel = currentPeriod.startsWith('year:') ? Number(currentPeriod.slice(5)) : null;
  const specific = periods.find((p) => p.id === currentPeriod) ?? null;
  const currentYearNum = yearFromSentinel ?? specific?.year ?? years[0] ?? 0;
  const yearValue = isAllYears ? 'all' : String(currentYearNum);
  const allQuarters = isAllYears || yearFromSentinel != null;
  const kuartalValue = allQuarters ? 'all-quarters' : (specific?.id ?? '');
  const yearPeriods = periods.filter((p) => p.year === currentYearNum);

  const onYear = (val: string) => {
    if (val === 'all') { go('all', currentDept); return; }
    const y = Number(val);
    const inYear = periods.filter((p) => p.year === y);
    const target = inYear.find((p) => p.status === 'active') ?? inYear[0];
    if (target) go(target.id, currentDept);
  };
  const onKuartal = (val: string) => {
    if (val === 'all-quarters') { go(`year:${currentYearNum}`, currentDept); return; }
    go(val, currentDept);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-gray-200 rounded-2xl p-4 shadow-xs">
      <div className="space-y-1.5">
        <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Tahun</label>
        <select value={yearValue} onChange={(e) => onYear(e.target.value)}
          className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer">
          {years.length === 0 && <option value={0}>—</option>}
          {years.map((y) => <option key={y} value={y}>🗓️ {y}</option>)}
          <option value="all">📚 Semua Tahun</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="block text-[11px] text-gray-500 font-bold uppercase tracking-wider">Periode / Kuartal</label>
        <select value={kuartalValue} onChange={(e) => onKuartal(e.target.value)} disabled={isAllYears}
          className="w-full text-xs p-2.5 border border-gray-200 rounded-xl font-bold bg-gray-50 text-gray-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          {isAllYears ? (
            <option value="all-quarters">Semua kuartal (semua tahun)</option>
          ) : (
            <>
              {yearPeriods.map((p) => (
                <option key={p.id} value={p.id}>📦 {p.label}{p.status === 'active' ? ' · Aktif' : ''}</option>
              ))}
              <option value="all-quarters">🗂️ Semua Kuartal ({currentYearNum})</option>
            </>
          )}
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
