import Link from 'next/link';

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

const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

export function AksesLog({ rows, page, pageSize, total }: { rows: AksesLogRow[]; page: number; pageSize: number; total: number }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, page * pageSize + rows.length);
  const link = (p: number) => `/admin/akses?logPage=${p}#log-akses`;

  return (
    <section id="log-akses" className="mt-8 border-t border-gray-200 pt-5">
      <h3 className="text-sm font-bold text-gray-800 mb-0.5">Log Akses</h3>
      <p className="text-[11px] text-gray-500 mb-3 max-w-3xl">
        Jejak perubahan akses (grant halaman + izin peran/HRD) — hanya-baca &amp; tak dapat diubah.
        Terpisah dari <span className="font-semibold text-gray-500">Log Aktivitas HRD</span> umum yang mencatat semua kategori.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
          Belum ada perubahan akses tercatat.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Waktu</th>
                <th className="px-3 py-2 font-semibold">Oleh</th>
                <th className="px-3 py-2 font-semibold">Aktivitas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-[12px]">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-medium">{r.actor}</td>
                  <td className="px-3 py-2 text-gray-700">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(total > pageSize || page > 0) && (
        <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
          {page > 0 ? (
            <Link href={link(page - 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">← Sebelumnya</Link>
          ) : (
            <span className="px-3 py-1.5 rounded-lg border border-gray-200 opacity-40">← Sebelumnya</span>
          )}
          <span>{from}–{to} dari {total} · Halaman {page + 1} / {pageCount}</span>
          {page < pageCount - 1 ? (
            <Link href={link(page + 1)} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">Berikutnya →</Link>
          ) : (
            <span className="px-3 py-1.5 rounded-lg border border-gray-200 opacity-40">Berikutnya →</span>
          )}
        </div>
      )}
    </section>
  );
}
