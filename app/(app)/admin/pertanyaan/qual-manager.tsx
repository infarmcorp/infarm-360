'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addQualQuestion, updateQualQuestion, deleteQualQuestion } from './actions';
import { Button } from '@/components/button';
import { PanelLabel } from '@/components/panel';

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
    <div>
      <PanelLabel className="mb-3">Pertanyaan Kualitatif (Esai)</PanelLabel>
      <div className="space-y-2">
        {questions.map((q) => <QualRow key={q.id} q={q} run={run} busy={busy} />)}
        {questions.length === 0 && <p className="text-[12px] text-ink-faint italic">Belum ada pertanyaan kualitatif.</p>}
      </div>
      <div className="flex gap-1.5 mt-3">
        <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Pertanyaan esai baru…"
          className="flex-1 text-[12.5px] px-2.5 py-1.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <Button type="button" size="sm" disabled={busy || !newText.trim()} onClick={add}>Tambah</Button>
      </div>
      {err && <p className="text-[11px] text-danger-ink mt-1">{err}</p>}
    </div>
  );
}

function QualRow({ q, run, busy }: { q: Q; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState(q.text);
  const dirty = text.trim() !== q.text;
  return (
    <div className="flex items-center gap-1.5">
      <input value={text} onChange={(e) => setText(e.target.value)}
        className="flex-1 text-[12.5px] px-2.5 py-1.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
      {dirty && (
        <button type="button" disabled={busy} onClick={() => run(() => updateQualQuestion(q.id, text))}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-control bg-brand text-white hover:bg-brand-ink disabled:opacity-50">Simpan</button>
      )}
      <button type="button" disabled={busy} onClick={() => run(() => deleteQualQuestion(q.id))}
        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50">Hapus</button>
    </div>
  );
}
