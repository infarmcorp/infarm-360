'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcwDot } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { resyncDriftedFinals } from './actions';
import { callAction } from '@/lib/call-action';

/**
 * "Finalisasi Ulang Laporan Berubah (N)" — satu klik untuk menyinkronkan skor tersimpan pada laporan
 * yang sudah Final tapi angkanya ketinggalan (badge "berubah → N"). Menggantikan alur manual
 * "Kembalikan ke Draf → Finalisasi ulang" per laporan. Laporan tetap Final (tak hilang dari pegawai);
 * hanya Skor Akhir tersimpan yang diperbarui ke nilai terkini. `count` = jumlah laporan yang berubah.
 */
export function ResyncDriftButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (count === 0) return null; // tak ada laporan berubah → sembunyikan

  async function run() {
    setBusy(true); setMsg(null);
    const res = await callAction(() => resyncDriftedFinals());
    setBusy(false); setOpen(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    const skip = res.skipped ? ` · ${res.skipped} dilewati` : '';
    setMsg({ ok: true, text: `${res.resynced} laporan disinkronkan${skip}.` });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={() => setOpen(true)} disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold min-h-9 px-3 rounded-control border border-warn-ink/40 bg-warn-tint text-warn-ink hover:bg-warn-tint/70 disabled:opacity-50">
        <RefreshCcwDot className="w-3.5 h-3.5" /> ② Perbarui Laporan Final yang Berubah ({count})
      </button>
      {msg && <span className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}

      <ConfirmDialog
        open={open} icon="🔄" tone="primary"
        title={`Perbarui ${count} laporan Final yang skornya berubah?`}
        confirmLabel={`Ya, sinkronkan ${count}`} busy={busy}
        onConfirm={run} onCancel={() => setOpen(false)}
      >
        <p><strong>{count} laporan</strong> <strong>Final</strong> memiliki Skor Akhir yang sudah tidak sesuai data terkini (KPI/360° berubah setelah finalisasi).</p>
        <p>Hanya angka Skor Akhir yang diperbarui. Laporan <strong>tetap Final</strong> dan ringkasannya <strong>tidak berubah</strong>.</p>
        <p className="text-ink-soft">Pastikan Anda sudah menjalankan <strong>Hitung Ulang Skor 360°</strong> (langkah ①) agar nilainya benar.</p>
      </ConfirmDialog>
    </div>
  );
}
