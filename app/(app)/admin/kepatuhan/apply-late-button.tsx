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
    setMsg(res.ok ? { ok: true, text: `Potongan diterapkan — ${res.changed} Skor 360° diperbarui.` } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={run} disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Menerapkan…' : `Terapkan Potongan ke Skor 360° (${pending} pegawai)`}
      </button>
      {msg && <span className={`text-[11px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
    </div>
  );
}
