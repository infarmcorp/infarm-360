'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReportStatus } from '@/lib/database.types';
import { ReportRowActions } from './report-row';

export type ReportRow = {
  id: string; name: string; dept: string;
  final: number | null; status: ReportStatus | null; spvAcc: boolean;
};

/** Tabel Review Hasil Akhir + pencarian nama/divisi & filter Divisi (client). */
export function ReportTable({ rows, depts }: { rows: ReportRow[]; depts: string[] }) {
  const [q, setQ] = useState('');
  const [fDept, setFDept] = useState('all');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (fDept === 'all' || r.dept === fDept) &&
      (!needle || `${r.name} ${r.dept}`.toLowerCase().includes(needle)),
    );
  }, [rows, q, fDept]);

  const active = q.trim() !== '' || fDept !== 'all';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama atau divisi…"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg flex-1 min-w-[180px] focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <select value={fDept} onChange={(e) => setFDept(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
          <option value="all">Semua Divisi</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => { setQ(''); setFDept('all'); }}
            className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Bersihkan</button>
        )}
        <span className="text-[11px] text-gray-500 ml-auto">{shown.length} dari {rows.length} pegawai</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[620px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3">Divisi</th>
              <th className="py-2 px-3 text-center">Skor Akhir</th>
              <th className="py-2 px-3 text-center">ACC SPV</th>
              <th className="py-2 px-3 text-center">Status</th>
              <th className="py-2 pl-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-gray-500 italic">Tidak ada pegawai sesuai filter.</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3">
                  <Link href={`/laporan/${r.id}`} className="font-bold text-gray-800 hover:text-emerald-700 hover:underline">{r.name}</Link>
                </td>
                <td className="py-3 px-3 text-xs text-gray-600">{r.dept}</td>
                <td className="py-3 px-3 text-center font-mono font-black text-slate-800">
                  {r.final != null ? r.final.toFixed(1) : '—'}
                </td>
                <td className="py-3 px-3 text-center">
                  {r.spvAcc
                    ? <span className="text-[10px] font-bold text-emerald-700">✔ ACC</span>
                    : <span className="text-[10px] text-gray-500">belum</span>}
                </td>
                <td className="py-3 px-3 text-center">
                  {r.status === 'finalized'
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Final</span>
                    : r.status === 'in_review'
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">Ditinjau SPV</span>
                    : r.status === 'draft'
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Draf</span>
                    : <span className="text-[10px] text-gray-500">—</span>}
                </td>
                <td className="py-3 pl-3 text-right">
                  <ReportRowActions employeeId={r.id} canCompute={r.final != null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
