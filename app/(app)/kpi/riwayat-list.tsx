'use client';

import { fmt2 } from '@/lib/scoring';
import { colPercents } from '@/lib/table-cols';
import { StableHeight } from '@/components/table-controls';
import { FIELD, Note, TABLE_HEAD } from '@/components/infarm-ui';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Satu baris audit KPI (rata/flat) — terbaru lebih dulu (urut server by changed_at desc). */
export type FlatAudit = {
  empId: string; name: string; dept: string;
  ym: string; score: number; by: string; at: string; note: string | null; action?: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };
const PAGER_BTN = 'text-[13px] font-semibold min-h-10 px-3.5 rounded-control bg-neutral-tint text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed';
const SEARCH_BTN = 'text-[13px] font-semibold min-h-9 px-4 rounded-control border border-line bg-surface text-ink-soft hover:text-brand hover:border-infarm-light';

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Note>
          Jejak perubahan KPI bersifat <strong>append-only</strong> — tidak dapat diubah/dihapus. Urut <strong>terbaru di atas</strong>.
        </Note>
        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / divisi… (Enter)"
            className={`${FIELD} w-56`} />
          <button type="submit" className={SEARCH_BTN}>Cari</button>
          {query && (
            <button type="button" onClick={() => { setQ(''); nav({ auditQ: null, auditPage: null }); }}
              className={SEARCH_BTN}>Bersihkan</button>
          )}
        </form>
      </div>

      <StableHeight>
      {entries.length === 0 ? (
        <p className="text-[13px] text-ink-soft">{query ? 'Tidak ada jejak audit yang cocok dengan pencarian.' : 'Belum ada jejak audit KPI. Riwayat tercatat otomatis setiap input skor.'}</p>
      ) : (
        <div className="overflow-x-auto">
          {/* table-fixed + colgroup: lebar kolom TETAP antar halaman (tak bergeser saat paging). */}
          <table className="w-full table-fixed table-1line text-left text-[13px] min-w-[820px]">
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
              <tr className={TABLE_HEAD}>
                <th className="py-2.5 px-3 rounded-l-lg">Pegawai</th>
                <th className="py-2.5 px-3">Bulan</th>
                <th className="py-2.5 px-3 text-center">Skor</th>
                <th className="py-2.5 px-3">Oleh</th>
                <th className="py-2.5 px-3">Waktu</th>
                <th className="py-2.5 px-3 rounded-r-lg">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {entries.map((r, i) => (
                <tr key={`${r.empId}-${r.ym}-${i}`}>
                  <td className="py-3 px-3 break-words">
                    <span className="font-semibold text-ink block">{r.name}</span>
                    <span className="text-xs text-ink-soft">{r.dept}</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-ink-soft">{labelMonth(r.ym)}</td>
                  <td className="py-3 px-3 text-center font-mono font-bold">
                    {r.action === 'delete'
                      ? <span className="text-danger-ink" title="Skor dihapus">dihapus <span className="text-ink-soft font-normal">(dari {fmt2(r.score)})</span></span>
                      : <span className="text-brand">{fmt2(r.score)}</span>}
                  </td>
                  <td className="py-3 px-3 text-ink-soft break-words">{r.by}</td>
                  <td className="py-3 px-3 text-xs text-ink-soft font-mono">{r.at}</td>
                  <td className="py-3 px-3 text-ink-soft italic break-words">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(total > pageSize || page > 0) && (
        <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-soft"><span className="font-mono">{from}–{to}</span> dari <span className="font-mono">{total}</span> perubahan</span>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" disabled={page === 0} onClick={() => nav({ auditPage: String(page - 1) })} className={PAGER_BTN}>← Sebelumnya</button>
            <span className="text-xs text-ink-soft font-mono">Hal. {page + 1}/{pageCount}</span>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => nav({ auditPage: String(page + 1) })} className={PAGER_BTN}>Berikutnya →</button>
          </div>
        </div>
      )}
      </StableHeight>
    </div>
  );
}
