'use client';

import { useState } from 'react';

/**
 * Tabel Kalkulasi (hasil resmi result_360) & Perbandingan Model 4/2-Kelas — dengan paginasi
 * 5 pegawai/halaman + tombol geser. Data dihitung di server (bobot/page.tsx); komponen ini
 * hanya menyajikan + memotong per halaman (sisi klien).
 */
const PAGE_SIZE = 5;

function Pager({ cur, pageCount, setPage }: { cur: number; pageCount: number; setPage: (n: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
      <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0}
        className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">← Sebelumnya</button>
      <span>Halaman {cur + 1} / {pageCount}</span>
      <button onClick={() => setPage(Math.min(pageCount - 1, cur + 1))} disabled={cur >= pageCount - 1}
        className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Berikutnya →</button>
    </div>
  );
}

export type StoredRow = { id: string; name: string; dept: string; score: number | null };

export function KalkulasiTable({ rows }: { rows: StoredRow[] }) {
  const [page, setPage] = useState(0);
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">Belum ada hasil resmi. Klik <strong>Hitung Ulang Skor 360°</strong> setelah ada penilaian terkirim.</p>;
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount - 1);
  const shown = rows.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[420px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th><th className="py-2 px-3">Divisi</th><th className="py-2 pl-3 text-right">Skor 360° Resmi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((it) => (
              <tr key={it.id}>
                <td className="py-3 pr-3 font-bold text-gray-800">{it.name}</td>
                <td className="py-3 px-3 text-gray-500">{it.dept}</td>
                <td className="py-3 pl-3 text-right font-mono font-black text-indigo-700">{it.score != null ? it.score.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager cur={cur} pageCount={pageCount} setPage={setPage} />
    </>
  );
}

export type CompareRow = { id: string; name: string; dept: string; s4: number | null; s2: number | null };

export function CompareTable({ rows, model }: { rows: CompareRow[]; model: '4class' | '2class' }) {
  const [page, setPage] = useState(0);
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">Belum ada penilaian terkirim untuk dibandingkan.</p>;
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount - 1);
  const shown = rows.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[480px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className={`py-2 px-3 text-right ${model === '4class' ? 'text-emerald-700' : ''}`}>4-Kelas{model === '4class' ? ' ●' : ''}</th>
              <th className={`py-2 px-3 text-right ${model === '2class' ? 'text-emerald-700' : ''}`}>2-Kelas{model === '2class' ? ' ●' : ''}</th>
              <th className="py-2 pl-3 text-right">Selisih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((c) => {
              const delta = c.s4 != null && c.s2 != null ? Math.round((c.s4 - c.s2) * 10) / 10 : null;
              return (
                <tr key={c.id}>
                  <td className="py-3 pr-3"><span className="font-bold text-gray-800 block">{c.name}</span><span className="text-[11px] text-gray-500">{c.dept}</span></td>
                  <td className={`py-3 px-3 text-right font-mono ${model === '4class' ? 'font-black text-emerald-800' : 'text-gray-600'}`}>{c.s4 != null ? c.s4.toFixed(2) : '—'}</td>
                  <td className={`py-3 px-3 text-right font-mono ${model === '2class' ? 'font-black text-emerald-800' : 'text-gray-600'}`}>{c.s2 != null ? c.s2.toFixed(2) : '—'}</td>
                  <td className={`py-3 pl-3 text-right font-mono font-bold ${delta == null ? 'text-gray-300' : delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-600' : 'text-gray-500'}`}>
                    {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager cur={cur} pageCount={pageCount} setPage={setPage} />
    </>
  );
}
