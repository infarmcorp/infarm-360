'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMapping } from './actions';

export function DeleteButton({ mappingId }: { mappingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    const res = await deleteMapping(mappingId);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button type="button" disabled={busy} onClick={run}
        className="text-[11px] font-bold px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
        {busy ? '…' : 'Hapus'}
      </button>
      {err && <span className="text-[10px] text-rose-600" role="alert">{err}</span>}
    </div>
  );
}
