'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPenalty } from './actions';

export function PenaltyInput({ employeeId, initial }: { employeeId: string; initial: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initial));
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
          onChange={(e) => { setValue(e.target.value); setState('idle'); }}
          aria-label="Poin punishment (0–100)"
          className="w-16 text-xs px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-rose-500"
        />
        <button type="button" disabled={busy} onClick={save}
          className="text-[11px] font-bold px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50">
          {busy ? '…' : 'Simpan'}
        </button>
      </div>
      {state === 'ok' && <span role="status" className="text-[10px] text-emerald-600 font-semibold">tersimpan</span>}
      {state === 'err' && <span role="alert" className="text-[10px] text-rose-600 max-w-[140px] text-right">{err}</span>}
    </div>
  );
}
