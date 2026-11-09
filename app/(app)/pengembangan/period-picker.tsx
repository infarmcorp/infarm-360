import Link from 'next/link';
import { pillCls } from '@/components/infarm-ui';
import type { PlanPeriod } from '@/lib/dev-plan-server';

/**
 * Pemilih periode laporan (hanya tampil bila lebih dari satu) — pil Design System Infarm. `base` boleh sudah berisi
 * query (mis. ?tab=saya). Dipakai juga Pantauan Rencana Pengembangan (admin) — jaga API.
 */
export function PeriodPicker({ periods, selected, base }: { periods: PlanPeriod[]; selected: string; base: string }) {
  if (periods.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-semibold text-ink-soft mr-1">Periode laporan:</span>
      {periods.map((p) => (
        <Link key={p.id} prefetch={false} href={`${base}${base.includes('?') ? '&' : '?'}period=${p.id}`} className={`${pillCls(p.id === selected)} shrink-0`}>
          {p.label}
        </Link>
      ))}
    </div>
  );
}
