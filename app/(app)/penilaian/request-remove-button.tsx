'use client';

import { useState, useTransition } from 'react';
import { requestMappingRemoval } from './request-actions';
import { Modal, ModalActions } from './modal';
import { FIELD_LABEL } from '@/components/infarm-ui';
import { CHIP_PENDING, FIELD_AREA } from './penilaian-ui';

/**
 * Tombol + modal "Ajukan Hapus": pegawai memberi tahu HRD bahwa sebuah pemetaan tak sesuai
 * (mis. tak pernah bekerja sama dengan orang tersebut). Hanya MENGIRIM permohonan — pemetaan
 * baru hilang setelah HRD menyetujui. (Diaktifkan kembali 2026-09-29.)
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
    return <span className={CHIP_PENDING}>Menunggu HRD</span>;
  }

  function close() { setOpen(false); setErr(null); }

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
        className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-danger-ink hover:underline underline-offset-2">
        Ajukan Hapus
      </button>

      <Modal open={open} title="Ajukan Hapus Pemetaan" busy={busy} onClose={close}>
        <p className="text-[13px] text-ink-soft leading-relaxed">
          Ajukan agar Anda <strong>tidak perlu menilai {targetName}</strong> periode ini. Nama rekan hilang dari daftar setelah HRD menyetujui.
        </p>
        <div>
          <label className={FIELD_LABEL}>Alasan Pengajuan</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={3}
            placeholder="Mis. 'Kami tidak pernah bekerja sama sepanjang kuartal ini, jadi saya tak punya dasar menilai.'"
            className={FIELD_AREA} />
          <p className="text-xs text-ink-soft mt-1">Minimal 5 karakter.</p>
        </div>
        {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
        <ModalActions busy={busy} confirmLabel="Kirim Pengajuan" onCancel={close} onConfirm={submit} />
      </Modal>
    </>
  );
}
