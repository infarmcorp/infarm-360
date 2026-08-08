'use client';

import { useState, useTransition } from 'react';
import { requestCorrection } from './correction-actions';

const REL_OPTS = ['Atasan', 'Peer', 'Cross', 'Bawahan'];
const REL_LABEL: Record<string, string> = { Atasan: 'Atasan', Peer: 'Rekan (Peer)', Cross: 'Lintas Divisi', Bawahan: 'Bawahan' };

/** Tombol + modal "Minta Koreksi" garis hubungan terhadap satu rekan (penilai). */
export function CorrectionButton({
  mappingId, targetId, targetName, currentRelation, pending,
}: {
  mappingId: string; targetId: string; targetName: string; currentRelation: string; pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newRel, setNewRel] = useState(REL_OPTS.find((r) => r !== currentRelation) ?? 'Peer');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (pending) {
    return <span className="text-[10px] font-bold text-warn-ink bg-warn-tint border border-warn-ink/25 px-2 py-0.5 rounded-control">Koreksi diajukan</span>;
  }

  function submit() {
    setErr(null);
    start(async () => {
      const res = await requestCorrection(mappingId, targetId, currentRelation, newRel, reason);
      if (res.ok) { setOpen(false); setReason(''); }
      else setErr(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-ink-faint hover:text-brand-ink hover:underline">
        Minta Koreksi
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setOpen(false)} />
          <div className="relative bg-surface rounded-panel shadow-xl w-full max-w-sm p-5 space-y-3.5 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-ink uppercase tracking-wide">Koreksi Relasi Kerja</h3>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-ink-faint hover:text-ink-soft">✕</button>
            </div>
            <p className="text-xs text-ink-soft">Ajukan penyesuaian garis hubungan penilaian terhadap <strong>{targetName}</strong>. Akan divalidasi HRD.</p>
            <div>
              <label className="block text-[10px] uppercase font-extrabold text-ink-faint mb-1">Garis Hubungan Saat Ini</label>
              <div className="text-xs font-bold text-ink bg-neutral-tint px-3 py-2.5 rounded-control border border-line">{REL_LABEL[currentRelation] ?? currentRelation}</div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-extrabold text-brand-ink mb-1">Relasi yang Semestinya</label>
              <select value={newRel} onChange={(e) => setNewRel(e.target.value)} disabled={busy}
                className="w-full text-xs p-2.5 border border-line rounded-control bg-surface text-ink font-bold focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
                {REL_OPTS.map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-extrabold text-brand-ink mb-1">Alasan Koreksi</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={3}
                placeholder="Mis. 'Beliau bukan atasan saya melainkan rekan sejawat di divisi yang sama.'"
                className="w-full text-xs p-2.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
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
