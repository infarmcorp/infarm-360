'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPeriod } from './actions';

export function PeriodForm() {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [has360, setHas360] = useState(true);
  const [kpiStandard, setKpiStandard] = useState('80');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const std = Number(kpiStandard);
    if (!Number.isInteger(std) || std < 0 || std > 100) { setErr('Standar KPI harus bilangan bulat 0–100'); return; }
    setBusy(true); setErr(null);
    const res = await createPeriod({ label, startDate, endDate, has360, kpiStandard: std });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setLabel(''); setStartDate(''); setEndDate(''); setKpiStandard('80');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Buat Periode Baru</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 mb-1">Label (mis. Q4 2026)</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="Q4 2026"
            className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 mb-1">Tanggal Mulai</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
            className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 mb-1">Tanggal Selesai</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required
            className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={has360} onChange={(e) => setHas360(e.target.checked)} />
        Sertakan Evaluasi 360° (Skor Akhir = blend KPI 50% + 360° 50%; jika tidak, 100% KPI)
      </label>
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <label htmlFor="kpiStandard">Standar/Target KPI (≥) untuk metrik dashboard:</label>
        <input id="kpiStandard" type="number" min={0} max={100} value={kpiStandard}
          onChange={(e) => setKpiStandard(e.target.value)}
          className="w-16 text-center text-sm px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        <span className="text-[10px] text-gray-500">tak memengaruhi rumus skor; bisa diubah per kuartal</span>
      </div>
      {err && <p className="text-xs text-rose-600 font-semibold">{err}</p>}
      <button type="submit" disabled={busy}
        className="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
        {busy ? 'Membuat…' : 'Buat Periode'}
      </button>
    </form>
  );
}
