'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
  pertanyaan: 'Pertanyaan', progress: 'Progress', suksesi: 'Suksesi', lain: 'Lain',
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
  suksesi: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  lain: 'bg-gray-50 text-gray-600 border-gray-200',
};

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
    }).format(new Date(iso));
  } catch { return iso; }
}

/**
 * Tabel Log Aktivitas HRD — paginasi & filter DI SERVER (hemat egress: hanya 10 baris/halaman
 * yang diunduh). Komponen ini hanya menyusun URL (?page/?cat/?q) lalu router.push → server
 * mengambil data baru. Tak ada penyaringan sisi-klien atas 500 baris seperti sebelumnya.
 */
export function AuditClient({
  rows, page, pageSize, total, cat, q, period, periods,
}: {
  rows: AuditRow[]; page: number; pageSize: number; total: number; cat: string; q: string;
  period: string; periods: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [term, setTerm] = useState(q);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, page * pageSize + rows.length);

  const go = (next: { page?: number; cat?: string; q?: string; period?: string }) => {
    const p = new URLSearchParams();
    const nc = next.cat ?? cat;
    const nq = next.q ?? term;
    const nper = next.period ?? period;
    const np = next.page ?? 0;
    if (nc && nc !== 'all') p.set('cat', nc);
    if (nper && nper !== 'all') p.set('period', nper);
    if (nq.trim()) p.set('q', nq.trim());
    if (np > 0) p.set('page', String(np));
    const qs = p.toString();
    router.push(qs ? `/admin/audit?${qs}` : '/admin/audit');
  };

  const active = cat !== 'all' || period !== 'all' || q.trim() !== '';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      {/* Filter bar — perubahan memicu fetch server (reset ke halaman 1). */}
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); go({ q: term, page: 0 }); }}
          className="flex-1 min-w-[180px] flex gap-2"
        >
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari ringkasan / nama / aksi… (Enter)"
            className="flex-1 min-w-[140px] text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          <button type="submit"
            className="text-[11px] font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white whitespace-nowrap">
            Cari
          </button>
        </form>
        <select value={period} onChange={(e) => go({ period: e.target.value, page: 0 })}
          title="Saring berdasarkan rentang tanggal periode"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
          <option value="all">📅 Semua Periode</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={cat} onChange={(e) => go({ cat: e.target.value, page: 0 })}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
          <option value="all">🏷️ Semua Kategori</option>
          {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => { setTerm(''); go({ cat: 'all', q: '', period: 'all', page: 0 }); }}
            className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Bersihkan</button>
        )}
        <span className="text-[11px] text-gray-500 ml-auto">
          {total === 0 ? '0 entri' : `${from}–${to} dari ${total} entri`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">
          {total === 0 && !active ? 'Belum ada aktivitas tercatat.' : 'Tidak ada entri sesuai filter.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2.5 px-4 whitespace-nowrap">Waktu</th>
                <th className="py-2.5 px-3">Pelaku</th>
                <th className="py-2.5 px-3">Kategori</th>
                <th className="py-2.5 px-4">Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
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

      {/* Pager: geser 10 sebelumnya / berikutnya (fetch server per klik). */}
      <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-2">
        <button type="button" disabled={!hasPrev} onClick={() => go({ page: page - 1 })}
          className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          ← {pageSize} sebelumnya
        </button>
        <span className="text-[11px] text-gray-500">Halaman {page + 1} dari {totalPages}</span>
        <button type="button" disabled={!hasNext} onClick={() => go({ page: page + 1 })}
          className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
          {pageSize} berikutnya →
        </button>
      </div>
    </div>
  );
}
