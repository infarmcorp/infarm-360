'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activatePeriod, endPeriod, toggleHas360 } from './actions';

export function PeriodActions({
  periodId, status, has360,
}: {
  periodId: string; status: 'active' | 'ended'; has360: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-1.5 justify-end">
        {status === 'active' ? (
          <button type="button" disabled={busy} onClick={() => run(() => endPeriod(periodId))}
            className="text-[11px] font-bold px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50">
            Kunci &amp; Akhiri
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => run(() => activatePeriod(periodId))}
            className="text-[11px] font-bold px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            Aktivasi
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => run(() => toggleHas360(periodId, !has360))}
          className="text-[11px] font-bold px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {has360 ? 'Set Tanpa 360°' : 'Aktifkan 360°'}
        </button>
      </div>
      {err && <span className="text-[10px] text-rose-600 max-w-[150px] text-right">{err}</span>}
    </div>
  );
}
