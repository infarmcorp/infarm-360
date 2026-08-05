'use client';

import { useRouter } from 'next/navigation';

/** Selektor periode (kuartal) — navigasi tab Rekap agar server merender ulang. */
export function PeriodSelect({ periods, current }: { periods: { id: string; label: string }[]; current: string }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/kpi?tab=rekap&period=${e.target.value}`)}
      className="text-xs p-2.5 border border-line rounded-control bg-surface text-ink font-bold focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint cursor-pointer"
    >
      {periods.map((p) => <option key={p.id} value={p.id}>📦 {p.label}</option>)}
    </select>
  );
}
