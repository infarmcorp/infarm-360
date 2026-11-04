'use client';

import { useState, useTransition } from 'react';
import { CopyPlus, X } from 'lucide-react';
import { CARD, CardTitle, FIELD } from '@/components/infarm-ui';
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
        className="flex items-center gap-1.5 min-h-9 text-[13px] font-semibold px-3 rounded-xl border border-line bg-surface text-ink-soft hover:text-brand hover:border-infarm-light">
        <CopyPlus className="w-4 h-4" /> Salin dari Periode Sebelumnya
      </button>
    );
  }

  return (
    <div className={`${CARD} space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <CardTitle icon={CopyPlus}>Salin Pemetaan dari Periode Lain</CardTitle>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="inline-flex items-center gap-1 text-ink-soft hover:text-ink text-xs font-semibold shrink-0">Tutup <X className="w-3.5 h-3.5" aria-hidden /></button>
      </div>
      <p className="text-xs text-ink-soft leading-relaxed">
        Menyalin seluruh pasangan penilai→target dari periode terpilih ke periode aktif. Pasangan yang
        sudah ada <strong className="font-semibold text-ink">dilewati</strong>, dan hasil salinan <strong className="font-semibold text-ink">tetap bisa diedit/dihapus</strong>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={src} onChange={(e) => setSrc(e.target.value)}
          className={`${FIELD} min-w-[180px]`}>
          <option value="">— Pilih Periode Sumber —</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button type="button" onClick={run} disabled={pending || !src}
          className="min-h-9 text-[13px] font-bold px-4 rounded-xl bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
          {pending ? 'Menyalin…' : 'Salin Pemetaan'}
        </button>
      </div>
      {msg && <p className={`text-[13px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
