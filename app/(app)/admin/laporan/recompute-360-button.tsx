'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { computeResult360 } from '@/app/(app)/admin/360/actions';

/**
 * Tombol "Hitung Ulang Skor 360° (semua pegawai)" — dibawa ke halaman Review Hasil Akhir
 * agar HRD tak perlu pindah ke halaman Bobot. Memakai action yang sama (computeResult360),
 * yang memproses seluruh penilaian terkirim periode aktif sekaligus.
 */
export function Recompute360Button() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    const res = await computeResult360();
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Skor 360° dihitung ulang untuk ${res.computed} pegawai.` } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={run} disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> {busy ? 'Menghitung…' : 'Hitung Ulang Skor 360° (semua)'}
      </button>
      {msg && <span className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}
    </div>
  );
}
