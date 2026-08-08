'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/** Dropdown pilih periode untuk Monitor Kinerja → mengatur scorecard + tabel (snapshot periode).
 *  `basePath` (default `/monitor`) — jalur navigasi; `/admin/monitor` untuk versi HRD Admin. */
export function PeriodFilter({ periods, current, basePath = '/monitor' }: {
  periods: { id: string; label: string; status?: string }[];
  current: string;
  basePath?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <span className="font-semibold text-ink-soft">Periode</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          p.set('period', e.target.value);
          start(() => router.push(`${basePath}?${p.toString()}`));
        }}
        className="px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-60"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>{p.label}{p.status === 'active' ? ' (aktif)' : ''}</option>
        ))}
      </select>
    </label>
  );
}
