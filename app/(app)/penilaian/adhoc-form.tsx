'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { addAdhocTarget } from './adhoc-actions';

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
    <div className="bg-emerald-50/40 border border-emerald-600/20 rounded-2xl p-4 mb-5 space-y-2">
      <div>
        <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Hak Penilaian Ad-Hoc Mandiri</h3>
        <p className="text-[11px] text-emerald-800">Anda berhak menilai <strong>rekan kerja lain</strong> yang tidak tercantum di daftar rutin (dihitung sebagai relasi Lintas Unit).</p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={pending || candidates.length === 0}
          className="w-full sm:flex-1 text-xs p-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-700 font-medium disabled:bg-gray-50"
        >
          <option value="">{candidates.length ? '— Pilih Rekan Kerja untuk Dinilai —' : 'Semua rekan sudah ada di daftar Anda'}</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.dept}</option>)}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={!targetId || pending}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-4 font-bold text-xs bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> {pending ? 'Menambah…' : 'Tambahkan Rekan'}
        </button>
      </div>
      {msg && <p className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}
