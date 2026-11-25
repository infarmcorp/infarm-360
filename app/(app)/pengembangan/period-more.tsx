'use client';

import { useRouter } from 'next/navigation';
import { FIELD } from '@/components/infarm-ui';

/**
 * Daftar "Periode lain" di pemilih Periode laporan — periode lama di luar kapsul terbaru. Bila periode terpilih ada
 * di sini, kotak bergaris hijau agar setara dengan kapsul aktif.
 */
export function PeriodMore({ periods, selected, base }: {
  periods: { id: string; label: string }[]; selected: string; base: string;
}) {
  const router = useRouter();
  const active = periods.some((p) => p.id === selected);
  const sep = base.includes('?') ? '&' : '?';
  return (
    <select
      value={active ? selected : ''}
      onChange={(e) => { if (e.target.value) router.push(`${base}${sep}period=${e.target.value}`); }}
      className={`${FIELD} rounded-full font-semibold ${active ? 'border-brand text-brand' : 'text-ink-soft'}`}
    >
      <option value="">Periode lain…</option>
      {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}
