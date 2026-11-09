'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMapping } from './actions';
import { SearchableSelect } from '@/components/searchable-select';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/button';
import { CARD, CardTitle, FIELD, FIELD_LABEL } from '@/components/infarm-ui';

type Emp = { id: string; name: string; dept: string; is_external?: boolean };
// BR-02 (Q3 2026): Self Assessment dinonaktifkan — tak lagi dipilihkan di form ini
// (enum backend tetap punya 'Self' untuk kompatibilitas baca periode lama).
const RELATIONS = ['Atasan', 'Peer', 'Cross', 'Bawahan'] as const;

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
  const inputCls = `${FIELD} w-full`;

  return (
    <form onSubmit={submit} className={`${CARD} space-y-3`}>
      <CardTitle icon={UserPlus}>Tambah Pemetaan</CardTitle>
      {/* Satu kolom: form berada di kolom kiri split screen halaman Pemetaan (sempit). */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className={FIELD_LABEL}>Penilai</label>
          <SearchableSelect value={assessorId} onChange={setAssessorId} options={assessorOptions} placeholder="— pilih penilai —" className={inputCls} />
        </div>
        <div>
          <label className={FIELD_LABEL}>Yang Dinilai</label>
          <SearchableSelect value={targetId} onChange={setTargetId} options={targetOptions} placeholder="— pilih target —" className={inputCls} />
        </div>
        <div>
          <label className={FIELD_LABEL}>Relasi</label>
          <select value={relation} onChange={(e) => setRelation(e.target.value as (typeof RELATIONS)[number])}
            className={inputCls}>
            {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs text-ink-soft">
            Sifat: <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warn-tint text-warn-ink">Wajib</span> — semua penilaian wajib (kebijakan).
          </p>
        </div>
      </div>
      {err && <p className="text-[13px] text-danger-ink font-semibold">{err}</p>}
      <Button type="submit" className="min-h-9" disabled={busy}>
        {busy ? 'Menyimpan…' : 'Tambah Relasi'}
      </Button>
    </form>
  );
}
