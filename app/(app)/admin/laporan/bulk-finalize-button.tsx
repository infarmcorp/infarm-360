'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/button';
import { bulkFinalizeAccepted } from './actions';
import { callAction } from '@/lib/call-action';

/**
 * "Finalisasi Semua yang Ber-ACC" — memfinalisasi sekaligus laporan yang sudah di-ACC
 * (SPV/Koordinator/Direksi) & masih `in_review`, agar HRD tak finalisasi satu per satu.
 * `count` = jumlah kandidat (spv_acc & in_review); `staleCount` = di antaranya yang skor 360°-nya
 * perlu dihitung ulang (peringatan agar HRD Hitung Ulang dulu supaya skor tersimpan benar).
 * Langkah ② kokpit: hijau bila `primary` (langkah yang sedang perlu dikerjakan); tanpa kandidat →
 * tombol tetap tampil tetapi nonaktif dengan `idleLabel` yang menjelaskan sebabnya (mis. "Menunggu ACC (3)"
 * atau "✓ Semua sudah Final"), agar susunan langkah tak berubah-ubah.
 */
export function BulkFinalizeButton({ count, staleCount, primary, idleLabel }: { count: number; staleCount: number; primary: boolean; idleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; failed?: string } | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    const res = await callAction(() => bulkFinalizeAccepted());
    setBusy(false); setOpen(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    const skip = res.skipped.length ? ` · ${res.skipped.length} dilewati (${res.skipped.map((s) => s.name).join(', ')})` : '';
    const failed = res.failed.length
      ? `${res.failed.length} gagal disimpan: ${res.failed.map((f) => `${f.name} (${f.reason})`).join('; ')}`
      : undefined;
    setMsg({ ok: true, text: `${res.finalized} laporan difinalisasi${skip}.`, failed });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button type="button" size="sm" variant={primary && count > 0 ? 'primary' : 'ghost'} onClick={() => setOpen(true)}
        disabled={busy || count === 0} title={count === 0 ? 'Tombol ini memfinalisasi laporan yang sudah di-ACC dan masih Ditinjau — saat ini tidak ada' : undefined}>
        <CheckCheck className="w-3.5 h-3.5" /> {count > 0 ? <>Finalisasi <span className="data-value">{count}</span> Laporan</> : idleLabel}
      </Button>
      {msg && <span className={`text-[11px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
      {msg?.failed && <span className="text-[11px] font-semibold text-danger-ink">{msg.failed}</span>}

      <ConfirmDialog
        open={open} icon="✅" tone="primary"
        title={`Finalisasi ${count} laporan yang sudah di-ACC?`}
        confirmLabel={`Ya, finalisasi ${count}`} busy={busy}
        onConfirm={run} onCancel={() => setOpen(false)}
      >
        <p>Semua laporan yang <strong>sudah di-ACC</strong> (SPV/Koordinator/Direksi) & masih Ditinjau akan
          <strong> difinalisasi</strong> — langsung <strong>terlihat oleh pegawai</strong> di &quot;Laporan Hasil Saya&quot;.</p>
        {staleCount > 0 && (
          <p className="text-warn-ink font-semibold">⚠️ {staleCount} di antaranya Skor 360°-nya <strong>perlu dihitung ulang</strong>.
            Sebaiknya klik &quot;Hitung Ulang Skor 360°&quot; dulu agar skor tersimpan yang dilihat pegawai sudah benar.</p>
        )}
        <p className="text-ink-soft">Laporan yang skornya belum bisa dihitung (KPI &amp; 360° kosong) akan dilewati.</p>
      </ConfirmDialog>
    </div>
  );
}
