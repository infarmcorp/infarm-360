'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPeriod } from './actions';
import { Button } from '@/components/button';

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

  const inputCls = 'w-full text-[13.5px] px-3 py-2 rounded-control border border-line bg-[#FDFDFC] text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint';

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr] gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-ink-soft mb-1.5">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="Q4 2026" className={inputCls} />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-ink-soft mb-1.5">Tanggal Mulai</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-ink-soft mb-1.5">Tanggal Selesai</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className={`${inputCls} font-mono`} />
        </div>
      </div>

      <label className="flex items-start gap-2.5 mt-4 text-[13px] text-ink-soft leading-relaxed">
        <input type="checkbox" checked={has360} onChange={(e) => setHas360(e.target.checked)} className="mt-0.5 accent-brand" />
        <span>Sertakan Evaluasi 360° <span className="text-ink font-semibold">(Skor Akhir = blend KPI 50% + 360° 50%; jika tidak, 100% KPI)</span></span>
      </label>

      <div className="flex items-center gap-2.5 mt-4 text-[13px] text-ink-soft">
        <label htmlFor="kpiStandard">Standar/Target KPI untuk metrik dashboard</label>
        <input id="kpiStandard" type="number" min={0} max={100} value={kpiStandard}
          onChange={(e) => setKpiStandard(e.target.value)}
          className="w-16 text-center text-[13px] font-mono px-2 py-1.5 rounded-control border border-line text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <span className="text-[12px] text-ink-faint">tak memengaruhi rumus skor · bisa diubah per kuartal</span>
      </div>

      {err && <p className="text-[13px] text-danger-ink font-semibold mt-3">{err}</p>}
      <Button type="submit" disabled={busy} className="mt-5">
        {busy ? 'Membuat…' : 'Buat Periode'}
      </Button>
    </form>
  );
}
