'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSpvAcc } from './actions';

export function AccButton({ employeeId, acc, hasReport }: { employeeId: string; acc: boolean; hasReport: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setErr(null);
    const res = await setSpvAcc(employeeId, !acc);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    router.refresh();
  }

  if (!hasReport) return <span className="text-[10px] text-gray-400 italic">menunggu HRD</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={busy} onClick={toggle}
        className={`text-[11px] font-bold px-2.5 py-1 rounded border disabled:opacity-50 ${
          acc ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}>
        {busy ? '…' : acc ? '✔ ACC (batalkan)' : 'Beri ACC'}
      </button>
      {err && <span className="text-[10px] text-rose-600 max-w-[150px] text-right">{err}</span>}
    </div>
  );
}
