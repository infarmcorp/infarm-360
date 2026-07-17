'use client';

import { useState } from 'react';
import { kpiBandOf, s360BandOf, type Band } from '@/lib/scoring';

/**
 * Distribusi kinerja tim (periode terpilih) sebagai BATANG BERSEGMEN — melengkapi rata-rata
 * (scorecard) & tren (grafik garis) dengan SEBARAN: berapa pegawai Melampaui / Memenuhi / Di
 * Bawah ekspektasi. Ambang memakai band TERKUNCI `kpiBandOf`/`s360BandOf` (lib/scoring.ts) — tak
 * ada rumus baru. Tampil JUMLAH pegawai (+ persen) — penting karena tim bisa kecil (koordinator/
 * SPV): "1 dari 3" akan menyesatkan bila hanya persen.
 *
 * INTERAKTIF (drill-down ala Looker): klik segmen batang ATAU baris legenda → daftar nama pegawai
 * di band itu (diurut nilai menurun). Klik lagi untuk menutup. Nama sudah berlingkup per peran di
 * pemanggil (SPV/HRD/Koordinator) — komponen presentasional, tak mengambil data sendiri.
 *
 *   KPI:  Melampaui ≥90 · Memenuhi 80–89 · Di Bawah <80
 *   360°: Melampaui ≥80 · Memenuhi 70–79 · Di Bawah <70
 */
export type Person = { name: string; value: number };

const SEG = [
  { key: 'hi' as const, color: '#16a34a', chip: 'bg-emerald-600', ring: 'ring-emerald-500' },
  { key: 'mid' as const, color: '#eab308', chip: 'bg-yellow-500', ring: 'ring-yellow-500' },
  { key: 'lo' as const, color: '#e11d48', chip: 'bg-rose-600', ring: 'ring-rose-500' },
];

function SegBar({ title, people, bandOf, labels }: {
  title: string; people: Person[]; bandOf: (n: number) => Band; labels: [string, string, string];
}) {
  const [sel, setSel] = useState<Band | null>(null);
  const total = people.length;
  const groups: Record<Band, Person[]> = { hi: [], mid: [], lo: [] };
  for (const p of people) groups[bandOf(p.value)].push(p);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const labelOf = (b: Band) => labels[SEG.findIndex((s) => s.key === b)];
  const selPeople = sel ? [...groups[sel]].sort((a, b) => b.value - a.value) : [];

  return (
    <div className="flex-1 min-w-[240px] rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{title}</div>
        <div className="text-[11px] text-gray-400">{total} pegawai bernilai</div>
      </div>
      {total === 0 ? (
        <div className="mt-2 text-sm text-gray-400">Belum ada nilai.</div>
      ) : (
        <>
          {/* Batang bersegmen — tiap segmen tombol; klik → drill-down nama. */}
          <div className="mt-2 flex h-5 w-full overflow-hidden rounded-md border border-gray-200 bg-white">
            {SEG.map((s) => {
              const n = groups[s.key].length;
              if (n === 0) return null;
              const active = sel === s.key;
              return (
                <button key={s.key} type="button"
                  onClick={() => setSel(active ? null : s.key)}
                  title={`${labelOf(s.key)}: ${n} (${pct(n)}%) — klik untuk lihat nama`}
                  aria-pressed={active}
                  style={{ width: `${(n / total) * 100}%`, backgroundColor: s.color }}
                  className={`flex items-center justify-center text-[10px] font-bold text-white transition-opacity hover:opacity-90 ${
                    sel && !active ? 'opacity-45' : ''}`}>
                  {pct(n) >= 12 ? n : ''}
                </button>
              );
            })}
          </div>
          {/* Legenda: baris tombol (klik = drill-down sama seperti segmen). */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {SEG.map((s, i) => {
              const n = groups[s.key].length;
              const active = sel === s.key;
              return (
                <button key={s.key} type="button"
                  onClick={() => n > 0 && setSel(active ? null : s.key)}
                  disabled={n === 0}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 text-[11px] rounded px-1 -mx-1 transition-colors ${
                    n === 0 ? 'text-gray-400 cursor-default' : 'text-gray-600 hover:bg-gray-100 cursor-pointer'} ${
                    active ? 'bg-gray-100 font-semibold' : ''}`}>
                  <span className={`inline-block w-2.5 h-2.5 rounded-sm ${s.chip}`} />
                  <span className="font-semibold">{labels[i]}</span>
                  <span className="font-mono text-gray-500">{n} · {pct(n)}%</span>
                </button>
              );
            })}
          </div>
          {/* Drill-down: nama pegawai di band terpilih. */}
          {sel && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="text-[11px] font-bold text-gray-600 mb-1">
                {labelOf(sel)} — {selPeople.length} pegawai
              </div>
              {selPeople.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">Tak ada pegawai.</p>
              ) : (
                <div className="space-y-0.5">
                  {selPeople.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate text-gray-700">{p.name}</span>
                      <span className="font-mono font-bold text-slate-700">{p.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DistBars({ kpiPeople, s360People }: { kpiPeople: Person[]; s360People: Person[] | null }) {
  return (
    <div className="mb-4">
      <div className="text-sm font-bold text-gray-700 mb-2">Distribusi Kinerja (periode terpilih)</div>
      <div className="flex flex-wrap gap-3">
        <SegBar title="Sebaran KPI" people={kpiPeople} bandOf={kpiBandOf}
          labels={['Melampaui (≥90)', 'Memenuhi (80–89)', 'Di Bawah (<80)']} />
        {s360People && (
          <SegBar title="Sebaran 360°" people={s360People} bandOf={s360BandOf}
            labels={['Melampaui (≥80)', 'Memenuhi (70–79)', 'Di Bawah (<70)']} />
        )}
      </div>
    </div>
  );
}
