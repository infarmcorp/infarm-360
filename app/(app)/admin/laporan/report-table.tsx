'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReportStatus } from '@/lib/database.types';
import { hasScoreDrift, fmt2, NO_SCORE_LABEL, NO_SCORE_TITLE } from '@/lib/scoring';
import { usePager, Pager, MultiCheckFilter, CheckboxFilter } from '@/components/table-controls';

export type ReportRow = {
  id: string; name: string; dept: string;
  kpiAvg: number | null;       // rerata KPI bulanan
  totalMonths: number;         // jumlah bulan periode
  missingMonths: string[];     // bulan yang BELUM ada KPI (mis. ['2026-06'])
  s360: number | null;         // Skor 360° terhitung (result_360); null = belum dihitung
  needsRecompute: boolean;     // penilaian berubah sejak 360° terakhir dihitung → perlu Hitung Ulang
  penalty: number;             // poin punishment (Flag Kepatuhan)
  final: number | null;        // Skor Akhir LIVE (dihitung dari KPI/360/punishment terkini)
  storedFinal: number | null;  // Skor Akhir TERSIMPAN (snapshot final_reports) — yang dilihat pegawai
  status: ReportStatus | null; spvAcc: boolean;
  isSpvSubject: boolean;       // subjek berperan SPV → ACC oleh Direksi (bukan SPV)
  ratedDone: number; ratedTotal: number; // penilai WAJIB yang sudah submit / total
};

/** Lengkap dinilai = semua penilai WAJIB sudah submit (≥1 penilai ditugaskan). */
const isRatedComplete = (r: ReportRow) => r.ratedTotal > 0 && r.ratedDone >= r.ratedTotal;

/** Skor tersimpan (Final) berbeda dari skor live → "berubah → N", perlu finalisasi ulang. */
const hasDrift = (r: ReportRow) => r.status === 'finalized' && hasScoreDrift(r.final, r.storedFinal);
/** "Selesai" (tak perlu tindakan) = sudah Final, skor tak berubah, & 360° tak perlu dihitung ulang. */
const isDone = (r: ReportRow) => r.status === 'finalized' && !r.needsRecompute && !hasDrift(r);

/** Tabel Review Hasil Akhir + pencarian, filter Divisi & Kelengkapan 360° (client).
 * `hrefBase` = basis tautan "Tinjau" (default '/laporan' untuk HRD; '/review-hasil' utk Direksi read-only).
 * `readOnly` = pemegang grant lihat-saja: sembunyikan tautan "Tinjau" (tanpa akses detail; Tahap 1). */
