'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Penjaga global di kerangka aplikasi — dua hal yang membuat "sudah klik tapi tak tersimpan" terlihat:
 *  1. Aplikasi diperbarui: versi build server (/api/version) dibandingkan dengan versi halaman ini,
 *     dicek saat tab kembali aktif & tiap 5 menit. Beda → banner "muat ulang" (aksi dari halaman lama
 *     bisa gagal tanpa pesan setelah deploy).
 *  2. Aksi gagal terkirim di tombol mana pun yang belum menangani kegagalannya sendiri (lihat
 *     lib/call-action.ts): error jaringan/Server Action yang lolos sebagai unhandledrejection →
 *     peringatan merah bahwa perubahan terakhir TIDAK tersimpan.
 */
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const CHECK_EVERY_MS = 5 * 60 * 1000;
const NETWORKISH = /server action|failed to fetch|networkerror|load failed|fetch failed|unexpected response|chunkloaderror|loading chunk/i;

export function ActionGuard() {
  const [updated, setUpdated] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (BUILD === 'dev') return; // lokal: tiap build berganti, banner hanya mengganggu
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (build && build !== 'dev' && build !== BUILD) setUpdated(true);
      } catch { /* offline sesaat — dicek lagi nanti */ }
    };
    const t = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);

  useEffect(() => {
    const onReject = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? `${e.reason.name} ${e.reason.message}` : String(e.reason ?? '');
      if (NETWORKISH.test(msg)) setFailed(true);
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, []);

  if (!updated && !failed) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pointer-events-none"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}>
      <div className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-panel border px-4 py-3 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,0.15)] ${
        failed ? 'border-danger-ink/30 bg-danger-tint text-danger-ink' : 'border-warn-ink/30 bg-warn-tint text-warn-ink'}`}>
        <div className="min-w-0">
          <p className="font-semibold">
            {failed ? 'Perubahan terakhir TIDAK tersimpan — gagal terhubung ke server.' : 'Aplikasi baru saja diperbarui.'}
          </p>
          <p className="mt-0.5 text-ink-soft">
            {failed ? 'Muat ulang halaman, periksa datanya, lalu ulangi aksi tadi.' : 'Muat ulang halaman ini sebelum menyimpan apa pun, agar perubahan Anda tersimpan.'}
          </p>
        </div>
        <button type="button" onClick={() => window.location.reload()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-ink">
          <RefreshCw className="h-3.5 w-3.5" /> Muat ulang
        </button>
        {!failed && (
          <button type="button" onClick={() => setUpdated(false)} className="shrink-0 text-ink-faint hover:text-ink" title="Tutup">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
