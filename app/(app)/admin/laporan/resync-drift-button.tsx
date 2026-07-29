'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcwDot } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { resyncDriftedFinals } from './actions';

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
    const res = await resyncDriftedFinals();
    setBusy(false); setOpen(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    const skip = res.skipped ? ` · ${res.skipped} dilewati` : '';
    setMsg({ ok: true, text: `${res.resynced} laporan disinkronkan${skip}.` });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={() => setOpen(true)} disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">
        <RefreshCcwDot className="w-3.5 h-3.5" /> ② Finalisasi Ulang Berubah ({count})
      </button>
      {msg && <span className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}

      <ConfirmDialog
        open={open} icon="🔄" tone="primary"
        title={`Finalisasi ulang ${count} laporan yang skornya berubah?`}
        confirmLabel={`Ya, sinkronkan ${count}`} busy={busy}
        onConfirm={run} onCancel={() => setOpen(false)}
      >
        <p><strong>{count} laporan</strong> sudah <strong>Final</strong> tetapi Skor Akhir tersimpan (yang dilihat
          pegawai) <strong>ketinggalan</strong> dari data terkini (KPI/360°/punishment berubah setelah finalisasi).</p>
        <p>Aksi ini memperbarui angka tersimpan ke <strong>Skor Akhir terkini</strong>. Laporan <strong>tetap Final</strong>
          &amp; ringkasan naratifnya <strong>tidak berubah</strong> — hanya angkanya yang disegarkan.</p>
        <p className="text-gray-500">Pastikan sudah <strong>Hitung Ulang Skor 360°</strong> (langkah ①) dulu agar nilainya benar.</p>
      </ConfirmDialog>
    </div>
  );
}
