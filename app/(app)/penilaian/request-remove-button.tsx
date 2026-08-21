'use client';

import { useState, useTransition } from 'react';
import { requestMappingRemoval } from './request-actions';

/**
 * Tombol + modal "Ajukan Hapus": pegawai memberi tahu HRD bahwa sebuah pemetaan tak sesuai
 * (mis. tak pernah bekerja sama dengan orang tersebut). Hanya MENGIRIM permohonan — pemetaan
 * baru hilang setelah HRD menyetujui.
 */
export function RequestRemoveButton({
  mappingId, targetId, targetName, pending,
}: {
  mappingId: string; targetId: string; targetName: string; pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Satu permohonan pending per rekan (jenis apa pun) — cerminkan aturan server.
  if (pending) {
    return <span className="text-[10px] font-bold text-warn-ink bg-warn-tint border border-warn-ink/25 px-2 py-0.5 rounded-control">Menunggu HRD</span>;
  }

  function submit() {
    setErr(null);
    start(async () => {
      const res = await requestMappingRemoval(mappingId, targetId, reason);
      if (res.ok) { setOpen(false); setReason(''); }
      else setErr(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-ink-faint hover:text-danger-ink hover:underline">
        Ajukan Hapus
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setOpen(false)} />
          <div className="relative bg-surface rounded-panel shadow-xl w-full max-w-sm p-5 space-y-3.5 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-ink uppercase tracking-wide">Ajukan Hapus Pemetaan</h3>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-ink-faint hover:text-ink-soft">✕</button>
            </div>
            <p className="text-xs text-ink-soft">
              Mengajukan agar Anda <strong>tidak perlu menilai {targetName}</strong> pada periode ini.
              Permohonan diperiksa HRD — pemetaan baru hilang setelah disetujui.
            </p>
            <div>
              <label className="block text-[10px] uppercase font-extrabold text-brand-ink mb-1">Alasan Pengajuan</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={3}
                placeholder="Mis. 'Kami tidak pernah bekerja sama sepanjang kuartal ini, jadi saya tak punya dasar menilai.'"
                className="w-full text-xs p-2.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
              <p className="text-[10px] text-ink-faint mt-1">Minimal 5 karakter.</p>
            </div>
            {err && <p className="text-[11px] text-danger-ink font-semibold">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                className="text-xs font-bold text-ink-soft hover:text-ink border border-line px-4 py-2 rounded-control">Batal</button>
              <button type="button" onClick={submit} disabled={busy}
                className="text-xs font-bold text-white bg-brand hover:bg-brand-ink px-4 py-2 rounded-control disabled:opacity-60">
                {busy ? 'Mengirim…' : 'Kirim Pengajuan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
