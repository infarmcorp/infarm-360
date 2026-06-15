'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateIndicator, toggleIndicator } from './actions';

type Ind = { id: string; text: string; is_active: boolean };

export function IndicatorManager({ aspectName, indicators }: { aspectName: string; indicators: Ind[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return false; }
    router.refresh(); return true;
  }

  return (
    <section className="border border-gray-200 rounded-xl p-3">
      <h3 className="text-sm font-extrabold text-emerald-800 mb-2">{aspectName}</h3>
      <div className="space-y-2">
        {indicators.map((ind) => <IndicatorRow key={ind.id} ind={ind} run={run} busy={busy} />)}
        {indicators.length === 0 && <p className="text-xs text-gray-400 italic">Belum ada indikator.</p>}
      </div>
      {err && <p className="text-[10px] text-rose-600 mt-1">{err}</p>}
    </section>
  );
}

function IndicatorRow({ ind, run, busy }: { ind: Ind; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState(ind.text);
  const dirty = text.trim() !== ind.text;
  return (
    <div className={`flex items-center gap-1.5 ${ind.is_active ? '' : 'opacity-50'}`}>
      <input value={text} onChange={(e) => setText(e.target.value)}
        className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      {dirty && (
        <button type="button" disabled={busy} onClick={() => run(() => updateIndicator(ind.id, text))}
          className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50">Simpan</button>
      )}
      <button type="button" disabled={busy} onClick={() => run(() => toggleIndicator(ind.id, !ind.is_active))}
        className="text-[10px] font-bold px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        {ind.is_active ? 'Nonaktif' : 'Aktifkan'}
      </button>
    </div>
  );
}
