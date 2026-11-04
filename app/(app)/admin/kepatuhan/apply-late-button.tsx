'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { applyLatePenalties } from './actions';

/**
 * "Terapkan Potongan ke Skor 360°" — tampil di Flag Kepatuhan bila ada pegawai yang potongan
 * keterlambatannya belum masuk Skor 360° tersimpan (cron dinonaktifkan; audit 2026-09-29).
 * Hanya memperbarui potongan pada skor yang sudah ada — bukan Hitung Ulang Skor 360° penuh.
 */
export function ApplyLateButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    const res = await applyLatePenalties();
    setBusy(false);
    // Pegawai yang laporannya sudah Final tak diubah (kunci laporan Final) — disebutkan jumlahnya.
    const skipped = res.ok && res.skippedFinal > 0 ? ` ${res.skippedFinal} pegawai dilewati karena laporannya sudah Final.` : '';
    setMsg(res.ok ? { ok: true, text: `Potongan diterapkan — ${res.changed} Skor 360° diperbarui.${skipped}` } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={run} disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] font-bold min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
        <RefreshCw className={`w-4 h-4${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Menerapkan…' : `Terapkan Potongan ke Skor 360° (${pending} pegawai)`}
      </button>
      {msg && <span className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
    </div>
  );
}
