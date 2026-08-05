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
        className="w-full text-xs p-2 border border-line rounded-control bg-surface text-ink disabled:bg-neutral-tint focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => decide('approved')} disabled={pending}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-60">
          Setujui
        </button>
        <button type="button" onClick={() => decide('rejected')} disabled={pending}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-60">
          Tolak
        </button>
      </div>
      {msg && <p className="text-[11px] font-semibold text-danger-ink">{msg}</p>}
    </div>
  );
}
