'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/button';
import { callAction } from '@/lib/call-action';
import { withdrawMyPlan } from './actions';

/** Tarik Kembali — pemilik, selama Menunggu Atasan: rencana kembali ke Draf (mis. untuk menambah prioritas). */
export function WithdrawButton({ periodId }: { periodId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {err && <span className="text-[12px] text-danger-ink font-semibold mr-auto">{err}</span>}
      <span className="text-[11.5px] text-ink-faint">Atasan belum memutuskan — Anda masih bisa menarik rencana ini untuk diubah.</span>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
        setErr(null);
        start(async () => {
          const r = await callAction(() => withdrawMyPlan(periodId));
          if (!r.ok) { setErr(r.error); return; }
          router.refresh();
        });
      }}>
        <Undo2 className="w-3.5 h-3.5" /> Tarik Kembali
      </Button>
    </div>
  );
}
