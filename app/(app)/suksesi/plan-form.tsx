'use client';

import { useState, useTransition } from 'react';
import { FIELD } from '@/components/infarm-ui';
import { upsertPlan, deletePlan } from './actions';

const PLAN_OPTIONS = [
  'Promosi ke Jabatan Lebih Tinggi (Senior/Lead)',
  'Rencana Suksesi Manajemen (High Talent Pool)',
  'Penyesuaian Skema Kompensasi & Gaji',
  'Pengembangan / Pelatihan Terarah',
  'Penangguhan Promosi & Penyesuaian',
];

export function PlanForm({
  employeeId, planId, currentPlan, currentJust, status,
}: {
  employeeId: string; planId: string | null;
  currentPlan: string; currentJust: string; status: string | null;
}) {
  const [plan, setPlan] = useState(currentPlan || PLAN_OPTIONS[0]);
  const [just, setJust] = useState(currentJust);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const locked = status === 'approved' || status === 'rejected';

  function run(submit: boolean) {
    setMsg(null);
    start(async () => {
      const res = await upsertPlan(employeeId, plan, just, submit);
      setMsg(res.ok ? { ok: true, text: submit ? 'Diajukan ke Direksi.' : 'Draf tersimpan.' } : { ok: false, text: res.error });
    });
  }
  function remove() {
    if (!planId) return;
    setMsg(null);
    start(async () => {
      const res = await deletePlan(planId);
      if (!res.ok) setMsg({ ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-2">
      <select
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        disabled={locked || pending}
        className={`${FIELD} w-full py-2 disabled:bg-neutral-tint`}
      >
        {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        {currentPlan && !PLAN_OPTIONS.includes(currentPlan) && <option value={currentPlan}>{currentPlan}</option>}
      </select>
      <textarea
        value={just}
        onChange={(e) => setJust(e.target.value)}
        disabled={locked || pending}
        rows={2}
        placeholder="Justifikasi / catatan rencana…"
        className={`${FIELD} w-full py-2 disabled:bg-neutral-tint`}
      />
      {!locked && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => run(false)} disabled={pending}
            className="inline-flex items-center justify-center min-h-9 px-4 rounded-xl border border-line bg-surface text-ink-soft text-[13px] font-semibold hover:text-ink hover:border-line-strong disabled:opacity-60">
            Simpan Draf
          </button>
          <button type="button" onClick={() => run(true)} disabled={pending}
            className="inline-flex items-center justify-center min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white text-[13px] font-bold disabled:opacity-60">
            Ajukan ke Direksi
          </button>
          {planId && (
            <button type="button" onClick={remove} disabled={pending}
              className="text-xs font-semibold text-danger-ink hover:underline ml-auto">
              Hapus
            </button>
          )}
        </div>
      )}
      {locked && <p className="text-xs text-ink-soft italic">Sudah {status === 'approved' ? 'disetujui' : 'ditolak'} Direksi — terkunci.</p>}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
