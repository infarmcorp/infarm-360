'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeResult360 } from './actions';

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
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="text-sm font-bold px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white disabled:opacity-60"
      >
        {busy ? 'Menghitung…' : 'Hitung Ulang Skor 360°'}
      </button>
      {msg && (
        <span role="status" className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
