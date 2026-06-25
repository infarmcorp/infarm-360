'use client';

import { useEffect } from 'react';

/**
 * Dialog konfirmasi in-app (pengganti window.confirm bawaan browser) — tampilan
 * bergaya aplikasi: overlay + kartu, tombol Batal/konfirmasi. Esc & klik luar = batal.
 * Dipakai untuk aksi penting (mis. Kunci & Akhiri / Aktivasi Periode).
 */
export function ConfirmDialog({
  open, icon = '⚠️', title, children,
  confirmLabel = 'Lanjutkan', cancelLabel = 'Batal', tone = 'danger', busy = false,
  onConfirm, onCancel,
}: {
  open: boolean;
  icon?: string;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={() => { if (!busy) onCancel(); }}
      role="dialog" aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>{icon}</span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800">{title}</h2>
            <div className="mt-1.5 text-[13px] text-gray-600 space-y-2 leading-relaxed">{children}</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy}
            className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className={`text-xs font-bold px-4 py-2 rounded-lg text-white disabled:opacity-50 ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-700 hover:bg-emerald-800'
            }`}>
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
