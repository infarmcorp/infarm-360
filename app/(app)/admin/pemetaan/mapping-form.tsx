'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMapping } from './actions';
import { SearchableSelect } from '@/components/searchable-select';
import { Button } from '@/components/button';

type Emp = { id: string; name: string; dept: string; is_external?: boolean };
const RELATIONS = ['Atasan', 'Peer', 'Cross', 'Self', 'Bawahan'] as const;

export function MappingForm({ employees }: { employees: Emp[] }) {
  const router = useRouter();
  const [assessorId, setAssessorId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [relation, setRelation] = useState<(typeof RELATIONS)[number]>('Peer');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    // Kebijakan: semua penilaian yang ditugaskan HRD bersifat WAJIB (tak ada Opsional).
    const res = await createMapping({ assessorId, targetId, relation, mandatory: true });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setTargetId('');
    router.refresh();
  }

  // Penilai: semua pegawai (termasuk eksternal). Target: HANYA internal — eksternal
  // (vendor/freelance) hanya boleh menilai, tak boleh dinilai.
  const assessorOptions = employees.map((e) => ({ value: e.id, label: `${e.name} (${e.dept})${e.is_external ? ' · Eksternal' : ''}` }));
  const targetOptions = employees.filter((e) => !e.is_external).map((e) => ({ value: e.id, label: `${e.name} (${e.dept})` }));
  const inputCls = 'text-sm px-2.5 py-1.5 border border-line rounded-control bg-surface focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint';

  return (
    <form onSubmit={submit} className="rounded-panel border border-line bg-surface p-4 space-y-3">
      <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.07em]">Tambah Pemetaan</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Penilai</label>
          <SearchableSelect value={assessorId} onChange={setAssessorId} options={assessorOptions} placeholder="— pilih penilai —" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Yang Dinilai</label>
          <SearchableSelect value={targetId} onChange={setTargetId} options={targetOptions} placeholder="— pilih target —" className={inputCls} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Relasi</label>
          <select value={relation} onChange={(e) => setRelation(e.target.value as (typeof RELATIONS)[number])}
            className="w-full text-sm px-2.5 py-1.5 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
            {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <p className="text-[12.5px] text-ink-soft pb-1.5">
            Sifat: <span className="font-semibold text-danger-ink">Wajib</span> — semua penilaian wajib (kebijakan).
          </p>
        </div>
      </div>
      {err && <p className="text-[12.5px] text-danger-ink font-semibold">{err}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Menyimpan…' : 'Tambah Relasi'}
      </Button>
    </form>
  );
}
