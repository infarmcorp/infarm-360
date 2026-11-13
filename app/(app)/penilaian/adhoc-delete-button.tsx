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
        className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint cursor-not-allowed"
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
        title="Hapus penilaian tambahan ini"
        className="inline-flex items-center gap-1 text-xs font-semibold text-danger-ink hover:underline underline-offset-2"
      >
        <Trash2 className="w-3.5 h-3.5" /> Hapus
      </button>

      <Modal open={open} title="Hapus Penilaian Tambahan" busy={busy} onClose={close}>
        <p className="text-[13px] text-ink-soft leading-relaxed">
          <strong>{targetName}</strong> akan dihapus dari daftar penilaian Anda, termasuk <strong className="text-danger-ink">draf yang belum dikirim</strong>.
        </p>
        <p className="text-xs text-ink-soft">
          Bila rekan ini ditugaskan HRD, gunakan <strong>Ajukan Hapus</strong> — hanya HRD yang bisa membatalkan penugasan.
        </p>
        {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
        <ModalActions busy={busy} tone="danger" confirmLabel="Hapus" busyLabel="Menghapus…"
          onCancel={close} onConfirm={confirm} />
      </Modal>
    </>
  );
}
