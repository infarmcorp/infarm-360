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
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">
        <CopyPlus className="w-4 h-4" /> Salin dari Periode Sebelumnya
      </button>
    );
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.07em]">Salin Pemetaan dari Periode Lain</h3>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="text-ink-faint hover:text-ink-soft text-xs">Tutup ✕</button>
      </div>
      <p className="text-[12px] text-ink-soft leading-relaxed">
        Menyalin seluruh pasangan penilai→target dari periode terpilih ke periode aktif. Pasangan yang
        sudah ada <strong className="font-semibold text-ink">dilewati</strong>, dan hasil salinan <strong className="font-semibold text-ink">tetap bisa diedit/dihapus</strong>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={src} onChange={(e) => setSrc(e.target.value)}
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint min-w-[180px]">
          <option value="">— Pilih Periode Sumber —</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" onClick={run} disabled={pending || !src}
          className="text-xs font-semibold px-4 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
          {pending ? 'Menyalin…' : 'Salin Pemetaan'}
        </button>
      </div>
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
