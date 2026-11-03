'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/button';
import { DatePicker } from '@/components/date-picker';
import { callAction, savedAtLabel } from '@/lib/call-action';
import { setPlanWindow } from '@/app/(app)/pengembangan/actions';

/** Pengaturan rencana satu periode laporan: batas "rencana disepakati" (informasi) + tutup/buka. */
export function WindowForm({ periodId, due, closed }: { periodId: string; due: string | null; closed: boolean }) {
  const router = useRouter();
  const [d, setD] = useState(due ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  function save(nextClosed: boolean) {
    setMsg(null);
    start(async () => {
      const r = await callAction(() => setPlanWindow(periodId, nextClosed, d || null));
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: `Tersimpan pukul ${savedAtLabel()}.` });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint mb-1">Batas rencana disepakati</p>
        <DatePicker value={d} onChange={setD} allowClear ariaLabel="Batas rencana disepakati" className="w-44" />
      </div>
      <Button variant="ghost" disabled={busy} onClick={() => save(closed)}>Simpan Batas</Button>
      <Button variant={closed ? 'primary' : 'danger'} disabled={busy} onClick={() => save(!closed)}>
        {closed ? 'Buka Rencana Periode Ini' : 'Tutup Rencana Periode Ini'}
      </Button>
      {msg && <span className={`text-[12px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
    </div>
  );
}
