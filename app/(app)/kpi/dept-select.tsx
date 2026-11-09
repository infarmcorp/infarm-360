'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';

/**
 * Filter Divisi halaman Monitoring & Audit KPI — DI SERVER lewat URL (`?dept=`), berlaku untuk
 * kedua tab (Rekapitulasi Kuartal & Riwayat & Audit). Parameter lain (view/period/auditQ)
 * dipertahankan; halaman audit direset ke awal karena jumlah barisnya berubah.
 * Pilihan divisi = divisi dalam LINGKUP penonton (dihitung server) — pemegang grant tak
 * bisa memilih divisi di luar lingkupnya, dan server tetap menyaring di dalam lingkup.
 */
export function DeptSelect({ depts, current }: { depts: string[]; current: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const go = (dept: string) => {
    const sp = new URLSearchParams(params.toString());
    if (dept === 'all') sp.delete('dept'); else sp.set('dept', dept);
    sp.delete('auditPage');
    start(() => router.push(`${pathname}?${sp.toString()}`));
  };

  return (
    <label className="inline-block">
      <span className={FIELD_LABEL}>Divisi</span>
      <select value={current ?? 'all'} disabled={pending} onChange={(e) => go(e.target.value)}
        className={`${FIELD} min-w-48 disabled:opacity-60 cursor-pointer`}>
        <option value="all">Seluruh Divisi</option>
        {depts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </label>
  );
}
