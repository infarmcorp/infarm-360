'use client';

import { useMemo, useState } from 'react';

/** Satu baris audit KPI (rata/flat) — terbaru lebih dulu (urut server by changed_at desc). */
export type FlatAudit = {
  empId: string; name: string; dept: string;
  ym: string; score: number; by: string; at: string; note: string | null; action?: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };

/**
 * Daftar audit KPI RATA (flat) — diurut TERBARU DI ATAS (bukan dikelompokkan per nama).
 * Siapa pun yang paling baru mengubah KPI muncul di baris teratas. Pencarian menyaring
 * nama/divisi/pengubah tanpa mengubah urutan kronologis. Append-only (tak bisa diubah).
 */
export function RiwayatList({ entries }: { entries: FlatAudit[] }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries;
    return entries.filter((e) => `${e.name} ${e.dept} ${e.by}`.toLowerCase().includes(t));
  }, [entries, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">
          Jejak perubahan KPI bersifat <strong>append-only</strong> — tidak dapat diubah/dihapus. Urut <strong>terbaru di atas</strong>.
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / divisi / pengubah…"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada jejak audit yang cocok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[680px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-150 bg-white">
                <th className="py-2 px-3">Pegawai</th>
                <th className="py-2 px-3">Bulan</th>
                <th className="py-2 px-3 text-center">Skor</th>
                <th className="py-2 px-3">Oleh</th>
                <th className="py-2 px-3">Waktu</th>
                <th className="py-2 px-3">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r, i) => (
                <tr key={`${r.empId}-${r.ym}-${i}`}>
                  <td className="py-2 px-3">
                    <span className="font-bold text-gray-800">{r.name}</span>
                    <span className="text-[10px] text-gray-500 block">{r.dept}</span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-gray-700 whitespace-nowrap">{labelMonth(r.ym)}</td>
                  <td className="py-2 px-3 text-center font-mono font-bold">
                    {r.action === 'delete'
                      ? <span className="text-rose-600" title="Skor dihapus">dihapus <span className="text-gray-400 font-normal">(dari {r.score.toFixed(2)})</span></span>
                      : <span className="text-emerald-700">{r.score.toFixed(2)}</span>}
                  </td>
                  <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.by}</td>
                  <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{r.at}</td>
                  <td className="py-2 px-3 text-gray-500 italic">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
