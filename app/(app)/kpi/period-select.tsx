'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Selektor periode (kuartal) — navigasi tab Rekap agar server merender ulang. Parameter lain
 * (view/dept/auditQ) DIPERTAHANKAN agar filter Divisi di halaman Monitoring tak hilang saat
 * periode diganti. Mode tab SPV (tanpa `view`) tetap diarahkan ke `tab=rekap` seperti semula.
 */
export function PeriodSelect({ periods, current }: { periods: { id: string; label: string }[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (period: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set('period', period);
    if (!sp.has('view')) sp.set('tab', 'rekap');
    sp.delete('auditPage');
    router.push(`${pathname}?${sp.toString()}`);
  };
  return (
    <select
      value={current}
      onChange={(e) => go(e.target.value)}
      className="text-xs p-2.5 border border-line rounded-control bg-surface text-ink font-bold focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint cursor-pointer"
    >
      {periods.map((p) => <option key={p.id} value={p.id}>📦 {p.label}</option>)}
    </select>
  );
}
