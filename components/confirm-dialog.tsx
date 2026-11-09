'use client';

import { useEffect } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { renderIcon } from '@/components/emoji-icon';

/**
 * Dialog konfirmasi in-app (pengganti window.confirm bawaan browser) — kartu mengambang Design System
 * Infarm di atas overlay, tombol Batal/konfirmasi. Esc & klik luar = batal.
 * Dipakai untuk aksi penting (mis. Kunci & Akhiri / Aktivasi Periode).
 *
 * `icon`: pemanggil lama mengisi emoji (⚠️ ✅ 🔄 …) — dipetakan ke ikon lucide (lihat emoji-icon.tsx), jadi
 * emoji tak pernah tampil. Elemen React (mis. `<Mail />`) juga diterima.
 */
export function ConfirmDialog({
  open, icon = '⚠️', title, children,
  confirmLabel = 'Lanjutkan', cancelLabel = 'Batal', tone = 'danger', busy = false,
  confirmDisabled = false,
  onConfirm, onCancel,
}: {
  open: boolean;
  icon?: string | React.ReactNode;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  confirmDisabled?: boolean;
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

  const danger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={() => { if (!busy) onCancel(); }}
      role="dialog" aria-modal="true"
    >
      <div
        className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-surface rounded-card shadow-card border border-line p-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            danger ? 'bg-danger-tint text-danger-ink' : 'bg-brand-tint text-brand-ink'}`} aria-hidden>
            {renderIcon(icon, danger ? AlertTriangle : Info, 'w-5 h-5')}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-snug text-ink">{title}</h2>
            <div className="mt-1.5 text-[13px] text-ink-soft space-y-2 leading-relaxed">{children}</div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy}
            className="inline-flex items-center justify-center min-h-9 px-4 rounded-xl border border-line bg-surface text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled}
            className={`inline-flex items-center justify-center min-h-9 px-4 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-colors ${
              danger ? 'bg-danger-ink hover:opacity-90' : 'bg-brand hover:bg-brand-ink'
            }`}>
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
