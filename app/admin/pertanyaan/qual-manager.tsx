'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addQualQuestion, updateQualQuestion, deleteQualQuestion } from './actions';

type Q = { id: string; text: string };

export function QualManager({ questions }: { questions: Q[] }) {
  const router = useRouter();
  const [newText, setNewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return false; }
    router.refresh(); return true;
  }

  async function add() {
    if (await run(() => addQualQuestion(newText))) setNewText('');
  }

  return (
    <section className="border border-gray-200 rounded-xl p-3">
      <h3 className="text-sm font-extrabold text-indigo-800 mb-2">Pertanyaan Kualitatif (Esai)</h3>
      <div className="space-y-2">
        {questions.map((q) => <QualRow key={q.id} q={q} run={run} busy={busy} />)}
        {questions.length === 0 && <p className="text-xs text-gray-400 italic">Belum ada pertanyaan kualitatif.</p>}
      </div>
      <div className="flex gap-1.5 mt-2.5">
        <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Pertanyaan esai baru…"
          className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <button type="button" disabled={busy || !newText.trim()} onClick={add}
          className="text-[11px] font-bold px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-800 text-white disabled:opacity-50">Tambah</button>
      </div>
      {err && <p className="text-[10px] text-rose-600 mt-1">{err}</p>}
    </section>
  );
}

function QualRow({ q, run, busy }: { q: Q; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState(q.text);
  const dirty = text.trim() !== q.text;
  return (
    <div className="flex items-center gap-1.5">
      <input value={text} onChange={(e) => setText(e.target.value)}
        className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500" />
      {dirty && (
        <button type="button" disabled={busy} onClick={() => run(() => updateQualQuestion(q.id, text))}
          className="text-[10px] font-bold px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-50">Simpan</button>
      )}
      <button type="button" disabled={busy} onClick={() => run(() => deleteQualQuestion(q.id))}
        className="text-[10px] font-bold px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">Hapus</button>
    </div>
  );
}
