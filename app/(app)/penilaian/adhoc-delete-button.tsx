'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { removeAdhocTarget } from './adhoc-actions';
import { Modal, ModalActions } from './modal';

/**
 * Tombol hapus target Ad-Hoc (baris ber-`is_adhoc` milik penilai — termasuk pemetaan hasil
 * PERMOHONAN yang disetujui HRD, yang dibuat dengan is_adhoc=true).
 * Nonaktif bila penilaian sudah TERKIRIM (tak boleh dihapus — jaga integritas data).
 *
 * Konfirmasi memakai modal in-app, bukan window.confirm/alert bawaan browser (permintaan
 * pengguna 2026-08-21): dialog bawaan lepas dari design system dan pesan errornya
 * tak terbaca sebagai bagian aplikasi.
 */
export function AdhocDeleteButton({ targetId, targetName, submitted = false }: { targetId: string; targetName: string; submitted?: boolean }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function close() { setOpen(false); setErr(null); }

  function confirm() {
    setErr(null);
    start(async () => {
      const res = await removeAdhocTarget(targetId);
      // sukses → revalidatePath di server menyegarkan daftar.
      if (res.ok) setOpen(false);
      else setErr(res.error);
    });
  }

  if (submitted) {
    return (
      <span
        title="Sudah dikirim — tidak bisa dihapus"
        className="inline-flex items-center gap-1 text-xs font-bold text-ink-faint/50 cursor-not-allowed"
      >
        <Trash2 className="w-3.5 h-3.5" /> Hapus
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Hapus penilaian ad-hoc ini"
        className="inline-flex items-center gap-1 text-xs font-bold text-danger-ink hover:underline"
      >
        <Trash2 className="w-3.5 h-3.5" /> Hapus
      </button>

      <Modal open={open} title="Hapus Penilaian Ad-Hoc" busy={busy} onClose={close}>
        <p className="text-xs text-ink-soft">
          Menghapus <strong>{targetName}</strong> dari daftar penilaian Anda.
          <strong className="text-danger-ink"> Draf yang belum dikirim ikut terhapus</strong> dan tak dapat dipulihkan.
        </p>
        <p className="text-[11px] text-ink-faint">
          Bila rekan ini ditugaskan HRD (bukan tambahan Anda sendiri), pakai <strong>Ajukan Hapus</strong> —
          hanya HRD yang boleh membatalkan penugasan.
        </p>
        {err && <p className="text-[11px] text-danger-ink font-semibold">{err}</p>}
        <ModalActions busy={busy} tone="danger" confirmLabel="Hapus" busyLabel="Menghapus…"
          onCancel={close} onConfirm={confirm} />
      </Modal>
    </>
  );
}