export function ReportTable({ rows, depts, has360, hrefBase = '/laporan', readOnly = false }: { rows: ReportRow[]; depts: string[]; has360: boolean; hrefBase?: string; readOnly?: boolean }) {
  const [q, setQ] = useState('');
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set());   // kosong = semua divisi
  const [ratedSel, setRatedSel] = useState<Set<string>>(new Set()); // kosong = semua kelengkapan
  // Default (HRD): fokus ke yang PERLU TINDAKAN — sembunyikan laporan yang sudah selesai (Final &
  // skor tak berubah). Read-only (Direksi) → tampilkan semua (tak ada yang perlu ditindak).
  const [onlyActionable, setOnlyActionable] = useState(!readOnly);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const ratedKey = isRatedComplete(r) ? 'complete' : 'incomplete';
      return (deptSel.size === 0 || deptSel.has(r.dept)) &&
        (ratedSel.size === 0 || ratedSel.has(ratedKey)) &&
        (!onlyActionable || !isDone(r)) &&
        (!needle || `${r.name} ${r.dept}`.toLowerCase().includes(needle));
    });
  }, [rows, q, deptSel, ratedSel, onlyActionable]);

  const active = q.trim() !== '' || deptSel.size > 0 || ratedSel.size > 0;
  const readyCount = useMemo(() => rows.filter(isRatedComplete).length, [rows]);
  // Ringkasan status (ringkasan-dulu) + jumlah "perlu tindakan" untuk toggle fokus.
  const sum = useMemo(() => {
    let draft = 0, review = 0, final = 0, done = 0;
    for (const r of rows) {
      if (r.status === 'finalized') final++;
      else if (r.status === 'in_review') review++;
      else if (r.status === 'draft') draft++;
      if (isDone(r)) done++;
    }
    return { draft, review, final, actionable: rows.length - done };
  }, [rows]);
  // Paginasi 5-baris (komponen bersama) → daftar bisa 100+; dipakai HRD finalisasi & Direksi review.
  const { page, setPage, pageCount, shown: paged, total, rangeFrom, rangeTo } = usePager(shown);
  const resetPage = () => setPage(0);

  return (
    <div className="space-y-3">
      {/* Ringkasan-dulu: sebaran status sebelum tabel. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        <span><strong className="text-ink data-value">{rows.length}</strong> pegawai</span>
        {!readOnly && <span className="text-warn-ink"><strong className="data-value">{sum.actionable}</strong> perlu tindakan</span>}
        <span className="text-brand-ink"><strong className="data-value">{sum.final}</strong> final</span>
        {sum.review > 0 && <span className="text-ink-soft"><strong className="data-value">{sum.review}</strong> ditinjau</span>}
        {sum.draft > 0 && <span><strong className="data-value">{sum.draft}</strong> draf</span>}
        {has360 && <span><strong className="data-value">{readyCount}</strong> siap review</span>}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); resetPage(); }}
          placeholder="Cari nama atau divisi…"
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface flex-1 min-w-[180px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
        />
        <MultiCheckFilter label="Divisi"
          options={depts.map((d) => ({ value: d, label: d }))}
          selected={deptSel} onChange={(s) => { setDeptSel(s); resetPage(); }} />
        {has360 && (
          <MultiCheckFilter label="Kelengkapan 360°"
            options={[{ value: 'complete', label: 'Lengkap dinilai (siap review)' }, { value: 'incomplete', label: 'Belum lengkap' }]}
            selected={ratedSel} onChange={(s) => { setRatedSel(s); resetPage(); }} />
        )}
        {!readOnly && (
          <CheckboxFilter checked={onlyActionable} onChange={(v) => { setOnlyActionable(v); resetPage(); }} label="Hanya perlu tindakan" count={sum.actionable} />
        )}
        {active && (
          <button type="button" onClick={() => { setQ(''); setDeptSel(new Set()); setRatedSel(new Set()); resetPage(); }}
            className="text-[11px] font-semibold px-2.5 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">Bersihkan</button>
        )}
        <span className="text-[11px] text-ink-faint ml-auto">
          <span className="data-value">{shown.length}</span> dari <span className="data-value">{rows.length}</span> pegawai
        </span>
      </div>
      {!readOnly && onlyActionable && rows.length - sum.actionable > 0 && (
        <p className="text-[11px] text-ink-faint italic">{rows.length - sum.actionable} laporan selesai (Final) disembunyikan — hilangkan centang <strong>“Hanya perlu tindakan”</strong> untuk melihat semua.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[820px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
              <th className="py-2 pr-3 font-semibold">Pegawai</th>
              <th className="py-2 px-3 font-semibold">Divisi</th>
              <th className="py-2 px-3 text-center font-semibold">KPI</th>
              <th className="py-2 px-3 text-center font-semibold">360°</th>
              <th className="py-2 px-3 text-center font-semibold">Punish.</th>
              <th className="py-2 px-3 text-center font-semibold">Skor Akhir</th>
              {has360 && <th className="py-2 px-3 text-center font-semibold">Dinilai oleh</th>}
              <th className="py-2 px-3 text-center font-semibold">ACC</th>
              <th className="py-2 px-3 text-center font-semibold">Status</th>
              <th className="py-2 pl-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {shown.length === 0 && (
              <tr><td colSpan={has360 ? 10 : 9} className="py-6 text-center text-ink-faint italic">Tidak ada pegawai sesuai filter.</td></tr>
            )}
            {paged.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3">
                  <span className="font-bold text-ink">{r.name}</span>
                </td>
                <td className="py-3 px-3 text-xs text-ink-soft">{r.dept}</td>
                <td className="py-3 px-3 text-center data-value text-ink-soft">
                  {r.kpiAvg == null ? <span className="text-danger-ink text-[10px]">kosong</span> : (
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{fmt2(r.kpiAvg)}</span>
                      {r.totalMonths > 0 && (
                        <span className={r.missingMonths.length ? 'text-[9px] font-bold text-warn-ink' : 'text-[9px] text-ink-faint'}
                          title={r.missingMonths.length ? `Bulan belum ada KPI: ${r.missingMonths.join(', ')}` : 'Semua bulan terisi'}>
                          {r.totalMonths - r.missingMonths.length}/{r.totalMonths} bln
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-3 px-3 text-center data-value text-ink-soft">
                  {!has360 ? <span className="text-[10px] text-ink-faint">N/A</span>
                    : r.s360 == null ? <span className="text-[10px] text-warn-ink" title={NO_SCORE_TITLE}>{NO_SCORE_LABEL}</span>
                    : (
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{fmt2(r.s360)}</span>
                        {r.needsRecompute && (
                          <span title="Penilaian, koreksi relasi, atau bobot berubah sejak skor 360° terakhir dihitung — klik Hitung Ulang Skor 360°."
                            className="text-[9px] font-semibold text-warn-ink bg-warn-tint px-1.5 py-0.5 rounded-full">⚠ perlu hitung</span>
                        )}
                      </div>
                    )}
                </td>
                <td className="py-3 px-3 text-center data-value">
                  {r.penalty > 0 ? <span className="text-danger-ink font-bold">−{r.penalty}</span> : <span className="text-ink-faint">0</span>}
                </td>
                <td className="py-3 px-3 text-center data-value font-bold text-ink">
                  {(() => {
                    // Baris FINAL: tampilkan angka TERSIMPAN (beku) yang dilihat pegawai.
                    // Bila skor LIVE berbeda (KPI/360/punishment berubah sejak final) → badge "berubah".
                    if (r.status === 'finalized') {
                      const stored = r.storedFinal;
                      const drift = hasScoreDrift(r.final, stored);
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{stored != null ? fmt2(stored) : '—'}</span>
                          {drift && (
                            <span title={`Skor terkini ${fmt2(r.final!)} berbeda dari yang difinalisasi — Kembalikan ke Draf lalu Finalisasi ulang untuk memperbarui.`}
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-warn-tint text-warn-ink">
                              berubah → {fmt2(r.final!)}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return r.final != null ? fmt2(r.final) : '—';
                  })()}
                </td>
                {has360 && (
                  <td className="py-3 px-3 text-center">
                    {r.ratedTotal === 0
                      ? <span className="text-[10px] text-ink-faint">—</span>
                      : <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full data-value ${isRatedComplete(r) ? 'bg-brand-tint text-brand-ink' : 'bg-warn-tint text-warn-ink'}`}>
                          {r.ratedDone}/{r.ratedTotal}{isRatedComplete(r) ? ' ✓' : ''}
                        </span>}
                  </td>
                )}
                <td className="py-3 px-3 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    {r.spvAcc
                      ? <span className="text-[10px] font-bold text-brand-ink">✔ ACC</span>
                      : <span className="text-[10px] text-ink-faint">belum</span>}
                    {r.isSpvSubject && <span className="text-[9px] text-ink-faint" title="Laporan SPV di-ACC oleh Direksi">oleh Direksi</span>}
                  </div>
                </td>
                <td className="py-3 px-3 text-center">
                  {r.status === 'finalized'
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-tint text-brand-ink">Final</span>
                    : r.status === 'in_review'
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{r.isSpvSubject ? "Ditinjau Direksi" : "Ditinjau"}</span>
                    : r.status === 'draft'
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warn-tint text-warn-ink">Draf</span>
                    : <span className="text-[10px] text-ink-faint">—</span>}
                </td>
                <td className="py-3 pl-3 text-right">
                  {readOnly
                    ? <span className="text-[10px] text-ink-faint">—</span>
                    : r.final == null
                    ? <span className="text-[10px] text-ink-faint italic">KPI &amp; 360° kosong</span>
                    : <span className="inline-flex items-center gap-1.5 justify-end">
                        {/* Skor Akhir dari 360° saja (mis. Direksi) — beri konteks di samping tombol. */}
                        {r.kpiAvg == null && r.s360 != null && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warn-tint text-warn-ink" title="Skor Akhir dihitung dari 360° saja (belum/tak ada KPI)">Tanpa KPI</span>
                        )}
                        <Link href={`${hrefBase}/${r.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-control border border-brand/30 text-brand-ink hover:bg-brand-tint">
                          Tinjau →
                        </Link>
                      </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />
    </div>
  );
}
