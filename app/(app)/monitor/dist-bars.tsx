'use client';

import { fmt2 } from '@/lib/scoring';

import { useState } from 'react';
import { displayName } from '@/lib/employee-name';

/**
 * Distribusi kinerja tim (periode terpilih) sebagai BATANG BERSEGMEN — melengkapi rata-rata
 * (scorecard) & tren (grafik garis) dengan SEBARAN pegawai per kategori kinerja. Menampilkan
 * JUMLAH pegawai (+ persen) — penting karena tim bisa kecil (koordinator/SPV): "1 dari 3" akan
 * menyesatkan bila hanya persen.
 *
 * KATEGORI DISERAGAMKAN dengan Dashboard Organisasi (donut) — band 90/80/70 yang SAMA untuk KPI &
 * 360° (Melampaui ≥90 · Memenuhi 80–89 · Perlu Peningkatan 70–79 · Di Bawah <70). Ini distribusi
 * skor mentah (bukan klasifikasi 4-Box) — konsisten lintas halaman.
 *
 * INTERAKTIF (drill-down ala Looker): klik segmen batang ATAU baris legenda → daftar nama pegawai
 * di kategori itu (diurut nilai menurun). Klik lagi untuk menutup. Nama sudah berlingkup per peran
 * di pemanggil (SPV/HRD/Koordinator) — komponen presentasional, tak mengambil data sendiri.
 */
export type Person = { name: string; nickname?: string | null; value: number };

// Selaras SCORE_CATS di dashboard-visual.tsx (palet & ambang sama).
const CATS = [
  { key: 'exceed', label: 'Melampaui (≥90)', color: '#183c6c', dark: false, test: (v: number) => v >= 90 },
  { key: 'meet', label: 'Memenuhi (80–89)', color: '#388e3c', dark: false, test: (v: number) => v >= 80 && v < 90 },
  { key: 'improve', label: 'Perlu Peningkatan (70–79)', color: '#ffc107', dark: true, test: (v: number) => v >= 70 && v < 80 },
  { key: 'below', label: 'Di Bawah (<70)', color: '#b71c1c', dark: false, test: (v: number) => v < 70 },
] as const;
type CatKey = (typeof CATS)[number]['key'];
const catOf = (v: number): CatKey => (CATS.find((c) => c.test(v)) ?? CATS[CATS.length - 1]).key;
const labelOfCat = (k: CatKey) => CATS.find((c) => c.key === k)!.label;

function SegBar({ title, people }: { title: string; people: Person[] }) {
  const [sel, setSel] = useState<CatKey | null>(null);
  const total = people.length;
  const groups = { exceed: [] as Person[], meet: [] as Person[], improve: [] as Person[], below: [] as Person[] };
  for (const p of people) groups[catOf(p.value)].push(p);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
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
            {CATS.map((c) => {
              const n = groups[c.key].length;
              if (n === 0) return null;
              const active = sel === c.key;
              return (
                <button key={c.key} type="button"
                  onClick={() => setSel(active ? null : c.key)}
                  title={`${c.label}: ${n} (${pct(n)}%) — klik untuk lihat nama`}
                  aria-pressed={active}
                  style={{ width: `${(n / total) * 100}%`, backgroundColor: c.color, color: c.dark ? '#1f2937' : '#fff' }}
                  className={`flex items-center justify-center text-[10px] font-bold transition-opacity hover:opacity-90 ${
                    sel && !active ? 'opacity-45' : ''}`}>
                  {pct(n) >= 12 ? n : ''}
                </button>
              );
            })}
          </div>
          {/* Legenda: baris tombol (klik = drill-down sama seperti segmen). */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {CATS.map((c) => {
              const n = groups[c.key].length;
              const active = sel === c.key;
              return (
                <button key={c.key} type="button"
                  onClick={() => n > 0 && setSel(active ? null : c.key)}
                  disabled={n === 0}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 text-[11px] rounded px-1 -mx-1 transition-colors ${
                    n === 0 ? 'text-gray-400 cursor-default' : 'text-gray-600 hover:bg-gray-100 cursor-pointer'} ${
                    active ? 'bg-gray-100 font-semibold' : ''}`}>
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                  <span className="font-semibold">{c.label}</span>
                  <span className="font-mono text-gray-500">{n} · {pct(n)}%</span>
                </button>
              );
            })}
          </div>
          {/* Drill-down: nama pegawai di kategori terpilih. */}
          {sel && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="text-[11px] font-bold text-gray-600 mb-1">
                {labelOfCat(sel)} — {selPeople.length} pegawai
              </div>
              {selPeople.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">Tak ada pegawai.</p>
              ) : (
                <div className="space-y-0.5">
                  {selPeople.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate text-gray-700" title={p.name}>{displayName(p.nickname, p.name)}</span>
                      <span className="font-mono font-bold text-slate-700">{fmt2(p.value)}</span>
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
        <SegBar title="Sebaran KPI" people={kpiPeople} />
        {s360People && <SegBar title="Sebaran 360°" people={s360People} />}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">Kategori seragam dengan Dashboard Organisasi (band Skor 90/80/70) — distribusi skor, bukan klasifikasi 4-Box.</p>
    </div>
  );
}
