'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { addAdhocTarget } from './adhoc-actions';
import { SearchableSelect } from '@/components/searchable-select';

type Candidate = { id: string; name: string; dept: string };

/** Panel "Hak Penilaian Ad-Hoc": tambah rekan di luar daftar rutin untuk dinilai. */
export function AdhocForm({ candidates }: { candidates: Candidate[] }) {
  const [targetId, setTargetId] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function add() {
    if (!targetId) return;
    setMsg(null);
    start(async () => {
      const res = await addAdhocTarget(targetId);
      setMsg(res.ok ? { ok: true, text: 'Rekan ditambahkan ke daftar penilaian Anda.' } : { ok: false, text: res.error });
      if (res.ok) setTargetId('');
    });
  }

  return (
    <div className="bg-brand-tint/50 border border-brand-ink/20 rounded-panel p-4 mb-5 space-y-2">
      <div>
        <h3 className="text-xs font-bold text-brand-ink uppercase tracking-wide">Hak Penilaian Ad-Hoc Mandiri</h3>
        <p className="text-[11px] text-brand-ink/80">Anda berhak menilai <strong>rekan kerja lain</strong> yang tidak tercantum di daftar rutin (dihitung sebagai relasi Lintas Unit).</p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        <div className="w-full sm:flex-1">
          <SearchableSelect
            value={targetId}
            onChange={setTargetId}
            disabled={pending || candidates.length === 0}
            options={candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.dept}` }))}
            placeholder={candidates.length ? '— Pilih Rekan Kerja untuk Dinilai —' : 'Semua rekan sudah ada di daftar Anda'}
            searchPlaceholder="Cari rekan…"
            className="text-xs p-2.5 bg-surface border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint font-medium disabled:bg-neutral-tint"
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!targetId || pending}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-control py-2.5 px-4 font-bold text-xs bg-brand hover:bg-brand-ink text-white disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> {pending ? 'Menambah…' : 'Tambahkan Rekan'}
        </button>
      </div>
      {msg && <p className={`text-[11px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
