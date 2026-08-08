'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPenalty } from './actions';

export function PenaltyInput({ employeeId, initial }: { employeeId: string; initial: number }) {
  const router = useRouter();
  // Kosong bila belum ada punishment (seperti KPI: kosong ≠ 0) → HRD isi secara sadar.
  const [value, setValue] = useState(initial > 0 ? String(initial) : '');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setState('idle');
    setErr(null);
    const res = await setPenalty({ employeeId, points: value });
    setBusy(false);
    if (res.ok) { setState('ok'); router.refresh(); }
    else { setState('err'); setErr(res.error); }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="number" min={0} max={100} step={0.5}
          value={value}
          placeholder="0"
          onChange={(e) => { setValue(e.target.value); setState('idle'); }}
          className="w-16 text-xs data-value px-2 py-1 border border-line rounded-control text-right text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
        />
        <button type="button" disabled={busy} onClick={save}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
          {busy ? '…' : 'Simpan'}
        </button>
      </div>
      {state === 'ok' && <span className="text-[10px] text-brand-ink font-semibold">tersimpan</span>}
      {state === 'err' && <span className="text-[10px] text-danger-ink max-w-[140px] text-right">{err}</span>}
    </div>
  );
}
