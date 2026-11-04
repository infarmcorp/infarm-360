'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/button';
import { CARD, CardTitle } from '@/components/infarm-ui';
import { callAction } from '@/lib/call-action';
import { approveAsHrd } from './actions';

/**
 * Aksi HRD (posisi HRD, Mode Admin): Setujui (HRD) saat Menunggu HRD — termasuk atas rencana sendiri. Tidak ada
 * "Buka Kembali": setelah atasan menyetujui, rencana tak bisa dikembalikan (keputusan pemilik 2026-11-03).
 */
export function HrdBar({ planId }: { planId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className={`${CARD} flex flex-wrap items-center gap-3`}>
      <CardTitle icon={ShieldCheck} className="mr-auto">Aksi HRD</CardTitle>
      {err && <span className="text-xs text-danger-ink font-semibold w-full sm:w-auto">{err}</span>}
      <Button size="sm" className="min-h-9" disabled={busy} onClick={() => {
        setErr(null);
        start(async () => {
          const r = await callAction(() => approveAsHrd(planId));
          if (!r.ok) { setErr(r.error); return; }
          router.refresh();
        });
      }}>
        <Check className="w-3.5 h-3.5" /> Setujui (HRD)
      </Button>
    </div>
  );
}
