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

  // Design System Infarm: kartu putih r-16 + bayangan tipis; select berlatar hijau keputihan, tinggi ≥44px.
  const selectCls = 'w-full text-[13px] min-h-9 px-3 py-2.5 border border-line rounded-control font-semibold bg-infarm-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand-tint focus:outline-none cursor-pointer';
  const labelCls = 'block text-xs font-semibold text-ink-soft';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface rounded-card shadow-card p-5">
      <div className="space-y-1.5">
        <label htmlFor="dash-tahun" className={labelCls}>Tahun</label>
        <select id="dash-tahun" value={yearValue} onChange={(e) => onYear(e.target.value)} className={selectCls}>
          {years.length === 0 && <option value={0}>—</option>}
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="all">Semua Tahun</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="dash-periode" className={labelCls}>Periode / Kuartal</label>
        <select id="dash-periode" value={kuartalValue} onChange={(e) => onKuartal(e.target.value)} disabled={isAllYears}
          className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}>
          {isAllYears ? (
            <option value="all-quarters">Semua kuartal (semua tahun)</option>
          ) : (
            <>
              {yearPeriods.map((p) => (
                <option key={p.id} value={p.id}>{p.label}{p.status === 'active' ? ' · Aktif' : ''}</option>
              ))}
              <option value="all-quarters">Semua Kuartal ({currentYearNum})</option>
            </>
          )}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="dash-divisi" className={labelCls}>Divisi</label>
        <select id="dash-divisi" value={currentDept} onChange={(e) => go(currentPeriod, e.target.value)} className={selectCls}>
          <option value="all">Semua Divisi</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    </div>
  );
}
