'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AccButton } from './acc-button';

export type TeamRow = {
  id: string;
  name: string;
  dept: string | null;
  finalScore: number | null;
  status: string | null;
  hasReport: boolean;
  spvAcc: boolean;
  isSelf: boolean;
};

/**
 * Tabel Laporan Kinerja Tim dengan pencarian nama pegawai.
 * Baris SPV sendiri (isSelf) ditandai "Anda" dan ACC dinonaktifkan
 * (SPV tidak boleh meng-ACC laporannya sendiri — lihat migrasi 0009).
 */
export function TeamTable({ rows }: { rows: TeamRow[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(term) || (r.dept ?? '').toLowerCase().includes(term),
    );
  }, [q, rows]);

  return (
    <div>
      <div className="mb-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama pegawai…"
          aria-label="Cari nama pegawai"
          className="w-full sm:max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada pegawai cocok dengan "{q}".</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[480px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3">Anggota</th>
                <th className="py-2 px-3 text-center">Skor Akhir</th>
                <th className="py-2 px-3 text-center">Status</th>
                <th className="py-2 pl-3 text-right">ACC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-3">
                    <Link
                      href={`/laporan/${r.id}`}
                      className="font-bold text-gray-800 inline-flex items-center gap-1.5 hover:text-emerald-700 hover:underline"
                    >
                      {r.name}
                      {r.isSelf && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">
                          Anda
                        </span>
                      )}
                    </Link>
                    <span className="text-[11px] text-gray-500 block">{r.dept}</span>
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-black text-slate-800">
                    {r.finalScore != null ? r.finalScore.toFixed(1) : '—'}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {r.status === 'finalized' ? (
                      <span className="text-[10px] font-bold text-emerald-700">Final</span>
                    ) : r.status === 'draft' ? (
                      <span className="text-[10px] font-bold text-amber-700">Draf</span>
                    ) : (
                      <span className="text-[10px] text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    {r.isSelf ? (
                      <span className="text-[10px] text-gray-500 italic">laporan Anda</span>
                    ) : (
                      <AccButton employeeId={r.id} acc={r.spvAcc} hasReport={r.hasReport} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
