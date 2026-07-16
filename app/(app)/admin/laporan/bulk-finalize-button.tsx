'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { bulkFinalizeAccepted } from './actions';

/**
 * "Finalisasi Semua yang Ber-ACC" — memfinalisasi sekaligus laporan yang sudah di-ACC
 * (SPV/Koordinator/Direksi) & masih `in_review`, agar HRD tak finalisasi satu per satu.
 * `count` = jumlah kandidat (spv_acc & in_review); `staleCount` = di antaranya yang skor 360°-nya
 * perlu dihitung ulang (peringatan agar HRD Hitung Ulang dulu supaya skor tersimpan benar).
 */
export function BulkFinalizeButton({ count, staleCount }: { count: number; staleCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (count === 0) return null; // tak ada yang siap difinalisasi → sembunyikan

  async function run() {
    setBusy(true); setMsg(null);
    const res = await bulkFinalizeAccepted();
    setBusy(false); setOpen(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    const skip = res.skipped.length ? ` · ${res.skipped.length} dilewati (${res.skipped.map((s) => s.name).join(', ')})` : '';
    setMsg({ ok: true, text: `${res.finalized} laporan difinalisasi${skip}.` });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={() => setOpen(true)} disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
        <CheckCheck className="w-3.5 h-3.5" /> Finalisasi Semua Ber-ACC ({count})
      </button>
      {msg && <span className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}

      <ConfirmDialog
        open={open} icon="✅" tone="primary"
        title={`Finalisasi ${count} laporan yang sudah di-ACC?`}
        confirmLabel={`Ya, finalisasi ${count}`} busy={busy}
        onConfirm={run} onCancel={() => setOpen(false)}
      >
        <p>Semua laporan yang <strong>sudah di-ACC</strong> (SPV/Koordinator/Direksi) & masih Ditinjau akan
          <strong> difinalisasi</strong> — langsung <strong>terlihat oleh pegawai</strong> di "Laporan Hasil Saya".</p>
        {staleCount > 0 && (
          <p className="text-amber-700 font-semibold">⚠️ {staleCount} di antaranya Skor 360°-nya <strong>perlu dihitung ulang</strong>.
            Sebaiknya klik "Hitung Ulang Skor 360°" dulu agar skor tersimpan yang dilihat pegawai sudah benar.</p>
        )}
        <p className="text-gray-500">Laporan yang skornya belum bisa dihitung (KPI &amp; 360° kosong) akan dilewati.</p>
      </ConfirmDialog>
    </div>
  );
}
