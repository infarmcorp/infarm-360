'use client';

import { useState, useTransition } from 'react';
import { requestCorrection } from './correction-actions';
import { Modal, ModalActions } from './modal';

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

  function close() { setOpen(false); setErr(null); }

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

      <Modal open={open} title="Koreksi Relasi Kerja" busy={busy} onClose={close}>
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
        <ModalActions busy={busy} confirmLabel="Kirim Pengajuan" onCancel={close} onConfirm={submit} />
      </Modal>
    </>
  );
}
