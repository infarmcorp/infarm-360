'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeResult360 } from './actions';
import { Button } from '@/components/button';

export function RecomputeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await computeResult360();
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Berhasil menghitung ${res.computed} pegawai (${res.periodLabel}).` });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={run} disabled={busy}>
        {busy ? 'Menghitung…' : 'Hitung Ulang Skor 360°'}
      </Button>
      {msg && (
        <span className={`text-[12.5px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
