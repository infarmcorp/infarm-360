'use client';

import { useState, useTransition } from 'react';
import { reviewCorrection } from './actions';

/**
 * Setujui / Tolak permohonan pemetaan (HRD).
 * Menolak WAJIB beralasan: alasannya tampil di panel "Permohonan Saya" milik pengaju, supaya
 * keputusan terbaca dua arah (pengaju memberi alasan, HRD membalas dengan alasan).
 */
export function ReviewButton({ requestId }: { requestId: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, start] = useTransition();

  function approve() {
    setErr(null);
    start(async () => {
      const res = await reviewCorrection(requestId, 'approved');
      if (!res.ok) setErr(res.error);
    });
  }

  function reject() {
    setErr(null);
    start(async () => {
      const res = await reviewCorrection(requestId, 'rejected', reason);
      if (!res.ok) setErr(res.error);
      else { setRejecting(false); setReason(''); }
    });
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-stretch gap-2 w-full sm:w-[260px]">
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={2} autoFocus
          placeholder="Alasan penolakan (min. 5 karakter) — dibaca pengaju…"
          className="w-full text-[11.5px] p-2 border border-danger-ink/30 rounded-control bg-surface focus:outline-none focus:ring-2 focus:ring-danger-tint"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => { setRejecting(false); setErr(null); }} disabled={busy}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-control border border-line text-ink-soft hover:text-ink">Batal</button>
          <button type="button" onClick={reject} disabled={busy || reason.trim().length < 5}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-control bg-danger-ink text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Menolak…' : 'Kirim Penolakan'}
          </button>
        </div>
        {err && <span className="text-[10px] text-danger-ink text-right">{err}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={approve} disabled={busy}
        className="text-[11px] font-semibold px-3 py-1.5 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-60">Setujui</button>
      <button type="button" onClick={() => setRejecting(true)} disabled={busy}
        className="text-[11px] font-semibold px-3 py-1.5 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-60">Tolak</button>
      {err && <span className="text-[10px] text-danger-ink max-w-[180px]">{err}</span>}
    </div>
  );
}
