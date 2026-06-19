'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveOrFinalizeReport } from './actions';

export function ReportRowActions({ employeeId, canCompute }: { employeeId: string; canCompute: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'draft' | 'final' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(finalize: boolean) {
    setBusy(finalize ? 'final' : 'draft');
    setErr(null);
    const res = await saveOrFinalizeReport(employeeId, finalize);
    setBusy(null);
    if (!res.ok) { setErr(res.error); return; }
    router.refresh();
  }

  if (!canCompute) {
    return <span className="text-[10px] text-gray-500 italic">KPI kosong</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button type="button" disabled={busy !== null} onClick={() => run(false)}
          className="text-[11px] font-bold px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {busy === 'draft' ? '…' : 'Draf'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => run(true)}
          className="text-[11px] font-bold px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
          {busy === 'final' ? '…' : 'Finalisasi'}
        </button>
      </div>
      {err && <span className="text-[10px] text-rose-600 max-w-[140px] text-right">{err}</span>}
    </div>
  );
}
