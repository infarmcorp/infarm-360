'use client';

import { useState, useTransition } from 'react';
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
        className="w-full text-xs p-2 border border-gray-200 rounded-lg bg-white disabled:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-600"
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
        className="w-full text-xs p-2 border border-gray-200 rounded-lg disabled:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-600"
      />
      {!locked && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => run(false)} disabled={pending}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-60">
            Simpan Draf
          </button>
          <button type="button" onClick={() => run(true)} disabled={pending}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
            Ajukan ke Direksi
          </button>
          {planId && (
            <button type="button" onClick={remove} disabled={pending}
              className="text-[11px] font-semibold text-rose-600 hover:underline ml-auto">
              Hapus
            </button>
          )}
        </div>
      )}
      {locked && <p className="text-[10px] text-gray-400 italic">Sudah {status === 'approved' ? 'disetujui' : 'ditolak'} Direksi — terkunci.</p>}
      {msg && <p className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}
