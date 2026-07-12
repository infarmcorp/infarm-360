'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/** Dropdown pilih periode untuk Monitor Kinerja → mengatur scorecard + tabel (snapshot periode). */
export function PeriodFilter({ periods, current }: {
  periods: { id: string; label: string; status?: string }[];
  current: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <span className="font-semibold text-gray-600">Periode</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          p.set('period', e.target.value);
          start(() => router.push(`/monitor?${p.toString()}`));
        }}
        className="px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-60"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>{p.label}{p.status === 'active' ? ' (aktif)' : ''}</option>
        ))}
      </select>
    </label>
  );
}
