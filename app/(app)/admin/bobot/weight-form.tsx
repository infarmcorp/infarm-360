'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveWeights } from './actions';

type Init = { model: '4class' | '2class'; atasan: number; peer: number; cross: number; bawahan: number; self: number; internal: number };

export function WeightForm({ initial }: { initial: Init }) {
  const router = useRouter();
  const [model, setModel] = useState(initial.model);
  const [w, setW] = useState({
    atasan: initial.atasan, peer: initial.peer, cross: initial.cross, bawahan: initial.bawahan, self: initial.self, internal: initial.internal,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof typeof w) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setW((p) => ({ ...p, [k]: Number(e.target.value) }));

  const total = model === '4class' ? w.atasan + w.peer + w.cross + w.bawahan : w.atasan + w.internal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await saveWeights({ model, ...w });
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: 'Bobot tersimpan. Jalankan Hitung Ulang Skor 360° agar berlaku.' }); router.refresh(); }
    else setMsg({ ok: false, text: res.error });
  }

  const field = (label: string, k: keyof typeof w) => (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 mb-1">{label}</label>
      <input type="number" min={0} max={100} value={w[k]} onChange={set(k)}
        className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-emerald-500" />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-[10px] font-bold text-gray-400 mb-1">Model Bobot</label>
        <select value={model} onChange={(e) => setModel(e.target.value as '4class' | '2class')}
          className="text-sm px-2 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
          <option value="4class">4-Kelas (Atasan / Peer / Cross / Bawahan / Self)</option>
          <option value="2class">2-Kelas (Atasan / Internal)</option>
        </select>
      </div>

      {model === '4class' ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {field('Atasan', 'atasan')}{field('Peer', 'peer')}{field('Cross', 'cross')}{field('Bawahan', 'bawahan')}{field('Self', 'self')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {field('Atasan', 'atasan')}{field('Internal', 'internal')}
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Total bobot resmi (Self dikecualikan): <span className="font-mono font-bold">{total}</span>
        {total !== 100 && <span className="text-amber-600"> — umumnya 100</span>}
      </p>

      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}

      <button type="submit" disabled={busy}
        className="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
        {busy ? 'Menyimpan…' : 'Simpan & Terapkan Bobot'}
      </button>
    </form>
  );
}
