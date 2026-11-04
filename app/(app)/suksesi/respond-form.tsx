'use client';

import { useState, useTransition } from 'react';
import { FIELD } from '@/components/infarm-ui';
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
        className={`${FIELD} w-full py-2 disabled:bg-neutral-tint`}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => decide('approved')} disabled={pending}
          className="inline-flex items-center justify-center min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white text-[13px] font-bold disabled:opacity-60">
          Setujui
        </button>
        <button type="button" onClick={() => decide('rejected')} disabled={pending}
          className="inline-flex items-center justify-center min-h-9 px-4 rounded-xl border border-line bg-surface text-danger-ink text-[13px] font-semibold hover:border-danger-ink disabled:opacity-60">
          Tolak
        </button>
      </div>
      {msg && <p className="text-xs font-semibold text-danger-ink">{msg}</p>}
    </div>
  );
}
