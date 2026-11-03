import Link from 'next/link';
import type { PlanPeriod } from '@/lib/dev-plan-server';

/** Pemilih periode laporan (hanya tampil bila lebih dari satu). `base` boleh sudah berisi query (mis. ?tab=saya). */
export function PeriodPicker({ periods, selected, base }: { periods: PlanPeriod[]; selected: string; base: string }) {
  if (periods.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {periods.map((p) => (
        <Link key={p.id} href={`${base}${base.includes('?') ? '&' : '?'}period=${p.id}`}
          className={`px-3 py-1.5 rounded-control text-sm border ${p.id === selected ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-soft border-line hover:bg-neutral-tint'}`}>
          {p.label}
        </Link>
      ))}
    </div>
  );
}
