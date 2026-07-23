'use client';

import { useMemo, useState } from 'react';
import { PenaltyInput } from './penalty-input';

export type KepatuhanRow = {
  id: string; name: string; dept: string;
  lateCount: number; lateTargets: string[]; selfMissing: boolean; points: number;
};

/**
 * Baris "perlu perhatian" = ada penilaian wajib telat, ATAU belum self-assessment,
 * ATAU sudah punya punishment (agar tetap bisa ditinjau/dikoreksi). Sisanya (patuh
 * penuh & tanpa punishment) disembunyikan secara default → halaman lebih bersih.
 */
const needsAttention = (r: KepatuhanRow) => r.lateCount > 0 || r.selfMissing || r.points > 0;

export function KepatuhanTable({ rows, readOnly = false }: { rows: KepatuhanRow[]; readOnly?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const flagged = useMemo(() => rows.filter(needsAttention), [rows]);
  const shown = showAll ? rows : flagged;
  const hiddenCount = rows.length - flagged.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">
          {flagged.length} perlu perhatian{showAll ? ` · ${rows.length} total pegawai` : ''}
        </span>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-emerald-600" />
          Tampilkan semua pegawai
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500">
          ✅ Semua pegawai patuh &amp; tanpa punishment — tak ada yang perlu ditindak.
          {rows.length > 0 && (
            <div className="text-[11px] mt-1">
              Ingin memberi punishment manual? Centang <strong>&quot;Tampilkan semua pegawai&quot;</strong> di atas.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[520px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3">Pegawai</th>
                  <th className="py-2 px-3 text-center">Wajib Telat</th>
                  <th className="py-2 px-3 text-center">Self</th>
                  <th className="py-2 pl-3 text-right">Punishment (poin)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-3">
                      <span className="font-bold text-gray-800 block">{r.name}</span>
                      <span className="text-[11px] text-gray-500">{r.dept}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.lateCount > 0 ? (
                        <span className="text-[11px] font-bold text-rose-700" title={r.lateTargets.join(', ')}>
                          {r.lateCount} telat
                        </span>
                      ) : <span className="text-[11px] text-emerald-600">✔ patuh</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.selfMissing
                        ? <span className="text-[10px] font-bold text-amber-700">belum</span>
                        : <span className="text-[10px] text-emerald-600">✔</span>}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {readOnly
                        ? <span className={`text-sm font-bold ${r.points > 0 ? 'text-rose-700' : 'text-gray-400'}`}>{r.points > 0 ? `${r.points} poin` : '—'}</span>
                        : <PenaltyInput employeeId={r.id} initial={r.points} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!showAll && hiddenCount > 0 && (
            <p className="text-[11px] text-gray-500 italic">
              {hiddenCount} pegawai patuh disembunyikan — centang &quot;Tampilkan semua pegawai&quot; untuk melihat.
            </p>
          )}
        </>
      )}
    </div>
  );
}
