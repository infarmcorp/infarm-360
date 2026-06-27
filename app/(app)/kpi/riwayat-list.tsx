'use client';

import { useEffect, useMemo, useState } from 'react';

export type AuditEntry = { ym: string; score: number; by: string; at: string; note: string | null };
export type EmpAudit = { id: string; name: string; dept: string; entries: AuditEntry[] };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };

/** Daftar audit KPI per pegawai + pencarian nama/divisi + buka/tutup semua. */
export function RiwayatList({ groups }: { groups: EmpAudit[] }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return groups;
    return groups.filter((g) => `${g.name} ${g.dept}`.toLowerCase().includes(t));
  }, [groups, q]);

  // Kartu yang terbuka (controlled). Default: terbuka semua bila ≤3 grup; selain itu terlipat.
  const [openIds, setOpenIds] = useState<Set<string>>(() =>
    groups.length <= 3 ? new Set(groups.map((g) => g.id)) : new Set());

  // Saat pencarian berubah: buka semua hasil bila sedang mencari / hasil sedikit (≤3),
  // selain itu terlipat — perilaku auto lama, kini sebagai titik awal yang bisa dioverride.
  useEffect(() => {
    const auto = q.trim() !== '' || shown.length <= 3;
    setOpenIds(auto ? new Set(shown.map((g) => g.id)) : new Set());
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const allOpen = shown.length > 0 && shown.every((g) => openIds.has(g.id));
  const toggleAll = () => setOpenIds(allOpen ? new Set() : new Set(shown.map((g) => g.id)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">Jejak perubahan KPI bersifat <strong>append-only</strong> — tidak dapat diubah/dihapus.</p>
        <div className="flex items-center gap-2">
          {shown.length > 0 && (
            <button type="button" onClick={toggleAll}
              className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap">
              {allOpen ? 'Tutup semua' : 'Buka semua'}
            </button>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / divisi pegawai…"
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
        </div>
      </div>

      {shown.length === 0 && <p className="text-sm text-gray-500">Tidak ada pegawai sesuai pencarian.</p>}

      {shown.map((e) => (
        <details key={e.id} className="border border-gray-200 rounded-xl overflow-hidden"
          open={openIds.has(e.id)}
          onToggle={(ev) => {
            const open = ev.currentTarget.open;
            setOpenIds((prev) => {
              if (prev.has(e.id) === open) return prev; // tak berubah → hindari render ekstra
              const next = new Set(prev);
              if (open) next.add(e.id); else next.delete(e.id);
              return next;
            });
          }}>
          <summary className="cursor-pointer select-none px-3 py-2.5 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800">{e.name} <span className="text-[11px] font-normal text-gray-500">· {e.dept}</span></span>
            <span className="text-[10px] text-gray-500">{e.entries.length} perubahan</span>
          </summary>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-150 bg-white">
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
                  <td className="py-2 px-3 text-gray-500">{r.at}</td>
                  <td className="py-2 px-3 text-gray-500 italic">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </details>
      ))}
    </div>
  );
}
