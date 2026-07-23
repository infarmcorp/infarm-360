'use client';

import { useMemo, useState } from 'react';

/**
 * Tabel Kalkulasi Skor 360° — SATU tabel fokus bobot, dengan grup kolom "Perbandingan Model"
 * (4/2-Kelas) DIPISAH di kanan. Menyatukan bekas tabel Kalkulasi + Perbandingan Model:
 *  - Grup "Bobot & Skor": Pegawai · Bobot dipakai (Default/Khusus) · Skor Resmi · Δ vs Default.
 *  - Grup "Perbandingan Model" (bobot global): 4-Kelas · 2-Kelas · Δ.
 * Filter "hanya bobot khusus" + paginasi 5/hal. Data dihitung server (bobot/page.tsx).
 */
const PAGE_SIZE = 5;

export type MergedRow = {
  id: string; name: string; dept: string;
  scoreResmi: number | null;            // result_360 tersimpan (dipakai dashboard/laporan)
  hasOverride: boolean;
  overrideLabel: string | null;         // ringkasan bobot khusus, mis. "2-Kelas · A70/Int30"
  deltaWeight: number | null;           // dampak bobot khusus (simulasi khusus − default); null bila tak ada override
  s4: number | null; s2: number | null; // simulasi model (bobot global periode)
};

const fmt = (n: number | null) => (n != null ? n.toFixed(2) : '—');
const deltaCls = (d: number | null) => (d == null || d === 0 ? 'text-gray-400' : d > 0 ? 'text-emerald-700' : 'text-rose-600');
const deltaTxt = (d: number | null) => (d == null ? '—' : d === 0 ? '0' : `${d > 0 ? '+' : ''}${d.toFixed(2)}`);

export function Kalkulasi360Table({ rows, model, overrideCount, globalLabel }: {
  rows: MergedRow[]; model: '4class' | '2class'; overrideCount: number; globalLabel: string;
}) {
  const [page, setPage] = useState(0);
  const [onlyOverride, setOnlyOverride] = useState(false);

  const filtered = useMemo(() => (onlyOverride ? rows.filter((r) => r.hasOverride) : rows), [rows, onlyOverride]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount - 1);
  const shown = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">Belum ada data. Klik <strong>Hitung Ulang Skor 360°</strong> setelah ada penilaian terkirim.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">
          {overrideCount > 0
            ? <><strong className="text-indigo-700">{overrideCount}</strong> pegawai berbobot khusus · sisanya bobot global ({globalLabel})</>
            : <>Semua pegawai memakai bobot global ({globalLabel})</>}
        </span>
        {overrideCount > 0 && (
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={onlyOverride} onChange={(e) => { setOnlyOverride(e.target.checked); setPage(0); }} className="accent-indigo-600" />
            Hanya bobot khusus
          </label>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[720px]">
          <thead>
            {/* Header grup: bobot-fokus | (pemisah) perbandingan model */}
            <tr className="text-[10px] uppercase tracking-wider text-gray-400">
              <th className="py-1.5 pr-3" colSpan={3}>Bobot &amp; Skor</th>
              <th className="py-1.5 px-3 text-center border-l border-gray-300" colSpan={3}>Perbandingan Model (bobot global)</th>
            </tr>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3">Bobot dipakai</th>
              <th className="py-2 px-3 text-right">Skor Resmi</th>
              <th className="py-2 px-3 text-right border-l border-gray-300">4-Kelas{model === '4class' ? ' ●' : ''}</th>
              <th className="py-2 px-3 text-right">2-Kelas{model === '2class' ? ' ●' : ''}</th>
              <th className="py-2 pl-3 text-right">Δ Model</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => {
              const dModel = r.s4 != null && r.s2 != null ? Math.round((r.s4 - r.s2) * 100) / 100 : null;
              return (
                <tr key={r.id} className={r.hasOverride ? 'bg-indigo-50/40' : ''}>
                  <td className="py-3 pr-3">
                    <span className="font-bold text-gray-800 block">{r.name}</span>
                    <span className="text-[11px] text-gray-500">{r.dept}</span>
                  </td>
                  <td className="py-3 px-3">
                    {r.hasOverride ? (
                      <span className="inline-flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-100 rounded-full px-2 py-0.5 w-fit">🏷️ Khusus</span>
                        <span className="text-[10px] text-gray-500 font-mono">{r.overrideLabel}</span>
                        {r.deltaWeight != null && (
                          <span className={`text-[10px] font-semibold ${deltaCls(r.deltaWeight)}`}>vs default: {deltaTxt(r.deltaWeight)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400">Default</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-black text-indigo-700">{fmt(r.scoreResmi)}</td>
                  <td className={`py-3 px-3 text-right font-mono border-l border-gray-200 ${model === '4class' ? 'font-black text-emerald-800' : 'text-gray-600'}`}>{fmt(r.s4)}</td>
                  <td className={`py-3 px-3 text-right font-mono ${model === '2class' ? 'font-black text-emerald-800' : 'text-gray-600'}`}>{fmt(r.s2)}</td>
                  <td className={`py-3 pl-3 text-right font-mono font-bold ${deltaCls(dModel)}`}>{deltaTxt(dModel)}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-gray-500 italic">Tak ada pegawai berbobot khusus.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">← Sebelumnya</button>
          <span>Halaman {cur + 1} / {pageCount}</span>
          <button onClick={() => setPage(Math.min(pageCount - 1, cur + 1))} disabled={cur >= pageCount - 1}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Berikutnya →</button>
        </div>
      )}

      <p className="text-[10px] text-gray-500 italic">
        <strong>Skor Resmi</strong> = hasil tersimpan (result_360) dari Hitung Ulang terakhir — dipakai dashboard/laporan.
        <strong> vs default</strong> = dampak bobot khusus (simulasi: skor bobot khusus − skor bobot global). <strong>Perbandingan Model</strong> =
        simulasi 4/2-Kelas memakai bobot global periode (Δ Model = 4-Kelas − 2-Kelas); tak mengubah data.
      </p>
    </div>
  );
}
