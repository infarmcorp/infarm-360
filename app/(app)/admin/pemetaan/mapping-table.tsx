'use client';

import { useMemo, useState } from 'react';
import { DeleteButton } from './delete-button';

export type MapRow = {
  id: string; assessorId: string; assessor: string; targetId: string; target: string;
  relation: string; mandatory: boolean;
};

/** Daftar pemetaan + filter Penilai & Target (ala legacy). */
export function MappingTable({ rows }: { rows: MapRow[] }) {
  const [fAssessor, setFAssessor] = useState('all');
  const [fTarget, setFTarget] = useState('all');

  const assessors = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.assessorId, r.assessor));
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const targets = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.targetId, r.target));
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const shown = rows.filter((r) => (fAssessor === 'all' || r.assessorId === fAssessor) && (fTarget === 'all' || r.targetId === fTarget));
  const active = fAssessor !== 'all' || fTarget !== 'all';

  if (rows.length === 0) return <p className="text-sm text-gray-500">Belum ada pemetaan. Tambahkan di atas.</p>;

  // Label total dinamis mengikuti filter aktif.
  const aName = assessors.find((a) => a.id === fAssessor)?.name;
  const tName = targets.find((t) => t.id === fTarget)?.name;
  const totalLabel = !active
    ? `Total ${rows.length} pasangan penilaian`
    : aName && tName ? `${shown.length} pasangan · ${aName} → ${tName}`
    : aName ? `${shown.length} pasangan dinilai oleh ${aName}`
    : `${shown.length} pasangan menilai ${tName}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-extrabold text-slate-800">Daftar Pemetaan</h3>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${active ? 'text-indigo-800 bg-indigo-50 border-indigo-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
          {totalLabel}{active && <span className="font-normal text-gray-400"> · dari {rows.length}</span>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={fAssessor} onChange={(e) => setFAssessor(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
          <option value="all">👤 Semua Penilai</option>
          {assessors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={fTarget} onChange={(e) => setFTarget(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600">
          <option value="all">🎯 Semua Target</option>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => { setFAssessor('all'); setFTarget('all'); }}
            className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Bersihkan</button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada pemetaan sesuai filter.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-3">Penilai</th><th className="py-2 px-3">Yang Dinilai</th><th className="py-2 px-3">Relasi</th>
              <th className="py-2 px-3 text-center">Sifat</th><th className="py-2 pl-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3 font-bold text-gray-800">{r.assessor}</td>
                <td className="py-3 px-3 text-gray-700">{r.target}</td>
                <td className="py-3 px-3 text-gray-500">{r.relation}</td>
                <td className="py-3 px-3 text-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${r.mandatory ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                    {r.mandatory ? 'Wajib' : 'Opsional'}
                  </span>
                </td>
                <td className="py-3 pl-3 text-right"><DeleteButton mappingId={r.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-gray-400 italic">
        Relasi menentukan kelas bobot 360 (Atasan/Peer/Cross/Self). Sifat Wajib jadi dasar Flag Kepatuhan.
      </p>
    </div>
  );
}
