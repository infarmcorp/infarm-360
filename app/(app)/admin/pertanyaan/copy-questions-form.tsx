'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { importQuestionsFromPeriod } from './actions';

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
    <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
      <h2 className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
        <Copy className="w-4 h-4" /> Pakai Pertanyaan Periode Sebelumnya
      </h2>
      <p className="text-[11px] text-gray-600 mt-1">
        Salin aspek, indikator aktif, &amp; pertanyaan esai dari periode lain ke periode aktif ini.
        Aspek/esai yang <strong>sudah ada</strong> (nama/teks sama) otomatis <strong>dilewati</strong> — tak menimpa.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select
          value={sel}
          onChange={(e) => { setSel(e.target.value); setMsg(null); setConfirming(false); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[16rem]"
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
          <button
            type="button"
            onClick={() => { if (!sel) { setMsg({ ok: false, text: 'Pilih periode sumber dulu.' }); return; } setConfirming(true); setMsg(null); }}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" /> Salin ke Periode Aktif
          </button>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span className="text-[11px] font-semibold text-amber-800">
              Salin dari <strong>{chosen?.label}</strong>?
            </span>
            <button type="button" onClick={run} disabled={pending}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
              {pending ? 'Menyalin…' : 'Ya, salin'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-white">
              Batal
            </button>
          </span>
        )}
      </div>

      {msg && <p className={`text-[11px] font-semibold mt-2 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}
