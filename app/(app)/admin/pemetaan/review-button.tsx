'use client';

import { useState, useTransition } from 'react';
import { reviewCorrection } from './actions';

/** Setujui/Tolak permohonan koreksi relasi (HRD). */
export function ReviewButton({ requestId }: { requestId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function decide(decision: 'approved' | 'rejected') {
    setErr(null);
    start(async () => {
      const res = await reviewCorrection(requestId, decision);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => decide('approved')} disabled={busy}
        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">Setujui</button>
      <button type="button" onClick={() => decide('rejected')} disabled={busy}
        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-60">Tolak</button>
      {err && <span className="text-[10px] text-rose-600">{err}</span>}
    </div>
  );
}
