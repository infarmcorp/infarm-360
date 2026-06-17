'use client';

import { useMemo, useState } from 'react';
import { DeleteButton } from './delete-button';
import { SearchableSelect } from '@/components/searchable-select';

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

  if (rows.length === 0) return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center">
      <p className="text-2xl mb-1">🔗</p>
      <p className="text-sm font-bold text-gray-700">Belum ada pemetaan penilai untuk periode ini</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
        Tentukan siapa menilai siapa dengan salah satu cara di atas:
        <strong> tambah manual</strong>, <strong>impor Excel</strong>, atau <strong>salin dari periode sebelumnya</strong> (tetap bisa diedit).
      </p>
    </div>
  );

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
        <div className="w-full sm:w-56">
          <SearchableSelect
            value={fAssessor}
            onChange={setFAssessor}
            options={[{ value: 'all', label: '👤 Semua Penilai' }, ...assessors.map((a) => ({ value: a.id, label: a.name }))]}
            searchPlaceholder="Cari penilai…"
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
        <div className="w-full sm:w-56">
          <SearchableSelect
            value={fTarget}
            onChange={setFTarget}
            options={[{ value: 'all', label: '🎯 Semua Target' }, ...targets.map((t) => ({ value: t.id, label: t.name }))]}
            searchPlaceholder="Cari target…"
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        {active && (
          <button type="button" onClick={() => { setFAssessor('all'); setFTarget('all'); }}
            className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Bersihkan</button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada pemetaan sesuai filter.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[560px]">
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
        </div>
      )}
      <p className="text-[10px] text-gray-400 italic">
        Relasi menentukan kelas bobot 360 (Atasan/Peer/Cross/Self). Sifat Wajib jadi dasar Flag Kepatuhan.
      </p>
    </div>
  );
}
