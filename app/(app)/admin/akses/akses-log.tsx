import Link from 'next/link';
import { colPercents } from '@/lib/table-cols';
import { StableHeight } from '@/components/table-controls';
import { formatDateTimeWib } from '@/lib/datetime';
import { ScrollText } from 'lucide-react';
import { CARD, CardTitle, TABLE_HEAD } from '@/components/infarm-ui';

/**
 * Log Akses — panel read-only di halaman Manajemen Akses: jejak perubahan AKSES (grant halaman +
 * izin peran/HRD) yang disaring dari `hrd_audit_log`. TERPISAH dari "Log Aktivitas HRD" umum
 * (`/admin/audit`) yang mencampur semua kategori. Append-only; tak dapat diubah/dihapus dari app.
 * Paginasi di server via ?logPage= (link, bukan state klien) agar tetap ringan.
 */
export type AksesLogRow = {
  id: number;
  actor: string;
  summary: string;
  targetLabel: string | null;
  createdAt: string;
};

// WIB dipaksa (komponen server = UTC di Vercel) — lihat lib/datetime.ts.
const fmt = (iso: string) => formatDateTimeWib(iso);
const PAGER_BTN = 'inline-flex items-center text-[13px] font-semibold min-h-9 px-3.5 rounded-control bg-neutral-tint text-ink-soft';

export function AksesLog({ rows, page, pageSize, total }: { rows: AksesLogRow[]; page: number; pageSize: number; total: number }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, page * pageSize + rows.length);
  const link = (p: number) => `/admin/akses?tab=log&logPage=${p}#log-akses`;

  return (
    <section id="log-akses" className={CARD}>
      <CardTitle icon={ScrollText}>Log Akses</CardTitle>
      <p className="text-xs text-ink-soft mt-1 mb-3 max-w-3xl leading-relaxed">
        Jejak perubahan akses halaman dan izin peran/HRD. Tidak dapat diubah. <span className="font-semibold text-ink-soft">Log Aktivitas HRD</span> mencatat semua kategori lainnya.
      </p>

      <StableHeight>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong py-8 text-center text-[13px] text-ink-soft">
          Belum ada perubahan akses tercatat.
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* table-fixed + colgroup: lebar kolom TETAP antar halaman (tak bergeser saat paging). */}
          <table className="w-full table-fixed table-1line text-left text-[13px] min-w-[570px]">
            <colgroup>
              {colPercents([
                180, // Waktu ("01 Okt 2026 14:30 WIB")
                170, // Oleh
                380, // Aktivitas
              ]).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr className={TABLE_HEAD}>
                <th className="px-3 py-2.5 rounded-l-lg whitespace-nowrap">Waktu</th>
                <th className="px-3 py-2.5">Oleh</th>
                <th className="px-3 py-2.5 rounded-r-lg">Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-infarm-surface/60">
                  <td className="px-3 py-3 text-ink-soft text-xs font-mono">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-3 text-ink break-words font-semibold">{r.actor}</td>
                  <td className="px-3 py-3 text-ink-soft break-words">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(total > pageSize || page > 0) && (
        <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          {page > 0 ? (
            <Link href={link(page - 1)} className={`${PAGER_BTN} hover:text-ink`}>← Sebelumnya</Link>
          ) : (
            <span className={`${PAGER_BTN} opacity-40`}>← Sebelumnya</span>
          )}
          <span><span className="font-mono">{from}–{to}</span> dari <span className="font-mono">{total}</span> · Halaman <span className="font-mono">{page + 1} / {pageCount}</span></span>
          {page < pageCount - 1 ? (
            <Link href={link(page + 1)} className={`${PAGER_BTN} hover:text-ink`}>Berikutnya →</Link>
          ) : (
            <span className={`${PAGER_BTN} opacity-40`}>Berikutnya →</span>
          )}
        </div>
      )}
      </StableHeight>
    </section>
  );
}
