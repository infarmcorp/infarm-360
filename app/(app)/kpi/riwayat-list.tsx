'use client';

import { useMemo, useState } from 'react';

export type AuditEntry = { ym: string; score: number; by: string; at: string; note: string | null };
export type EmpAudit = { id: string; name: string; dept: string; entries: AuditEntry[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };

/** Daftar audit KPI per pegawai + pencarian nama/divisi. */
export function RiwayatList({ groups }: { groups: EmpAudit[] }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return groups;
    return groups.filter((g) => `${g.name} ${g.dept}`.toLowerCase().includes(t));
  }, [groups, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">Jejak perubahan KPI bersifat <strong>append-only</strong> — tidak dapat diubah/dihapus.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / divisi pegawai…"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
      </div>

      {shown.length === 0 && <p className="text-sm text-gray-500">Tidak ada pegawai sesuai pencarian.</p>}

      {shown.map((e) => (
        <details key={e.id} className="border border-gray-200 rounded-xl overflow-hidden" open={shown.length <= 3 || q.trim() !== ''}>
          <summary className="cursor-pointer select-none px-3 py-2.5 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">{e.name} <span className="text-[11px] font-normal text-gray-400">· {e.dept}</span></span>
            <span className="text-[10px] text-gray-400">{e.entries.length} perubahan</span>
          </summary>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-gray-400 border-b border-gray-150 bg-white">
                <th className="py-2 px-3">Bulan</th>
                <th className="py-2 px-3 text-center">Skor</th>
                <th className="py-2 px-3">Oleh</th>
                <th className="py-2 px-3">Waktu</th>
                <th className="py-2 px-3">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {e.entries.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 px-3 font-semibold text-gray-700">{labelMonth(r.ym)}</td>
                  <td className="py-2 px-3 text-center font-mono font-bold text-emerald-700">{r.score.toFixed(1)}</td>
                  <td className="py-2 px-3 text-gray-600">{r.by}</td>
                  <td className="py-2 px-3 text-gray-400">{r.at}</td>
                  <td className="py-2 px-3 text-gray-500 italic">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
