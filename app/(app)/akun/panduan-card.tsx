'use client';

import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';

const SEEN_KEY = 'panduan_seen_version';

/**
 * Kartu "Panduan Pengguna" (Akun Saya) — unduh PDF panduan sesuai peran (disajikan statik dari
 * public/panduan/, 0 byte DB). Badge "BARU" muncul bila `version` belum pernah dibuka pengguna
 * (dilacak di localStorage — tak menyentuh database). Menandai sudah dibaca saat pengguna mengunduh.
 */
export function PanduanCard({
  href, label, filename, version, updatedLabel,
}: {
  href: string; label: string; filename: string;
  version: string; updatedLabel: string;
}) {
  // Default: anggap SUDAH dilihat (hindari kedip "BARU" saat hydrate); dikoreksi di efek.
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    try { setIsNew(localStorage.getItem(SEEN_KEY) !== version); } catch { /* localStorage tak tersedia */ }
  }, [version]);

  const markSeen = () => {
    try { localStorage.setItem(SEEN_KEY, version); } catch { /* abaikan */ }
    setIsNew(false);
  };

  return (
    <div className="mt-5 border-t border-line-soft pt-4">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-bold text-ink">Panduan Pengguna</h2>
        {isNew && (
          <span className="inline-flex items-center rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-ink">
            Baru
          </span>
        )}
      </div>

      <div className="rounded-panel border border-line p-3">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 shrink-0 text-brand mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{label}</div>
            <div className="text-[11px] text-ink-faint">Diperbarui {updatedLabel}</div>
          </div>
        </div>
        <a
          href={href} download={filename} onClick={markSeen}
          className="mt-3 inline-flex items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-ink"
        >
          <Download className="w-3.5 h-3.5" aria-hidden /> Unduh PDF
        </a>
      </div>
    </div>
  );
}
