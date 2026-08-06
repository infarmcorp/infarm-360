'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
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
        <DateField label="Tanggal Mulai" value={startDate} onChange={setStartDate} />
        <DateField label="Tanggal Selesai" value={endDate} onChange={setEndDate} min={startDate || undefined} />
      </div>

      {/* Pratinjau rentang — konfirmasi cepat bahwa tanggal yang dipilih memang yang dimaksud,
          tanpa harus membaca ulang dua kotak "YYYY-MM-DD" yang datar. */}
      <RangePreview start={startDate} end={endDate} />

      <label className="flex items-start gap-2.5 mt-4 text-[13px] text-ink-soft leading-relaxed">
        <input type="checkbox" checked={has360} onChange={(e) => setHas360(e.target.checked)} className="mt-0.5 accent-brand" />
        <span>Sertakan Evaluasi 360° <span className="text-ink font-semibold">(Skor Akhir = blend KPI 50% + 360° 50%; jika tidak, 100% KPI)</span></span>
      </label>

      <div className="flex items-center gap-2.5 mt-4 text-[13px] text-ink-soft">
        <label htmlFor="kpiStandard">Standar/Target KPI untuk metrik dashboard</label>
        <input id="kpiStandard" type="number" min={0} max={100} value={kpiStandard}
          onChange={(e) => setKpiStandard(e.target.value)}
          className="w-16 text-center text-[13px] data-value px-2 py-1.5 rounded-control border border-line text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <span className="text-[12px] text-ink-faint">tak memengaruhi rumus skor · bisa diubah per kuartal</span>
      </div>

      {err && <p className="text-[13px] text-danger-ink font-semibold mt-3">{err}</p>}
      <Button type="submit" disabled={busy} className="mt-5">
        {busy ? 'Membuat…' : 'Buat Periode'}
      </Button>
    </form>
  );
}

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const parseYmd = (s: string) => {
  const p = s.split('-').map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n)) || p[1] < 1 || p[1] > 12) return null;
  return { y: p[0], m: p[1], d: p[2] };
};

/**
 * Kotak tanggal — kalender bawaan browser TETAP dipakai (paling andal & familiar di HP),
 * hanya dibingkai lebih jelas: ikon kalender di kiri, area klik penuh (klik di mana saja pada
 * kotak akan membuka kalender lewat `showPicker()`), dan fokus ber-ring brand.
 */
function DateField({ label, value, onChange, min }: {
  label: string; value: string; onChange: (v: string) => void; min?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = ref.current;
    if (!el) return;
    // showPicker belum ada di semua browser (mis. Safari lama) → abaikan bila tak didukung.
    try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* fallback: ikon bawaan */ }
  };
  return (
    <div>
      <label className="block text-[12.5px] font-medium text-ink-soft mb-1.5">{label}</label>
      <div
        onClick={openPicker}
        className="relative flex items-center rounded-control border border-line bg-[#FDFDFC] cursor-pointer transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-tint hover:border-line-strong"
      >
        <CalendarDays className="w-4 h-4 text-brand shrink-0 ml-3" aria-hidden />
        <input
          ref={ref} type="date" value={value} min={min} required
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[13.5px] data-value text-ink px-2.5 py-2 focus:outline-none"
        />
      </div>
    </div>
  );
}

/** Ringkasan rentang terpilih: "1 Jan – 31 Mar 2026 · 3 bulan" + chip bulan. */
function RangePreview({ start, end }: { start: string; end: string }) {
  const a = parseYmd(start), b = parseYmd(end);
  if (!a || !b) return null;
  const backwards = b.y < a.y || (b.y === a.y && (b.m < a.m || (b.m === a.m && b.d < a.d)));
  if (backwards) {
    return (
      <p className="mt-3 text-[12px] font-semibold text-danger-ink">
        Tanggal selesai lebih awal dari tanggal mulai.
      </p>
    );
  }
  const chips: { key: string; label: string }[] = [];
  for (let y = a.y, m = a.m; (y < b.y || (y === b.y && m <= b.m)) && chips.length < 24; ) {
    chips.push({ key: `${y}-${m}`, label: ID_MONTHS[m - 1] });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  const left = `${a.d} ${ID_MONTHS[a.m - 1]}${a.y !== b.y ? ` ${a.y}` : ''}`;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control border border-line bg-neutral-tint/60 px-3 py-2">
      <span className="text-[12.5px] font-semibold text-ink data-value">
        {left} – {b.d} {ID_MONTHS[b.m - 1]} {b.y}
      </span>
      <span className="text-[11px] text-ink-faint">· mencakup <span className="data-value font-bold text-ink-soft">{chips.length}</span> bulan</span>
      <span className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span key={c.key} className="text-[10px] font-semibold text-ink-soft bg-surface border border-line rounded-control px-1.5 py-0.5">{c.label}</span>
        ))}
      </span>
    </div>
  );
}
