'use client';

import { useMemo, useState } from 'react';

export type AuditRow = {
  id: number;
  actor: string;
  action: string;
  category: string;
  summary: string;
  targetLabel: string | null;
  createdAt: string;
};

const CAT_LABEL: Record<string, string> = {
  periode: 'Periode', bobot: 'Bobot', skor: 'Skor 360°', laporan: 'Laporan',
  kepatuhan: 'Kepatuhan', pegawai: 'Pegawai', pemetaan: 'Pemetaan',
  pertanyaan: 'Pertanyaan', progress: 'Progress', lain: 'Lain',
};
const CAT_COLOR: Record<string, string> = {
  periode: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bobot: 'bg-amber-50 text-amber-700 border-amber-200',
  skor: 'bg-violet-50 text-violet-700 border-violet-200',
  laporan: 'bg-blue-50 text-blue-700 border-blue-200',
  kepatuhan: 'bg-rose-50 text-rose-700 border-rose-200',
  pegawai: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  pemetaan: 'bg-teal-50 text-teal-700 border-teal-200',
  pertanyaan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  progress: 'bg-orange-50 text-orange-700 border-orange-200',
  lain: 'bg-gray-50 text-gray-600 border-gray-200',
};

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
    }).format(new Date(iso));
  } catch { return iso; }
}

export function AuditClient({ rows, maxRows }: { rows: AuditRow[]; maxRows: number }) {
  const [cat, setCat] = useState('all');
  const [actor, setActor] = useState('all');
  const [q, setQ] = useState('');

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const actors = useMemo(() => [...new Set(rows.map((r) => r.actor))].sort(), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (cat === 'all' || r.category === cat) &&
      (actor === 'all' || r.actor === actor) &&
      (!needle || r.summary.toLowerCase().includes(needle) || (r.targetLabel ?? '').toLowerCase().includes(needle) || r.action.toLowerCase().includes(needle)),
    );
  }, [rows, cat, actor, q]);

  const active = cat !== 'all' || actor !== 'all' || q.trim() !== '';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      {/* Filter bar */}
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari ringkasan / nama / aksi…"
          className="flex-1 min-w-[180px] text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
          <option value="all">🏷️ Semua Kategori</option>
          {cats.map((c) => <option key={c} value={c}>{CAT_LABEL[c] ?? c}</option>)}
        </select>
        <select value={actor} onChange={(e) => setActor(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
          <option value="all">👤 Semua Pelaku</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => { setCat('all'); setActor('all'); setQ(''); }}
            className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Bersihkan</button>
        )}
        <span className="text-[11px] text-gray-400 ml-auto">
          {shown.length} dari {rows.length} entri{rows.length >= maxRows && ` (maks. ${maxRows} terbaru)`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">
          {rows.length === 0 ? 'Belum ada aktivitas tercatat.' : 'Tidak ada entri sesuai filter.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="py-2.5 px-4 whitespace-nowrap">Waktu</th>
                <th className="py-2.5 px-3">Pelaku</th>
                <th className="py-2.5 px-3">Kategori</th>
                <th className="py-2.5 px-4">Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                  <td className="py-3 px-3 font-bold text-gray-800 whitespace-nowrap">{r.actor}</td>
                  <td className="py-3 px-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${CAT_COLOR[r.category] ?? CAT_COLOR.lain}`}>
                      {CAT_LABEL[r.category] ?? r.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-700">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
