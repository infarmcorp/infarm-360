'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Download, FileText } from 'lucide-react';
import { CARD, CardTitle } from '@/components/infarm-ui';

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
    // Disengaja: membaca localStorage (sistem luar) setelah hydrate agar tak beda dengan HTML server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setIsNew(localStorage.getItem(SEEN_KEY) !== version); } catch { /* localStorage tak tersedia */ }
  }, [version]);

  const markSeen = () => {
    try { localStorage.setItem(SEEN_KEY, version); } catch { /* abaikan */ }
    setIsNew(false);
  };

  return (
    // Section mandiri (kartu) — sejajar dengan "Informasi Akun"/"Ganti Sandi" di Akun Saya.
    <section className={CARD}>
      <div className="flex items-center gap-2 mb-4">
        <CardTitle icon={BookOpen}>Panduan Pengguna</CardTitle>
        {isNew && (
          <span className="inline-flex items-center rounded-full bg-brand-tint px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-ink">
            Baru
          </span>
        )}
      </div>

      <div>
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-tint text-brand-ink flex items-center justify-center shrink-0" aria-hidden><FileText className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">{label}</div>
            <div className="text-xs text-ink-soft mt-0.5">Diperbarui {updatedLabel}</div>
          </div>
        </div>
        <a
          href={href} download={filename} onClick={markSeen}
          className="mt-4 inline-flex items-center justify-center gap-1.5 min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white text-[13px] font-bold transition-colors"
        >
          <Download className="w-4 h-4" aria-hidden /> Unduh PDF
        </a>
      </div>
    </section>
  );
}
