'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY } from './penilaian-ui';

/**
 * Kerangka modal bersama halaman Penilaian — markup yang sebelumnya diduplikasi di
 * correction-button & request-remove-button, kini dipakai SEMUA pop-up di halaman ini
 * (Minta Koreksi, Ajukan Hapus, Ajukan Penilaian, Hapus Ad-Hoc) agar satu perubahan
 * gaya berlaku serentak.
 *
 * Terpisah dari components/confirm-dialog.tsx karena pop-up di sini memuat form (alasan, pilihan rekan),
 * bukan sekadar konfirmasi. Gaya Design System Infarm (2026-11-04): kartu putih rounded-card + bayangan
 * mengambang di atas overlay gelap, judul 16px bold, isi 13px.
 */
export function Modal({
  open, title, busy = false, size = 'sm', onClose, children,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  /** 'lg' untuk form berkolom dua (mis. Ajukan Penilaian); 'xl' untuk form panjang (Laporkan Pelanggaran). */
  size?: 'sm' | 'lg' | 'xl';
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Esc = batal (kecuali sedang mengirim, supaya aksi tak tertinggal separuh jalan).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className={`relative bg-surface border border-line rounded-card shadow-[0_8px_32px_rgba(0,0,0,0.18)] w-full ${size === 'xl' ? 'max-w-3xl' : size === 'lg' ? 'max-w-lg' : 'max-w-sm'} max-h-[calc(100vh-2rem)] overflow-y-auto p-5 space-y-3.5 text-left text-[13px]`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-ink leading-snug">{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} className="text-ink-faint hover:text-ink disabled:opacity-40 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Baris aksi baku modal: Batal + satu tombol utama (brand) / destruktif (danger). */
export function ModalActions({
  busy, disabled = false, confirmLabel, busyLabel = 'Mengirim…', tone = 'brand', onCancel, onConfirm,
}: {
  busy: boolean;
  disabled?: boolean;
  confirmLabel: string;
  busyLabel?: string;
  tone?: 'brand' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} disabled={busy} className={BTN_GHOST}>
        Batal
      </button>
      {/* Aksi utama = solid (satu-satunya solid fill yang dibolehkan design system). Nada
          destruktif memakai danger-ink karena token tak punya varian `danger` dasar. */}
      <button type="button" onClick={onConfirm} disabled={busy || disabled}
        className={tone === 'danger' ? BTN_DANGER : BTN_PRIMARY}>
        {busy ? busyLabel : confirmLabel}
      </button>
    </div>
  );
}
