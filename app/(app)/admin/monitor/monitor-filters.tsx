'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Filter Monitor Kinerja Pegawai (HRD Admin): Periode + Divisi — keduanya DI SERVER lewat URL
 * (`/admin/monitor?period=&dept=`). Mengubah salah satu menghitung ulang SELURUH tampilan
 * (scorecard · distribusi · tabel · tren · Pergerakan KPI/360° · Sorotan) untuk lingkup terpilih.
 * "Seluruh Divisi" (dept=all) = seluruh pegawai internal.
 */
export function MonitorFilters({
  periods, currentPeriod, depts, currentDept,
}: {
  periods: { id: string; label: string; status: string }[];
  currentPeriod: string;
  depts: string[];
  currentDept: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (period: string, dept: string) => {
    const p = new URLSearchParams();
    p.set('period', period);
    if (dept && dept !== 'all') p.set('dept', dept);
    start(() => router.push(`/admin/monitor?${p.toString()}`));
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <label className="inline-flex items-center gap-2 text-xs">
        <span className="font-semibold text-gray-600">Periode</span>
        <select value={currentPeriod} disabled={pending} onChange={(e) => go(e.target.value, currentDept)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60">
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.label}{p.status === 'active' ? ' (aktif)' : ''}</option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-2 text-xs">
        <span className="font-semibold text-gray-600">Divisi</span>
        <select value={currentDept} disabled={pending} onChange={(e) => go(currentPeriod, e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:opacity-60">
          <option value="all">Seluruh Divisi</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
    </div>
  );
}
