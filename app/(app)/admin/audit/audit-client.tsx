'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateTimeWib } from '@/lib/datetime';

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
// Soft-tint monokrom: kategori dibedakan lewat LABEL, bukan pelangi warna. Aksi
// berlingkup-skor/kepatuhan (berkonsekuensi) diberi aksen warn; sisanya netral/brand.
const CAT_COLOR: Record<string, string> = {
  periode: 'bg-brand-tint text-brand-ink border-brand-ink/20',
  bobot: 'bg-brand-tint text-brand-ink border-brand-ink/20',
  skor: 'bg-warn-tint text-warn-ink border-warn-ink/25',
  laporan: 'bg-brand-tint text-brand-ink border-brand-ink/20',
  kepatuhan: 'bg-warn-tint text-warn-ink border-warn-ink/25',
  pegawai: 'bg-neutral-tint text-ink-soft border-line',
  pemetaan: 'bg-neutral-tint text-ink-soft border-line',
  pertanyaan: 'bg-neutral-tint text-ink-soft border-line',
  progress: 'bg-neutral-tint text-ink-soft border-line',
  suksesi: 'bg-neutral-tint text-ink-soft border-line',
  lain: 'bg-neutral-tint text-ink-faint border-line',
};

// Halaman ini sudah memakai Asia/Jakarta sejak awal; kini lewat helper bersama agar formatnya
// PERSIS sama dengan Audit KPI & Log Akses (jam 24 titik-dua + label WIB), bukan tiga gaya berbeda.
const fmt = (iso: string) => formatDateTimeWib(iso);

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
    <div className="bg-surface border border-line rounded-panel">
      {/* Filter bar — perubahan memicu fetch server (reset ke halaman 1). */}
      <div className="p-4 border-b border-line-soft flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); go({ q: term, page: 0 }); }}
          className="flex-1 min-w-[180px] flex gap-2"
        >
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari ringkasan / nama / aksi… (Enter)"
            className="flex-1 min-w-[140px] text-xs px-3 py-2 border border-line rounded-control bg-surface focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
          <button type="submit"
            className="text-[11px] font-bold px-3 py-2 rounded-control bg-brand hover:bg-brand-ink text-white whitespace-nowrap">
            Cari
          </button>
        </form>
        <select value={period} onChange={(e) => go({ period: e.target.value, page: 0 })}
          title="Saring berdasarkan rentang tanggal periode"
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
          <option value="all">📅 Semua Periode</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={cat} onChange={(e) => go({ cat: e.target.value, page: 0 })}
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
          <option value="all">🏷️ Semua Kategori</option>
          {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => { setTerm(''); go({ cat: 'all', q: '', period: 'all', page: 0 }); }}
            className="text-[11px] font-bold px-2.5 py-2 rounded-control border border-line text-ink-soft hover:bg-neutral-tint">Bersihkan</button>
        )}
        <span className="text-[11px] text-ink-faint ml-auto data-value">
          {total === 0 ? '0 entri' : `${from}–${to} dari ${total} entri`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-sm text-ink-soft">
          {total === 0 && !active ? 'Belum ada aktivitas tercatat.' : 'Tidak ada entri sesuai filter.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.05em] text-ink-faint font-semibold border-b border-line bg-neutral-tint">
                <th className="py-2.5 px-4 whitespace-nowrap">Waktu</th>
                <th className="py-2.5 px-3">Pelaku</th>
                <th className="py-2.5 px-3">Kategori</th>
                <th className="py-2.5 px-4">Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-neutral-tint/40">
                  <td className="py-3 px-4 text-xs text-ink-faint whitespace-nowrap data-value">{fmt(r.createdAt)}</td>
                  <td className="py-3 px-3 font-bold text-ink whitespace-nowrap">{r.actor}</td>
                  <td className="py-3 px-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-control border ${CAT_COLOR[r.category] ?? CAT_COLOR.lain}`}>
                      {CAT_LABEL[r.category] ?? r.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-ink-soft">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager: geser 10 sebelumnya / berikutnya (fetch server per klik). */}
      <div className="p-4 border-t border-line-soft flex items-center justify-between gap-2">
        <button type="button" disabled={!hasPrev} onClick={() => go({ page: page - 1 })}
          className="text-xs font-bold px-3 py-2 rounded-control border border-line text-ink-soft hover:bg-neutral-tint disabled:opacity-40 disabled:cursor-not-allowed">
          ← {pageSize} sebelumnya
        </button>
        <span className="text-[11px] text-ink-faint">Halaman <span className="data-value">{page + 1} / {totalPages}</span></span>
        <button type="button" disabled={!hasNext} onClick={() => go({ page: page + 1 })}
          className="text-xs font-bold px-3 py-2 rounded-control border border-line text-ink-soft hover:bg-neutral-tint disabled:opacity-40 disabled:cursor-not-allowed">
          {pageSize} berikutnya →
        </button>
      </div>
    </div>
  );
}
