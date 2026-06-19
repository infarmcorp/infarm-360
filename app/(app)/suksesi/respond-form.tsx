'use client';

import { useState, useTransition } from 'react';
import { respondPlan } from './actions';

/** Direksi: setujui/tolak rencana suksesi yang diajukan HRD + komentar. */
export function RespondForm({ planId }: { planId: string }) {
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function decide(decision: 'approved' | 'rejected') {
    setMsg(null);
    start(async () => {
      const res = await respondPlan(planId, decision, comment);
      if (!res.ok) setMsg(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={pending}
        rows={2}
        placeholder="Komentar Direksi (opsional)…"
        className="w-full text-xs p-2 border border-gray-200 rounded-lg disabled:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-600"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => decide('approved')} disabled={pending}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
          Setujui
        </button>
        <button type="button" onClick={() => decide('rejected')} disabled={pending}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-60">
          Tolak
        </button>
      </div>
      {msg && <p className="text-[11px] font-semibold text-rose-600" role="alert">{msg}</p>}
    </div>
  );
}
