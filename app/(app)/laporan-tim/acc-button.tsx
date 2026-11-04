'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSpvAcc } from './actions';
import { callAction, savedAtLabel } from '@/lib/call-action';

export function AccButton({ employeeId, acc, hasReport, canAcc }: { employeeId: string; acc: boolean; hasReport: boolean; canAcc: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Konfirmasi eksplisit "tersimpan pukul …" — bukti di layar bahwa server menerima ACC (lihat lib/call-action.ts).
  const [saved, setSaved] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setErr(null); setSaved(null);
    const res = await callAction(() => setSpvAcc(employeeId, !acc));
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setSaved(`${res.acc ? 'ACC tersimpan' : 'ACC dibatalkan'} pukul ${savedAtLabel()}`);
    router.refresh();
  }

  if (!hasReport) return <span className="text-xs text-ink-soft italic">menunggu HRD</span>;
  // ACC baru terbuka setelah HRD "Rilis ke SPV" (status in_review/finalized). Sebelum itu
  // (masih draf), SPV belum boleh meng-ACC — tegakkan juga di server (setSpvAcc).
  if (!canAcc) return <span className="text-xs text-ink-soft italic">menunggu rilis HRD</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={busy} onClick={toggle}
        className={`text-xs font-bold min-h-9 px-3 rounded-xl border transition-colors disabled:opacity-50 ${
          acc ? 'bg-surface text-brand-ink border-brand-ink hover:bg-brand-tint' : 'bg-brand text-white border-brand hover:bg-brand-ink'
        }`}>
        {busy ? '…' : acc ? '✔ Di-ACC · batalkan' : 'Beri ACC'}
      </button>
      {err && <span className="text-xs font-semibold text-danger-ink max-w-[170px] text-right">{err}</span>}
      {saved && <span className="text-xs text-brand-ink max-w-[170px] text-right">✓ {saved}</span>}
    </div>
  );
}
