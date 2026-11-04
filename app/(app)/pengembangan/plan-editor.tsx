'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Send, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/button';
import { CARD, CardTitle, FIELD } from '@/components/infarm-ui';
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
    <div className="space-y-4">
      {items.map((it, i) => (
        <section key={i} className={CARD}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <CardTitle icon={Target}>Prioritas {i + 1}</CardTitle>
            {items.length > 1 && (
              <button type="button" disabled={busy} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                className="inline-flex items-center gap-1 text-xs font-semibold text-danger-ink hover:underline disabled:opacity-60">
                <Trash2 className="w-3.5 h-3.5" /> Hapus prioritas
              </button>
            )}
          </div>
          <div className="divide-y divide-line-soft">
            {PLAN_ITEM_FIELDS.map((f) => (
              <label key={f.key} className="grid sm:grid-cols-[200px_1fr] gap-1.5 sm:gap-3 py-2.5 items-start">
                <span className="text-xs font-semibold text-ink-soft sm:pt-2">{f.label}</span>
                <textarea value={it[f.key]} onChange={(e) => set(i, f.key, e.target.value)} disabled={busy}
                  rows={f.long ? 3 : 1}
                  className={`${FIELD} w-full py-2 resize-y`} />
              </label>
            ))}
          </div>
        </section>
      ))}

      {items.length < PLAN_MAX_ITEMS && (
        <button type="button" disabled={busy} onClick={() => setItems((xs) => [...xs, { ...EMPTY }])}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink hover:underline disabled:opacity-60">
          <Plus className="w-4 h-4" /> Tambah Prioritas
        </button>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {msg && <span className={`text-xs font-semibold mr-auto ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
        <Button variant={canSubmit ? 'ghost' : 'primary'} disabled={busy} onClick={() => save(false)} className="min-h-9">
          <Save className="w-4 h-4" /> {canSubmit ? 'Simpan Draf' : 'Simpan'}
        </Button>
        {canSubmit && (
          <Button disabled={busy} onClick={() => save(true)} className="min-h-9">
            <Send className="w-4 h-4" /> Kirim ke Atasan
          </Button>
        )}
      </div>
      {canSubmit && (
        <p className="text-xs text-ink-soft text-right">
          Kirim ke Atasan = persetujuan Anda atas rencana ini. Setelah dikirim, isi tidak bisa diubah kecuali atasan meminta perbaikan.
        </p>
      )}
    </div>
  );
}
