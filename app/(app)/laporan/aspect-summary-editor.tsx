'use client';

import { useState } from 'react';
import { Sparkles, Save } from 'lucide-react';
import { saveAspectSummaries } from '@/app/(app)/admin/laporan/actions';

/**
 * Section 4 — EVALUASI ASPEK BUDAYA & PERILAKU 360° (HRD).
 * HRD meringkas/mengkalibrasi hasil 360° per aspek (naratif), tersimpan di
 * final_reports.content.aspectSummaries. Anonim — tak menyebut nama penilai.
 */
export function AspectSummaryEditor({
  employeeId, aspects, initial,
}: {
  employeeId: string; aspects: string[]; initial: Record<string, string>;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    aspects.forEach((a) => { o[a] = initial[a] ?? ''; });
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await saveAspectSummaries(employeeId, vals);
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: 'Ringkasan tersimpan.' } : { ok: false, text: res.error });
  }

  if (aspects.length === 0) return null;

  return (
    <section className="mt-6 break-inside-avoid">
      <div className="bg-emerald-700 text-white rounded-t-xl px-4 py-2.5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Evaluasi Aspek Budaya &amp; Perilaku 360°
        </h2>
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-xl p-4 space-y-3">
        <p className="text-[11px] text-gray-500 bg-emerald-50/60 border border-emerald-100 rounded-lg p-2">
          Rangkuman evaluasi 360° pelaku budaya perusahaan dari seluruh komentar penilai.
          Pihak manajemen (HRD) melakukan kalibrasi atas aspek ini secara adil &amp; transparan —
          <strong> tanpa menyebut identitas penilai</strong>.
        </p>
        {aspects.map((a) => (
          <div key={a} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-150">
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">★ {a}</span>
            </div>
            <textarea
              value={vals[a] ?? ''}
              onChange={(e) => setVals((v) => ({ ...v, [a]: e.target.value }))}
              rows={3}
              placeholder={`Ringkasan kalibrasi HRD untuk aspek "${a}"…`}
              aria-label={`Ringkasan kalibrasi aspek ${a}`}
              className="w-full text-xs p-3 outline-none resize-y text-gray-700 leading-relaxed"
            />
          </div>
        ))}
        <div className="flex items-center gap-3 no-print">
          <button type="button" onClick={save} disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {busy ? 'Menyimpan…' : 'Simpan Ringkasan'}
          </button>
          {msg && <span role="status" className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}
        </div>
      </div>
    </section>
  );
}
