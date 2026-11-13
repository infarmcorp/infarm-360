'use client';

import { fmt2, perfCategoryOf } from '@/lib/scoring';

import { useState } from 'react';
import { displayName } from '@/lib/employee-name';
import { BarChart3 } from 'lucide-react';
import { CARD, CardTitle, CAT_COLOR, CAT_TEXT } from '@/components/infarm-ui';

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

// Selaras SCORE_CATS di dashboard-visual.tsx (palet Design System Infarm CAT_COLOR; golongan = perfCategoryOf atas nilai terbulat).
const CATS = [
  { key: 'exceed', label: 'Melampaui (≥90)', color: CAT_COLOR.exceed, text: CAT_TEXT.exceed, test: (v: number) => perfCategoryOf(v) === 'exceed' },
  { key: 'meet', label: 'Memenuhi (80–89)', color: CAT_COLOR.meet, text: CAT_TEXT.meet, test: (v: number) => perfCategoryOf(v) === 'meet' },
  { key: 'improve', label: 'Perlu Peningkatan (70–79)', color: CAT_COLOR.improve, text: CAT_TEXT.improve, test: (v: number) => perfCategoryOf(v) === 'improve' },
  { key: 'below', label: 'Di Bawah (<70)', color: CAT_COLOR.below, text: CAT_TEXT.below, test: (v: number) => perfCategoryOf(v) === 'below' },
] as const;
type CatKey = (typeof CATS)[number]['key'];
export const catOf = (v: number): CatKey => (CATS.find((c) => c.test(v)) ?? CATS[CATS.length - 1]).key;
const labelOfCat = (k: CatKey) => CATS.find((c) => c.key === k)!.label;

function SegBar({ title, people }: { title: string; people: Person[] }) {
  const [sel, setSel] = useState<CatKey | null>(null);
  const total = people.length;
  const groups = { exceed: [] as Person[], meet: [] as Person[], improve: [] as Person[], below: [] as Person[] };
  for (const p of people) groups[catOf(p.value)].push(p);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const selPeople = sel ? [...groups[sel]].sort((a, b) => b.value - a.value) : [];

  return (
    <div className="flex-1 min-w-[240px] rounded-xl border border-line bg-infarm-surface px-4 py-3.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">{title}</div>
        <div className="text-xs text-ink-soft"><span className="font-mono">{total}</span> pegawai bernilai</div>
      </div>
      {total === 0 ? (
        <div className="mt-2 text-[13px] text-ink-soft">Belum ada nilai.</div>
      ) : (
        <>
          {/* Batang bersegmen — tiap segmen tombol; klik → drill-down nama. */}
          <div className="mt-2.5 flex h-7 w-full overflow-hidden rounded-lg bg-neutral-tint">
            {CATS.map((c) => {
              const n = groups[c.key].length;
              if (n === 0) return null;
              const active = sel === c.key;
              return (
                <button key={c.key} type="button"
                  onClick={() => setSel(active ? null : c.key)}
                  title={`${c.label}: ${n} (${pct(n)}%) — klik untuk melihat nama`}
                  aria-pressed={active}
                  style={{ width: `${(n / total) * 100}%`, backgroundColor: c.color, color: c.text }}
                  className={`flex items-center justify-center text-[11px] font-bold font-mono transition-opacity hover:opacity-90 ${
                    sel && !active ? 'opacity-45' : ''}`}>
                  {pct(n) >= 12 ? n : ''}
                </button>
              );
            })}
          </div>
          {/* Legenda: baris tombol (klik = drill-down sama seperti segmen). */}
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {CATS.map((c) => {
              const n = groups[c.key].length;
              const active = sel === c.key;
              return (
                <button key={c.key} type="button"
                  onClick={() => n > 0 && setSel(active ? null : c.key)}
                  disabled={n === 0}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 text-xs rounded px-1 -mx-1 transition-colors ${
                    n === 0 ? 'text-ink-faint cursor-default' : 'text-ink-soft hover:bg-neutral-tint cursor-pointer'} ${
                    active ? 'bg-neutral-tint font-semibold text-ink' : ''}`}>
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                  <span className="font-semibold">{c.label}</span>
                  <span className="font-mono text-ink-soft">{n} · {pct(n)}%</span>
                </button>
              );
            })}
          </div>
          {/* Drill-down: nama pegawai di kategori terpilih. */}
          {sel && (
            <div className="mt-3 pt-2.5 border-t border-line">
              <div className="text-xs font-bold text-ink mb-1">
                {labelOfCat(sel)} — <span className="font-mono">{selPeople.length}</span> pegawai
              </div>
              {selPeople.length === 0 ? (
                <p className="text-xs text-ink-soft italic">Tak ada pegawai.</p>
              ) : (
                <div className="space-y-0.5">
                  {selPeople.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-ink" title={p.name}>{displayName(p.nickname, p.name)}</span>
                      <span className="font-mono font-bold text-ink">{fmt2(p.value)}</span>
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
    <div className={`${CARD} mb-4`}>
      <CardTitle icon={BarChart3} className="mb-4">Distribusi Kinerja (periode terpilih)</CardTitle>
      <div className="flex flex-wrap gap-3">
        <SegBar title="Sebaran KPI" people={kpiPeople} />
        {s360People && <SegBar title="Sebaran 360°" people={s360People} />}
      </div>
      <p className="text-xs text-ink-soft mt-3">Kategori sama dengan Dasbor Organisasi (batas 90/80/70) — sebaran skor, bukan klasifikasi 4-Box.</p>
    </div>
  );
}
