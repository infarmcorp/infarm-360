'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { importQuestionsFromPeriod } from './actions';
import { Button } from '@/components/button';

export type SourcePeriod = { id: string; label: string; aspects: number; indicators: number; quals: number };

/**
 * Salin pertanyaan (aspek + indikator aktif + esai) dari periode lain ke periode aktif.
 * Aspek/esai yang sudah ada (berdasarkan nama/teks) otomatis dilewati — aman dari duplikat.
 */
export function CopyQuestionsForm({ sources }: { sources: SourcePeriod[] }) {
  const router = useRouter();
  const [sel, setSel] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (sources.length === 0) return null; // tak ada periode lain berisi pertanyaan

  const chosen = sources.find((s) => s.id === sel);

  function run() {
    if (!sel) { setMsg({ ok: false, text: 'Pilih periode sumber dulu.' }); return; }
    setConfirming(false);
    setMsg(null);
    startTransition(async () => {
      const res = await importQuestionsFromPeriod(sel);
      if (res.ok) {
        setMsg({ ok: true, text: `Disalin: ${res.aspects} aspek, ${res.indicators} indikator, ${res.quals} esai${res.skipped ? ` · ${res.skipped} dilewati (sudah ada)` : ''}.` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-4">
      <h2 className="text-[13px] font-bold text-ink flex items-center gap-1.5">
        <Copy className="w-4 h-4 text-ink-faint" /> Pakai Pertanyaan Periode Sebelumnya
      </h2>
      <p className="text-[12px] text-ink-soft mt-1 leading-relaxed">
        Salin aspek, indikator aktif, &amp; esai dari periode lain ke periode aktif. Yang
        <strong className="font-semibold text-ink"> sudah ada</strong> (nama/teks sama) otomatis dilewati — tak menimpa.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select
          value={sel}
          onChange={(e) => { setSel(e.target.value); setMsg(null); setConfirming(false); }}
          className="rounded-control border border-line bg-[#FDFDFC] px-3 py-2 text-[13px] text-ink min-w-[16rem] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
          aria-label="Pilih periode sumber"
        >
          <option value="">— Pilih periode sumber —</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} ({s.aspects} aspek · {s.indicators} indikator · {s.quals} esai)
            </option>
          ))}
        </select>

        {!confirming ? (
          <Button type="button" variant="ghost" size="sm"
            onClick={() => { if (!sel) { setMsg({ ok: false, text: 'Pilih periode sumber dulu.' }); return; } setConfirming(true); setMsg(null); }}
            disabled={pending}
          >
            <Copy className="w-3.5 h-3.5" /> Salin ke Periode Aktif
          </Button>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="text-[12px] font-semibold text-warn-ink">
              Salin dari <strong>{chosen?.label}</strong>?
            </span>
            <Button type="button" variant="primary" size="sm" onClick={run} disabled={pending}>
              {pending ? 'Menyalin…' : 'Ya, salin'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              Batal
            </Button>
          </span>
        )}
      </div>

      {msg && <p className={`text-[12px] font-semibold mt-2 ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
