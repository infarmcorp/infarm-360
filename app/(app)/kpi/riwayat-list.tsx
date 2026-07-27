'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Satu baris audit KPI (rata/flat) — terbaru lebih dulu (urut server by changed_at desc). */
export type FlatAudit = {
  empId: string; name: string; dept: string;
  ym: string; score: number; by: string; at: string; note: string | null; action?: string;
};

/** Ukuran halaman audit (server-paginated). Log → 10/hal (selaras Log Aktivitas HRD). */
export const AUDIT_PAGE_SIZE = 10;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };

/**
 * Daftar audit KPI RATA (flat), TERBARU DI ATAS. Paginasi & pencarian DI SERVER (egress:
 * kpi_audit append-only bisa ribuan baris) — komponen ini presentational + navigasi via URL
 * (?auditPage=&auditQ=), mempertahankan parameter lain (tab/view/period). Pencarian dieksekusi
 * saat Enter (bukan tiap ketikan) agar tak membanjiri server. Append-only (tak bisa diubah).
 */
export function RiwayatList({ entries, page, total, query }: { entries: FlatAudit[]; page: number; total: number; query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(query);

  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const from = total === 0 ? 0 : page * AUDIT_PAGE_SIZE + 1;
  const to = Math.min(total, page * AUDIT_PAGE_SIZE + entries.length);

  /** Bangun URL dgn param audit diubah, pertahankan sisanya (tab/view/period). */
  const nav = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') sp.delete(k); else sp.set(k, v); }
    router.replace(`${pathname}?${sp.toString()}`);
  };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); nav({ auditQ: q.trim() || null, auditPage: null }); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">
          Jejak perubahan KPI bersifat <strong>append-only</strong> — tidak dapat diubah/dihapus. Urut <strong>terbaru di atas</strong>.
        </p>
        <form onSubmit={submitSearch} className="flex items-center gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / divisi… (Enter)"
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-emerald-600" />
          <button type="submit" className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cari</button>
          {query && (
            <button type="button" onClick={() => { setQ(''); nav({ auditQ: null, auditPage: null }); }}
              className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Bersihkan</button>
          )}
        </form>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">{query ? 'Tidak ada jejak audit yang cocok dengan pencarian.' : 'Belum ada jejak audit KPI. Riwayat tercatat otomatis setiap input skor.'}</p>
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
              {entries.map((r, i) => (
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

      {(total > AUDIT_PAGE_SIZE || page > 0) && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <button type="button" disabled={page === 0} onClick={() => nav({ auditPage: String(page - 1) })}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">← Sebelumnya</button>
          <span className="text-center">
            Halaman {page + 1} / {pageCount}
            <span className="block text-[10px] text-gray-400">{from}–{to} dari {total} perubahan</span>
          </span>
          <button type="button" disabled={page >= pageCount - 1} onClick={() => nav({ auditPage: String(page + 1) })}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Berikutnya →</button>
        </div>
      )}
    </div>
  );
}
