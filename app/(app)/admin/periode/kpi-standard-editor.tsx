'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setKpiStandard } from './actions';
import { FIELD } from '@/components/infarm-ui';

/**
 * Editor inline Standar/Target KPI periode (metrik dashboard "% di atas standar").
 * Murni pelaporan — tidak memengaruhi rumus skor. Simpan saat blur/Enter bila berubah.
 */
export function KpiStandardEditor({ periodId, value }: { periodId: string; value: number }) {
  const router = useRouter();
  const [val, setVal] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0 || n > 100) { setErr('0–100'); setVal(String(value)); return; }
    if (n === value) { setErr(null); return; }
    setBusy(true); setErr(null);
    const res = await setKpiStandard(periodId, n);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); setVal(String(value)); return; }
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className="inline-flex items-center gap-1">
        <span className="text-[12px] text-ink-soft">≥</span>
        <input
          type="number"
          min={0}
          max={100}
          value={val}
          disabled={busy}
          aria-label="Standar KPI periode"
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className={`${FIELD} w-16 text-center data-value disabled:opacity-50`}
        />
      </div>
      {err && <span className="text-[12px] text-danger-ink">{err}</span>}
    </div>
  );
}
