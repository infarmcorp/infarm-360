'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/button';
import { callAction, savedAtLabel } from '@/lib/call-action';
import { PLAN_ITEM_FIELDS, PLAN_MAX_ITEMS, submitBlocker, type PlanItem } from '@/lib/dev-plan';
import { saveMyPlan, submitMyPlan } from './actions';

const EMPTY: PlanItem = { area: '', target: '', actions: '', due_text: '', companion: '', success_indicator: '' };

/**
 * Isian Rencana Pengembangan oleh pemilik (PDF bagian 5). Prioritas mulai 1, bisa ditambah. "Simpan Draf" menyimpan
 * apa adanya; "Kirim ke Atasan" menyimpan lalu mengirim (= persetujuan pegawai) — semua prioritas wajib lengkap.
 * Direksi: hanya Simpan (rencana Direksi tanpa alur persetujuan).
 */
export function PlanEditor({ periodId, initialItems, canSubmit }: { periodId: string; initialItems: PlanItem[]; canSubmit: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<PlanItem[]>(initialItems.length ? initialItems : [{ ...EMPTY }]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  const set = (i: number, key: keyof PlanItem, v: string) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [key]: v } : x)));

  function save(thenSubmit: boolean) {
    setMsg(null);
    if (thenSubmit) {
      const blocker = submitBlocker(items);
      if (blocker) { setMsg({ ok: false, text: blocker }); return; }
    }
    start(async () => {
      const r = await callAction(() => saveMyPlan(periodId, items));
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      if (thenSubmit) {
        const s = await callAction(() => submitMyPlan(periodId));
        if (!s.ok) { setMsg({ ok: false, text: s.error }); router.refresh(); return; }
        setMsg({ ok: true, text: 'Rencana terkirim ke atasan.' });
      } else {
        setMsg({ ok: true, text: `Tersimpan pukul ${savedAtLabel()}.` });
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-panel border border-line overflow-hidden">
          <div className="px-3 py-2 bg-neutral-tint border-b border-line-soft flex items-center justify-between">
            <span className="text-xs font-extrabold text-ink uppercase tracking-wide">Prioritas {i + 1}</span>
            {items.length > 1 && (
              <button type="button" disabled={busy} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger-ink hover:underline disabled:opacity-60">
                <Trash2 className="w-3.5 h-3.5" /> Hapus prioritas
              </button>
            )}
          </div>
          <div className="divide-y divide-line-soft">
            {PLAN_ITEM_FIELDS.map((f) => (
              <label key={f.key} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-3 px-3 py-2 items-start">
                <span className="text-[12px] font-semibold text-ink-soft pt-2">{f.label}</span>
                <textarea value={it[f.key]} onChange={(e) => set(i, f.key, e.target.value)} disabled={busy}
                  rows={f.long ? 3 : 1}
                  className="w-full text-[13px] px-2.5 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint resize-y" />
              </label>
            ))}
          </div>
        </div>
      ))}

      {items.length < PLAN_MAX_ITEMS && (
        <button type="button" disabled={busy} onClick={() => setItems((xs) => [...xs, { ...EMPTY }])}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-ink hover:underline disabled:opacity-60">
          <Plus className="w-4 h-4" /> Tambah Prioritas
        </button>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {msg && <span className={`text-[12px] font-semibold mr-auto ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
        <Button variant={canSubmit ? 'ghost' : 'primary'} disabled={busy} onClick={() => save(false)}>
          <Save className="w-4 h-4" /> {canSubmit ? 'Simpan Draf' : 'Simpan'}
        </Button>
        {canSubmit && (
          <Button disabled={busy} onClick={() => save(true)}>
            <Send className="w-4 h-4" /> Kirim ke Atasan
          </Button>
        )}
      </div>
      {canSubmit && (
        <p className="text-[11.5px] text-ink-faint text-right">
          Kirim ke Atasan = persetujuan Anda atas rencana ini. Setelah dikirim, isi tidak bisa diubah kecuali atasan meminta perbaikan.
        </p>
      )}
    </div>
  );
}
