'use client';

import { fmt2 } from '@/lib/scoring';

import { useMemo, useState } from 'react';
import { usePager, Pager, CheckboxFilter } from '@/components/table-controls';

/**
 * Tabel Kalkulasi Skor 360° — SATU tabel fokus bobot, dengan grup kolom "Perbandingan Model"
 * (4/2-Kelas) DIPISAH di kanan. Menyatukan bekas tabel Kalkulasi + Perbandingan Model:
 *  - Grup "Bobot & Skor": Pegawai · Bobot dipakai (Default/Khusus) · Skor Resmi · Δ vs Default.
 *  - Grup "Perbandingan Model" (bobot global): 4-Kelas · 2-Kelas · Δ.
 * Filter "hanya bobot khusus" + paginasi 5/hal (komponen bersama). Data dihitung server (bobot/page.tsx).
 */

export type MergedRow = {
  id: string; name: string; dept: string;
  scoreResmi: number | null;            // result_360 tersimpan (dipakai dashboard/laporan)
  hasOverride: boolean;
  overrideLabel: string | null;         // ringkasan bobot khusus, mis. "2-Kelas · A70/Int30"
  deltaWeight: number | null;           // dampak bobot khusus (simulasi khusus − default); null bila tak ada override
  s4: number | null; s2: number | null; // simulasi model (bobot global periode)
};

const fmt = (n: number | null) => (n != null ? fmt2(n) : '—');
const deltaCls = (d: number | null) => (d == null || d === 0 ? 'text-ink-faint' : d > 0 ? 'text-brand-ink' : 'text-danger-ink');
const deltaTxt = (d: number | null) => (d == null ? '—' : d === 0 ? '0' : `${d > 0 ? '+' : ''}${fmt2(d)}`);

export function Kalkulasi360Table({ rows, model, overrideCount, globalLabel }: {
  rows: MergedRow[]; model: '4class' | '2class'; overrideCount: number; globalLabel: string;
}) {
  const [onlyOverride, setOnlyOverride] = useState(false);

  const filtered = useMemo(() => (onlyOverride ? rows.filter((r) => r.hasOverride) : rows), [rows, onlyOverride]);
  const { page, setPage, pageCount, shown, total, rangeFrom, rangeTo } = usePager(filtered);

  if (rows.length === 0) {
    return <p className="text-sm text-ink-soft">Belum ada data. Jalankan <strong className="font-semibold text-ink">Hitung Ulang Skor 360°</strong> di Review &amp; Finalisasi setelah ada penilaian terkirim.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-ink-soft">
          {overrideCount > 0
            ? <><strong className="data-value text-brand-ink">{overrideCount}</strong> pegawai berbobot khusus · sisanya bobot global (<span className="data-value">{globalLabel}</span>)</>
            : <>Semua pegawai memakai bobot global (<span className="data-value">{globalLabel}</span>)</>}
        </span>
        {overrideCount > 0 && (
          <CheckboxFilter
            checked={onlyOverride}
            onChange={(v) => { setOnlyOverride(v); setPage(0); }}
            label="Hanya bobot khusus"
          />
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[720px]">
          <thead>
            {/* Header grup: bobot-fokus | (pemisah) perbandingan model */}
            <tr className="text-[10px] uppercase tracking-[0.05em] text-ink-faint">
              <th className="py-1.5 pr-3 font-semibold" colSpan={3}>Bobot &amp; Skor</th>
              <th className="py-1.5 px-3 text-center border-l border-line font-semibold" colSpan={3}>Perbandingan Model (bobot global)</th>
            </tr>
            <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
              <th className="py-2 pr-3 font-semibold">Pegawai</th>
              <th className="py-2 px-3 font-semibold">Bobot dipakai</th>
              <th className="py-2 px-3 text-right font-semibold">Skor Resmi</th>
              <th className="py-2 px-3 text-right border-l border-line font-semibold">4-Kelas{model === '4class' ? ' ●' : ''}</th>
              <th className="py-2 px-3 text-right font-semibold">2-Kelas{model === '2class' ? ' ●' : ''}</th>
              <th className="py-2 pl-3 text-right font-semibold">Δ Model</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {shown.map((r) => {
              const dModel = r.s4 != null && r.s2 != null ? Math.round((r.s4 - r.s2) * 100) / 100 : null;
              return (
                <tr key={r.id} className={r.hasOverride ? 'bg-brand-tint/50' : ''}>
                  <td className="py-3 pr-3">
                    <span className="font-bold text-ink block">{r.name}</span>
                    <span className="text-[11px] text-ink-faint">{r.dept}</span>
                  </td>
                  <td className="py-3 px-3">
                    {r.hasOverride ? (
                      <span className="inline-flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-ink bg-brand-tint border border-brand/20 rounded-full px-2 py-0.5 w-fit">Khusus</span>
                        <span className="text-[10px] text-ink-faint data-value">{r.overrideLabel}</span>
                        {r.deltaWeight != null && (
                          <span className={`text-[10px] font-semibold ${deltaCls(r.deltaWeight)}`}>vs default: <span className="data-value">{deltaTxt(r.deltaWeight)}</span></span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-faint">Default</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right data-value font-bold text-brand-ink">{fmt(r.scoreResmi)}</td>
                  <td className={`py-3 px-3 text-right data-value border-l border-line ${model === '4class' ? 'font-bold text-brand-ink' : 'text-ink-soft'}`}>{fmt(r.s4)}</td>
                  <td className={`py-3 px-3 text-right data-value ${model === '2class' ? 'font-bold text-brand-ink' : 'text-ink-soft'}`}>{fmt(r.s2)}</td>
                  <td className={`py-3 pl-3 text-right data-value font-bold ${deltaCls(dModel)}`}>{deltaTxt(dModel)}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-ink-faint italic">Tak ada pegawai berbobot khusus.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />

      <p className="text-[11px] text-ink-faint leading-relaxed">
        <strong className="font-semibold text-ink-soft">Skor Resmi</strong> = hasil tersimpan (result_360) dari Hitung Ulang terakhir — dipakai dashboard/laporan.
        <strong className="font-semibold text-ink-soft"> vs default</strong> = dampak bobot khusus (simulasi: skor bobot khusus − skor bobot global). <strong className="font-semibold text-ink-soft">Perbandingan Model</strong> =
        simulasi 4/2-Kelas memakai bobot global periode (Δ Model = 4-Kelas − 2-Kelas); tak mengubah data.
      </p>
    </div>
  );
}
