'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addQualQuestion, updateQualQuestion, deleteQualQuestion } from './actions';
import { MessageSquareText } from 'lucide-react';
import { Button } from '@/components/button';
import { CardTitle, FIELD } from '@/components/infarm-ui';

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
      <CardTitle icon={MessageSquareText} className="mb-3">Pertanyaan Kualitatif (Esai)</CardTitle>
      <div className="space-y-2">
        {questions.map((q) => <QualRow key={q.id} q={q} run={run} busy={busy} />)}
        {questions.length === 0 && <p className="text-[13px] text-ink-soft italic">Belum ada pertanyaan kualitatif.</p>}
      </div>
      <div className="flex gap-2 mt-3">
        <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Pertanyaan esai baru…"
          className={`${FIELD} flex-1`} />
        <Button type="button" disabled={busy || !newText.trim()} onClick={add}>Tambah</Button>
      </div>
      {err && <p className="text-[12px] text-danger-ink mt-1.5">{err}</p>}
    </div>
  );
}

function QualRow({ q, run, busy }: { q: Q; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState(q.text);
  const dirty = text.trim() !== q.text;
  return (
    <div className="flex items-center gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)}
        className={`${FIELD} flex-1`} />
      {dirty && (
        <button type="button" disabled={busy} onClick={() => run(() => updateQualQuestion(q.id, text))}
          className="min-h-9 px-4 rounded-xl text-[13px] font-bold bg-brand text-white hover:bg-brand-ink disabled:opacity-50 shrink-0">Simpan</button>
      )}
      <button type="button" disabled={busy} onClick={() => run(() => deleteQualQuestion(q.id))}
        className="min-h-9 px-3 rounded-xl text-[13px] font-semibold bg-surface border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50 shrink-0">Hapus</button>
    </div>
  );
}
