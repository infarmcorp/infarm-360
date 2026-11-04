'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { CARD, FIELD, FIELD_LABEL } from '@/components/infarm-ui';

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
    <div className={`${CARD} grid grid-cols-1 sm:grid-cols-3 gap-3`}>
      <label className="block">
        <span className={FIELD_LABEL}>Periode</span>
        <select
          value={current}
          disabled={pending}
          onChange={(e) => {
            const p = new URLSearchParams(sp.toString());
            p.set('period', e.target.value);
            start(() => router.push(`${basePath}?${p.toString()}`));
          }}
          className={`${FIELD} w-full disabled:opacity-60`}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.label}{p.status === 'active' ? ' (aktif)' : ''}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
