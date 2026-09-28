'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setLateWaiver } from './actions';

/**
 * Potongan keterlambatan menilai (−3 Skor 360°) per pegawai + pengecualian HRD (alasan wajib).
 * Tampil hanya bila pegawai punya keterlambatan terhitung atau sudah dikecualikan.
 */
export function LateWaiver({
  employeeId, penalty, waived, waiveReason, lateCount, readOnly,
}: {
  employeeId: string; penalty: number; waived: boolean; waiveReason: string | null; lateCount: number; readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(value: string | null) {
    setBusy(true); setErr(null);
    const res = await setLateWaiver({ employeeId, reason: value });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false); setReason('');
    router.refresh();
  }

  if (lateCount === 0 && !waived) return <span className="text-[11px] text-ink-faint">—</span>;

  return (
    <div className="flex flex-col items-center gap-1">
      {waived ? (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-control border bg-neutral-tint text-ink-soft border-line"
          title={waiveReason ?? ''}>Dikecualikan</span>
      ) : (
        <span className="text-sm font-bold data-value text-danger-ink">−{penalty}</span>
      )}
      {!readOnly && !open && (
        waived
          ? <button type="button" disabled={busy} onClick={() => submit(null)}
              className="text-[10.5px] text-ink-faint hover:text-ink-soft hover:underline disabled:opacity-50">
              {busy ? '…' : 'Cabut pengecualian'}
            </button>
          : <button type="button" onClick={() => setOpen(true)}
              className="text-[10.5px] text-ink-faint hover:text-ink-soft hover:underline">Kecualikan</button>
      )}
      {open && (
        <div className="flex items-center gap-1">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (mis. cuti sakit)"
            maxLength={300} autoFocus
            className="w-40 text-[11px] px-2 py-1 border border-line rounded-control text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => submit(reason)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
            {busy ? '…' : 'Simpan'}
          </button>
          <button type="button" onClick={() => { setOpen(false); setErr(null); }}
            className="text-[11px] text-ink-faint hover:text-ink-soft">Batal</button>
        </div>
      )}
      {err && <span className="text-[10px] text-danger-ink max-w-[180px] text-center">{err}</span>}
    </div>
  );
}
