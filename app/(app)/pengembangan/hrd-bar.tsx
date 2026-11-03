'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/button';
import { callAction } from '@/lib/call-action';
import { approveAsHrd, reopenPlan } from './actions';

/** Aksi HRD (posisi HRD, Mode Admin): Setujui (HRD) saat Menunggu HRD · Buka Kembali (ke Draf) selain Draf. */
export function HrdBar({ planId, canApprove, canReopen }: { planId: string; canApprove: boolean; canReopen: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!canApprove && !canReopen) return null;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setErr(null);
    start(async () => {
      const r = await callAction(fn);
      if (!r.ok) { setErr(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="rounded-panel border border-line bg-neutral-tint p-3 flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] font-semibold text-ink mr-auto">Aksi HRD</span>
      {err && <span className="text-[12px] text-danger-ink font-semibold w-full sm:w-auto">{err}</span>}
      {canReopen && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => reopenPlan(planId))}>
          <RotateCcw className="w-3.5 h-3.5" /> Buka Kembali (ke Draf)
        </Button>
      )}
      {canApprove && (
        <Button size="sm" disabled={busy} onClick={() => run(() => approveAsHrd(planId))}>
          <Check className="w-3.5 h-3.5" /> Setujui (HRD)
        </Button>
      )}
    </div>
  );
}
