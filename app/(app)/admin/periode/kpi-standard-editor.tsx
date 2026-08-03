'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setKpiStandard } from './actions';

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
        <span className="text-[11px] text-ink-faint">≥</span>
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
          className="w-14 text-center text-[13px] font-mono px-1.5 py-1.5 border border-line rounded-control text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-50"
        />
      </div>
      {err && <span className="text-[10px] text-danger-ink">{err}</span>}
    </div>
  );
}
