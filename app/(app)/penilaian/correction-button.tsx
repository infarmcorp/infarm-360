'use client';

import { useState, useTransition } from 'react';
import { requestCorrection } from './correction-actions';
import { Modal, ModalActions } from './modal';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';
import { CHIP_PENDING, FIELD_AREA, LINK_SECONDARY } from './penilaian-ui';

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
    return <span className={CHIP_PENDING}>Koreksi diajukan</span>;
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
      <button type="button" onClick={() => setOpen(true)} className={LINK_SECONDARY}>
        Minta Koreksi
      </button>

      <Modal open={open} title="Koreksi Relasi Kerja" busy={busy} onClose={close}>
        <p className="text-[13px] text-ink-soft leading-relaxed">Ajukan penyesuaian garis hubungan penilaian terhadap <strong>{targetName}</strong>. Akan divalidasi HRD.</p>
        <div>
          <label className={FIELD_LABEL}>Garis Hubungan Saat Ini</label>
          <div className="flex items-center min-h-9 text-[13px] font-semibold text-ink bg-neutral-tint px-3 rounded-control border border-line">{REL_LABEL[currentRelation] ?? currentRelation}</div>
        </div>
        <div>
          <label className={FIELD_LABEL}>Relasi yang Semestinya</label>
          <select value={newRel} onChange={(e) => setNewRel(e.target.value)} disabled={busy}
            className={`${FIELD} w-full`}>
            {REL_OPTS.map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Alasan Koreksi</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={3}
            placeholder="Mis. 'Beliau bukan atasan saya melainkan rekan sejawat di divisi yang sama.'"
            className={FIELD_AREA} />
        </div>
        {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
        <ModalActions busy={busy} confirmLabel="Kirim Pengajuan" onCancel={close} onConfirm={submit} />
      </Modal>
    </>
  );
}
