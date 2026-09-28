'use client';

import { useState, useTransition } from 'react';
import { requestMappingRemoval } from './request-actions';
import { Modal, ModalActions } from './modal';

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
    return <span className="text-[10px] font-bold text-warn-ink bg-warn-tint border border-warn-ink/25 px-2 py-0.5 rounded-control">Menunggu HRD</span>;
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
        className="text-[11px] font-semibold text-ink-faint hover:text-danger-ink hover:underline">
        Ajukan Hapus
      </button>

      <Modal open={open} title="Ajukan Hapus Pemetaan" busy={busy} onClose={close}>
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
        <ModalActions busy={busy} confirmLabel="Kirim Pengajuan" onCancel={close} onConfirm={submit} />
      </Modal>
    </>
  );
}
