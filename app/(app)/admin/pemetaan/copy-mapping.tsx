'use client';

import { useState, useTransition } from 'react';
import { CopyPlus } from 'lucide-react';
import { copyMappingsFromPeriod } from './actions';

type P = { id: string; label: string };

/** Salin pemetaan dari periode sebelumnya ke periode aktif (HRD). Hasil tetap bisa diedit. */
export function CopyMapping({ periods }: { periods: P[] }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (periods.length === 0) return null;

  function run() {
    if (!src) { setMsg({ ok: false, text: 'Pilih periode sumber dulu.' }); return; }
    setMsg(null);
    start(async () => {
      const res = await copyMappingsFromPeriod(src);
      setMsg(res.ok
        ? { ok: true, text: `${res.saved} pemetaan disalin${res.skipped ? `, ${res.skipped} dilewati (sudah ada)` : ''}.` }
        : { ok: false, text: res.error });
      if (res.ok) setSrc('');
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50">
        <CopyPlus className="w-4 h-4" /> Salin dari Periode Sebelumnya
      </button>
    );
  }

  return (
    <div className="border border-indigo-200 bg-indigo-50/30 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wide">Salin Pemetaan dari Periode Lain</h3>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="text-gray-400 hover:text-gray-600 text-xs">Tutup ✕</button>
      </div>
      <p className="text-[11px] text-indigo-900">
        Menyalin seluruh pasangan penilai→target dari periode terpilih ke periode aktif. Pasangan yang
        sudah ada <strong>dilewati</strong>, dan hasil salinan <strong>tetap bisa diedit/dihapus</strong>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={src} onChange={(e) => setSrc(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 min-w-[180px]">
          <option value="">— Pilih Periode Sumber —</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" onClick={run} disabled={pending || !src}
          className="text-xs font-bold px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white disabled:opacity-50">
          {pending ? 'Menyalin…' : 'Salin Pemetaan'}
        </button>
      </div>
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}
