'use client';

import { fmt2 } from '@/lib/scoring';
import { colPercents } from '@/lib/table-cols';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Satu baris audit KPI (rata/flat) — terbaru lebih dulu (urut server by changed_at desc). */
export type FlatAudit = {
  empId: string; name: string; dept: string;
  ym: string; score: number; by: string; at: string; note: string | null; action?: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };

/**
 * Daftar audit KPI RATA (flat), TERBARU DI ATAS. Paginasi & pencarian DI SERVER (egress:
 * kpi_audit append-only bisa ribuan baris) — komponen ini presentational + navigasi via URL
 * (?auditPage=&auditQ=), mempertahankan parameter lain (tab/view/period). Pencarian dieksekusi
 * saat Enter (bukan tiap ketikan) agar tak membanjiri server. Append-only (tak bisa diubah).
 */
export function RiwayatList({ entries, page, total, pageSize, query }: { entries: FlatAudit[]; page: number; total: number; pageSize: number; query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(query);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, page * pageSize + entries.length);

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
        <p className="text-[11px] text-ink-faint">
          Jejak perubahan KPI bersifat <strong>append-only</strong> — tidak dapat diubah/dihapus. Urut <strong>terbaru di atas</strong>.
        </p>
        <form onSubmit={submitSearch} className="flex items-center gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / divisi… (Enter)"
            className="text-xs px-3 py-2 border border-line rounded-control bg-surface w-52 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
          <button type="submit" className="text-[11px] font-semibold px-2.5 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">Cari</button>
          {query && (
            <button type="button" onClick={() => { setQ(''); nav({ auditQ: null, auditPage: null }); }}
              className="text-[11px] font-semibold px-2.5 py-2 rounded-control border border-line text-ink-faint hover:text-ink-soft hover:border-line-strong">Bersihkan</button>
          )}
        </form>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-ink-soft">{query ? 'Tidak ada jejak audit yang cocok dengan pencarian.' : 'Belum ada jejak audit KPI. Riwayat tercatat otomatis setiap input skor.'}</p>
      ) : (
        <div className="overflow-x-auto">
          {/* table-fixed + colgroup: lebar kolom TETAP antar halaman (tak bergeser saat paging). */}
          <table className="w-full table-fixed text-left text-xs min-w-[730px]">
            <colgroup>
              {colPercents([
                200, // Pegawai + divisi
                96, // Bulan ("Agu 2026")
                132, // Skor ("dihapus (dari 84.50)")
                150, // Oleh
                172, // Waktu ("01 Okt 2026 14:30 WIB")
                190, // Catatan
              ]).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.05em] text-ink-faint border-b border-line bg-surface">
                <th className="py-2 px-3 font-semibold">Pegawai</th>
                <th className="py-2 px-3 font-semibold">Bulan</th>
                <th className="py-2 px-3 text-center font-semibold">Skor</th>
                <th className="py-2 px-3 font-semibold">Oleh</th>
                <th className="py-2 px-3 font-semibold">Waktu</th>
                <th className="py-2 px-3 font-semibold">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {entries.map((r, i) => (
                <tr key={`${r.empId}-${r.ym}-${i}`}>
                  <td className="py-2 px-3 break-words">
                    <span className="font-bold text-ink">{r.name}</span>
                    <span className="text-[10px] text-ink-faint block">{r.dept}</span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-ink-soft">{labelMonth(r.ym)}</td>
                  <td className="py-2 px-3 text-center data-value font-bold">
                    {r.action === 'delete'
                      ? <span className="text-danger-ink" title="Skor dihapus">dihapus <span className="text-ink-faint font-normal">(dari {fmt2(r.score)})</span></span>
                      : <span className="text-brand-ink">{fmt2(r.score)}</span>}
                  </td>
                  <td className="py-2 px-3 text-ink-soft break-words">{r.by}</td>
                  <td className="py-2 px-3 text-ink-faint data-value">{r.at}</td>
                  <td className="py-2 px-3 text-ink-faint italic break-words">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(total > pageSize || page > 0) && (
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <button type="button" disabled={page === 0} onClick={() => nav({ auditPage: String(page - 1) })}
            className="px-3 py-1.5 rounded-control border border-line disabled:opacity-40 hover:border-line-strong">← Sebelumnya</button>
          <span className="text-center">
            Halaman <span className="data-value">{page + 1} / {pageCount}</span>
            <span className="block text-[10px] text-ink-faint"><span className="data-value">{from}–{to}</span> dari <span className="data-value">{total}</span> perubahan</span>
          </span>
          <button type="button" disabled={page >= pageCount - 1} onClick={() => nav({ auditPage: String(page + 1) })}
            className="px-3 py-1.5 rounded-control border border-line disabled:opacity-40 hover:border-line-strong">Berikutnya →</button>
        </div>
      )}
    </div>
  );
}
