'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMapping } from './actions';
import { SearchableSelect } from '@/components/searchable-select';

type Emp = { id: string; name: string; dept: string };
const RELATIONS = ['Atasan', 'Peer', 'Cross', 'Self', 'Bawahan'] as const;

export function MappingForm({ employees }: { employees: Emp[] }) {
  const router = useRouter();
  const [assessorId, setAssessorId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [relation, setRelation] = useState<(typeof RELATIONS)[number]>('Peer');
  const [mandatory, setMandatory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await createMapping({ assessorId, targetId, relation, mandatory });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setTargetId('');
    router.refresh();
  }

  const options = employees.map((e) => ({ value: e.id, label: `${e.name} (${e.dept})` }));
  const inputCls = 'text-sm px-2 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500';

  return (
    <form onSubmit={submit} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Tambah Pemetaan</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 mb-1">Penilai</label>
          <SearchableSelect value={assessorId} onChange={setAssessorId} options={options} placeholder="— pilih penilai —" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 mb-1">Yang Dinilai</label>
          <SearchableSelect value={targetId} onChange={setTargetId} options={options} placeholder="— pilih target —" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 mb-1">Relasi</label>
          <select value={relation} onChange={(e) => setRelation(e.target.value as (typeof RELATIONS)[number])}
            className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
            {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs text-gray-600 pb-1.5">
            <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
            Wajib (jika tidak: Opsional)
          </label>
        </div>
      </div>
      {err && <p className="text-xs text-rose-600 font-semibold">{err}</p>}
      <button type="submit" disabled={busy}
        className="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
        {busy ? 'Menyimpan…' : 'Tambah Relasi'}
      </button>
    </form>
  );
}
