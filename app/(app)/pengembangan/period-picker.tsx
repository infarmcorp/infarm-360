import Link from 'next/link';
import { pillCls } from '@/components/infarm-ui';
import { splitPeriodPills } from '@/lib/dev-plan';
import type { PlanPeriod } from '@/lib/dev-plan-server';
import { PeriodMore } from './period-more';

/**
 * Pemilih periode laporan (hanya tampil bila lebih dari satu) — pil Design System Infarm. Hanya `PERIOD_PILL_MAX`
 * periode terbaru berupa kapsul; periode lebih lama lewat daftar "Periode lain" agar deret tak memanjang tiap
 * kuartal. `base` boleh sudah berisi query (mis. ?tab=saya). Dipakai juga Pantauan Rencana Pengembangan (admin) —
 * jaga API.
 */
export function PeriodPicker({ periods, selected, base }: { periods: PlanPeriod[]; selected: string; base: string }) {
  if (periods.length < 2) return null;
  const { pills, more } = splitPeriodPills(periods);
  const sep = base.includes('?') ? '&' : '?';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-semibold text-ink-soft mr-1">Periode laporan:</span>
      {pills.map((p) => (
        <Link key={p.id} prefetch={false} href={`${base}${sep}period=${p.id}`} className={`${pillCls(p.id === selected)} shrink-0`}>
          {p.label}
        </Link>
      ))}
      {more.length > 0 && (
        <PeriodMore periods={more.map((p) => ({ id: p.id, label: p.label }))} selected={selected} base={base} />
      )}
    </div>
  );
}
