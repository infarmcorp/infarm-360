'use client';

import { useEffect } from 'react';

/**
 * Kerangka modal bersama halaman Penilaian — markup yang sebelumnya diduplikasi di
 * correction-button & (bekas) request-remove-button, kini dipakai SEMUA pop-up di
 * halaman ini (Minta Koreksi, Ajukan Penilaian, Hapus Ad-Hoc, Exposure Check) agar
 * satu perubahan gaya berlaku serentak. ("Ajukan Hapus" dinonaktifkan 2026-09-28 —
 * digantikan Exposure Check / Not Eligible.)
 *
 * Sengaja TIDAK memakai components/confirm-dialog.tsx: dialog itu masih memakai palet
 * Tailwind mentah (gray/rose/emerald, rounded-2xl) dari era pra-redesign, sedangkan
 * halaman ini sudah bertoken (surface/ink/line, rounded-panel).
 */
export function Modal({
  open, title, busy = false, size = 'sm', onClose, children,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  /** 'lg' untuk form berkolom dua (mis. Ajukan Penilaian). */
  size?: 'sm' | 'lg';
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
      <div className="absolute inset-0 bg-black/30" onClick={() => !busy && onClose()} />
      <div className={`relative bg-surface rounded-panel shadow-xl w-full ${size === 'lg' ? 'max-w-lg' : 'max-w-sm'} p-5 space-y-3.5 text-left`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-ink uppercase tracking-wide">{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} className="text-ink-faint hover:text-ink-soft">✕</button>
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
      <button type="button" onClick={onCancel} disabled={busy}
        className="text-xs font-bold text-ink-soft hover:text-ink border border-line px-4 py-2 rounded-control disabled:opacity-60">
        Batal
      </button>
      {/* Aksi utama = solid (satu-satunya solid fill yang dibolehkan design system). Nada
          destruktif memakai danger-ink karena token tak punya varian `danger` dasar. */}
      <button type="button" onClick={onConfirm} disabled={busy || disabled}
        className={`text-xs font-bold text-white px-4 py-2 rounded-control disabled:opacity-60 ${
          tone === 'danger' ? 'bg-danger-ink hover:brightness-90' : 'bg-brand hover:bg-brand-ink'
        }`}>
        {busy ? busyLabel : confirmLabel}
      </button>
    </div>
  );
}
