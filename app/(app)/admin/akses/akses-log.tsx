import Link from 'next/link';
import { formatDateTimeWib } from '@/lib/datetime';

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

export function AksesLog({ rows, page, pageSize, total }: { rows: AksesLogRow[]; page: number; pageSize: number; total: number }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, page * pageSize + rows.length);
  const link = (p: number) => `/admin/akses?tab=log&logPage=${p}#log-akses`;

  return (
    <section id="log-akses" className="mt-2">
      <h3 className="text-sm font-bold text-ink mb-0.5">Log Akses</h3>
      <p className="text-[11.5px] text-ink-soft mb-3 max-w-3xl leading-relaxed">
        Jejak perubahan akses (grant halaman + izin peran/HRD) — hanya-baca &amp; tak dapat diubah.
        Terpisah dari <span className="font-semibold text-ink-soft">Log Aktivitas HRD</span> umum yang mencatat semua kategori.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong py-8 text-center text-sm text-ink-faint">
          Belum ada perubahan akses tercatat.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-line">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-neutral-tint text-left text-[11px] uppercase tracking-[0.05em] text-ink-faint">
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Waktu</th>
                <th className="px-3 py-2 font-semibold">Oleh</th>
                <th className="px-3 py-2 font-semibold">Aktivitas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line-soft align-top">
                  <td className="px-3 py-2 text-ink-faint whitespace-nowrap text-[12px] data-value">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-2 text-ink-soft whitespace-nowrap font-medium">{r.actor}</td>
                  <td className="px-3 py-2 text-ink-soft">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(total > pageSize || page > 0) && (
        <div className="flex items-center justify-between mt-3 text-xs text-ink-soft">
          {page > 0 ? (
            <Link href={link(page - 1)} className="px-3 py-1.5 rounded-control border border-line hover:border-line-strong">← Sebelumnya</Link>
          ) : (
            <span className="px-3 py-1.5 rounded-control border border-line opacity-40">← Sebelumnya</span>
          )}
          <span><span className="data-value">{from}–{to}</span> dari <span className="data-value">{total}</span> · Halaman <span className="data-value">{page + 1} / {pageCount}</span></span>
          {page < pageCount - 1 ? (
            <Link href={link(page + 1)} className="px-3 py-1.5 rounded-control border border-line hover:border-line-strong">Berikutnya →</Link>
          ) : (
            <span className="px-3 py-1.5 rounded-control border border-line opacity-40">Berikutnya →</span>
          )}
        </div>
      )}
    </section>
  );
}
