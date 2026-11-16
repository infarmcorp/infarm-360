'use client';

import { useState } from 'react';
import { colPercents } from '@/lib/table-cols';
import { StableHeight } from '@/components/table-controls';
import { useRouter } from 'next/navigation';
import { formatDateTimeWib } from '@/lib/datetime';
import { ScrollText, Search } from 'lucide-react';
import { CARD, CardTitle, FIELD, FIELD_LABEL, TABLE_HEAD } from '@/components/infarm-ui';

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
  pertanyaan: 'Pertanyaan', progress: 'Progres', suksesi: 'Suksesi', pengembangan: 'Rencana Pengembangan', lain: 'Lainnya',
};
// Soft-tint monokrom (pil rounded-full): kategori dibedakan lewat LABEL, bukan pelangi warna. Aksi
// berlingkup-skor/kepatuhan (berkonsekuensi) diberi aksen warn; pengaturan siklus brand; sisanya netral.
const CAT_COLOR: Record<string, string> = {
  periode: 'bg-brand-tint text-brand-ink',
  bobot: 'bg-brand-tint text-brand-ink',
  skor: 'bg-warn-tint text-warn-ink',
  laporan: 'bg-brand-tint text-brand-ink',
  kepatuhan: 'bg-warn-tint text-warn-ink',
  pegawai: 'bg-neutral-tint text-ink-soft',
  pemetaan: 'bg-neutral-tint text-ink-soft',
  pertanyaan: 'bg-neutral-tint text-ink-soft',
  progress: 'bg-neutral-tint text-ink-soft',
  suksesi: 'bg-neutral-tint text-ink-soft',
  pengembangan: 'bg-infarm-cream text-infarm-soil',
  lain: 'bg-neutral-tint text-ink-soft',
};
const PAGER_BTN = 'text-[13px] font-semibold min-h-10 px-3.5 rounded-control bg-neutral-tint text-ink-soft hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed';

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
    <div className={`${CARD} flex flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <CardTitle icon={ScrollText} className="font-sans">Riwayat Aktivitas</CardTitle>
        <span className="text-xs text-ink-soft font-mono">
          {total === 0 ? '0 entri' : `${from}–${to} dari ${total} entri`}
        </span>
      </div>

      {/* Filter bar — perubahan memicu fetch server (reset ke halaman 1). */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <form
          onSubmit={(e) => { e.preventDefault(); go({ q: term, page: 0 }); }}
          className="flex-1 min-w-[220px]"
        >
          <label className={FIELD_LABEL} htmlFor="audit-q">Cari</label>
          <div className="flex gap-2">
            <input
              id="audit-q"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Cari ringkasan / nama / aksi… (Enter)"
              className={`${FIELD} flex-1 min-w-[140px]`}
            />
            <button type="submit"
              className="inline-flex items-center gap-1.5 text-[13px] font-bold min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white whitespace-nowrap">
              <Search className="w-4 h-4" /> Cari
            </button>
          </div>
        </form>
        <div>
          <label className={FIELD_LABEL} htmlFor="audit-period">Periode</label>
          <select id="audit-period" value={period} onChange={(e) => go({ period: e.target.value, page: 0 })}
            title="Saring berdasarkan rentang tanggal periode"
            className={`${FIELD} font-semibold`}>
            <option value="all">Semua Periode</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL} htmlFor="audit-cat">Kategori</label>
          <select id="audit-cat" value={cat} onChange={(e) => go({ cat: e.target.value, page: 0 })}
            className={`${FIELD} font-semibold`}>
            <option value="all">Semua Kategori</option>
            {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {active && (
          <button type="button" onClick={() => { setTerm(''); go({ cat: 'all', q: '', period: 'all', page: 0 }); }}
            className="text-[13px] font-semibold min-h-9 px-4 rounded-xl bg-neutral-tint text-ink-soft hover:text-ink">Bersihkan</button>
        )}
      </div>

      <StableHeight className="">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-soft">
          {total === 0 && !active ? 'Belum ada aktivitas tercatat.' : 'Tidak ada entri sesuai filter.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          {/* table-fixed + colgroup: lebar kolom TETAP antar halaman (tak bergeser saat paging). */}
          <table className="w-full table-fixed table-1line text-left text-[13px] min-w-[680px]">
            <colgroup>
              {colPercents([
                180, // Waktu ("01 Okt 2026 14:30 WIB")
                170, // Pelaku
                130, // Kategori ("Pertanyaan")
                390, // Aktivitas
              ]).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr className={TABLE_HEAD}>
                <th className="py-2.5 px-3 rounded-l-lg whitespace-nowrap">Waktu</th>
                <th className="py-2.5 px-3">Pelaku</th>
                <th className="py-2.5 px-3">Kategori</th>
                <th className="py-2.5 px-3 rounded-r-lg">Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-infarm-surface/60">
                  <td className="py-3 px-3 text-xs text-ink-soft font-mono">{fmt(r.createdAt)}</td>
                  <td className="py-3 px-3 font-semibold text-ink break-words">{r.actor}</td>
                  <td className="py-3 px-3">
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${CAT_COLOR[r.category] ?? CAT_COLOR.lain}`}>
                      {CAT_LABEL[r.category] ?? r.category}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-ink-soft break-words">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager: geser 10 sebelumnya / berikutnya (fetch server per klik). */}
      <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={!hasPrev} onClick={() => go({ page: page - 1 })} className={PAGER_BTN}>
          ← <span className="font-mono">{pageSize}</span> sebelumnya
        </button>
        <span className="text-xs text-ink-soft">Halaman <span className="font-mono">{page + 1} / {totalPages}</span></span>
        <button type="button" disabled={!hasNext} onClick={() => go({ page: page + 1 })} className={PAGER_BTN}>
          <span className="font-mono">{pageSize}</span> berikutnya →
        </button>
      </div>
      </StableHeight>
    </div>
  );
}
