'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMapping, mappingDeleteInfo } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Info = { assessor: string; target: string; relation: string; hasAssessment: boolean; submitted: boolean };

export function DeleteButton({ mappingId }: { mappingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);

  // Klik Hapus → ambil info dulu (apakah pasangan sudah dinilai) → buka konfirmasi.
  async function openConfirm() {
    setBusy(true); setErr(null);
    const res = await mappingDeleteInfo(mappingId);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setInfo(res);
  }

  async function confirmDelete() {
    setBusy(true); setErr(null);
    const res = await deleteMapping(mappingId);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setInfo(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button type="button" disabled={busy} onClick={openConfirm}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50">
        {busy ? '…' : 'Hapus'}
      </button>
      {err && <span className="text-[10px] text-danger-ink">{err}</span>}

      <ConfirmDialog
        open={!!info}
        title="Hapus pemetaan?"
        tone="danger"
        confirmLabel="Hapus"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => { if (!busy) setInfo(null); }}
      >
        {info?.hasAssessment ? (
          <p className="text-left">
            Pasangan <strong>{info.assessor} → {info.target}</strong> (relasi <strong>{info.relation}</strong>){' '}
            {info.submitted ? 'sudah dinilai' : 'punya draf penilaian'}. Menghapus pemetaan akan{' '}
            <strong>SEKALIGUS menghapus penilaian 360°-nya</strong> — hanya di <strong>periode ini</strong>;
            periode sebelumnya tidak terpengaruh. Lanjut?
          </p>
        ) : (
          <p className="text-left">
            Hapus pemetaan <strong>{info?.assessor} → {info?.target}</strong> (relasi {info?.relation})?
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
