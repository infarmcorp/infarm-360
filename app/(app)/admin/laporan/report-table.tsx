'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReportStatus } from '@/lib/database.types';
import { usePager, Pager } from '@/components/table-controls';

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

/** Tabel Review Hasil Akhir + pencarian, filter Divisi & Kelengkapan 360° (client).
 * `hrefBase` = basis tautan "Tinjau" (default '/laporan' untuk HRD; '/review-hasil' utk Direksi read-only).
 * `readOnly` = pemegang grant lihat-saja: sembunyikan tautan "Tinjau" (tanpa akses detail; Tahap 1). */
export function ReportTable({ rows, depts, has360, hrefBase = '/laporan', readOnly = false }: { rows: ReportRow[]; depts: string[]; has360: boolean; hrefBase?: string; readOnly?: boolean }) {
  const [q, setQ] = useState('');
  const [fDept, setFDept] = useState('all');
  const [fRated, setFRated] = useState<'all' | 'complete' | 'incomplete'>('all');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (fDept === 'all' || r.dept === fDept) &&
      (fRated === 'all' || (fRated === 'complete' ? isRatedComplete(r) : !isRatedComplete(r))) &&
      (!needle || `${r.name} ${r.dept}`.toLowerCase().includes(needle)),
    );
  }, [rows, q, fDept, fRated]);

  const active = q.trim() !== '' || fDept !== 'all' || fRated !== 'all';
  const readyCount = useMemo(() => rows.filter(isRatedComplete).length, [rows]);
  // Paginasi 5-baris (komponen bersama) → daftar bisa 100+; dipakai HRD finalisasi & Direksi review.
  const { page, setPage, pageCount, shown: paged, total, rangeFrom, rangeTo } = usePager(shown);
  const resetPage = () => setPage(0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); resetPage(); }}
          placeholder="Cari nama atau divisi…"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg flex-1 min-w-[180px] focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <select value={fDept} onChange={(e) => { setFDept(e.target.value); resetPage(); }}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
          <option value="all">Semua Divisi</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        {has360 && (
          <select value={fRated} onChange={(e) => { setFRated(e.target.value as typeof fRated); resetPage(); }}
            title="Saring berdasarkan kelengkapan penilaian 360° (penilai wajib yang sudah submit)"
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600">
            <option value="all">Semua Kelengkapan 360°</option>
            <option value="complete">Lengkap dinilai (siap review)</option>
            <option value="incomplete">Belum lengkap</option>
          </select>
        )}
        {active && (
          <button type="button" onClick={() => { setQ(''); setFDept('all'); setFRated('all'); resetPage(); }}
            className="text-[11px] font-bold px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Bersihkan</button>
        )}
        <span className="text-[11px] text-gray-500 ml-auto">
          {shown.length} dari {rows.length} pegawai{has360 ? ` · ${readyCount} siap review` : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[820px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3">Divisi</th>
              <th className="py-2 px-3 text-center">KPI</th>
              <th className="py-2 px-3 text-center">360°</th>
              <th className="py-2 px-3 text-center">Punish.</th>
              <th className="py-2 px-3 text-center">Skor Akhir</th>
              {has360 && <th className="py-2 px-3 text-center">Dinilai oleh</th>}
              <th className="py-2 px-3 text-center">ACC</th>
              <th className="py-2 px-3 text-center">Status</th>
              <th className="py-2 pl-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && (
              <tr><td colSpan={has360 ? 10 : 9} className="py-6 text-center text-gray-500 italic">Tidak ada pegawai sesuai filter.</td></tr>
            )}
            {paged.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3">
                  <span className="font-bold text-gray-800">{r.name}</span>
                </td>
                <td className="py-3 px-3 text-xs text-gray-600">{r.dept}</td>
                <td className="py-3 px-3 text-center font-mono text-slate-600">
                  {r.kpiAvg == null ? <span className="text-rose-500 text-[10px]">kosong</span> : (
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{r.kpiAvg.toFixed(2)}</span>
                      {r.totalMonths > 0 && (
                        <span className={r.missingMonths.length ? 'text-[9px] font-bold text-amber-700' : 'text-[9px] text-gray-400'}
                          title={r.missingMonths.length ? `Bulan belum ada KPI: ${r.missingMonths.join(', ')}` : 'Semua bulan terisi'}>
                          {r.totalMonths - r.missingMonths.length}/{r.totalMonths} bln
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-3 px-3 text-center font-mono text-slate-600">
                  {!has360 ? <span className="text-[10px] text-gray-400">N/A</span>
                    : r.s360 == null ? <span className="text-[10px] text-amber-600">belum</span>
                    : (
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{r.s360.toFixed(2)}</span>
                        {r.needsRecompute && (
                          <span title="Penilaian berubah sejak skor 360° terakhir dihitung — klik Hitung Ulang Skor 360°."
                            className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">⚠ perlu hitung</span>
                        )}
                      </div>
                    )}
                </td>
                <td className="py-3 px-3 text-center font-mono">
                  {r.penalty > 0 ? <span className="text-rose-600 font-bold">−{r.penalty}</span> : <span className="text-gray-400">0</span>}
                </td>
                <td className="py-3 px-3 text-center font-mono font-black text-slate-800">
                  {(() => {
                    // Baris FINAL: tampilkan angka TERSIMPAN (beku) yang dilihat pegawai.
                    // Bila skor LIVE berbeda (KPI/360/punishment berubah sejak final) → badge "berubah".
                    if (r.status === 'finalized') {
                      const stored = r.storedFinal;
                      const drift = r.final != null && stored != null && Math.abs(r.final - stored) >= 0.05;
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{stored != null ? stored.toFixed(2) : '—'}</span>
                          {drift && (
                            <span title={`Skor terkini ${r.final!.toFixed(2)} berbeda dari yang difinalisasi — Kembalikan ke Draf lalu Finalisasi ulang untuk memperbarui.`}
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              berubah → {r.final!.toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return r.final != null ? r.final.toFixed(2) : '—';
                  })()}
                </td>
                {has360 && (
                  <td className="py-3 px-3 text-center">
                    {r.ratedTotal === 0
                      ? <span className="text-[10px] text-gray-500">—</span>
                      : <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isRatedComplete(r) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {r.ratedDone}/{r.ratedTotal}{isRatedComplete(r) ? ' ✓' : ''}
                        </span>}
                  </td>
                )}
                <td className="py-3 px-3 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    {r.spvAcc
                      ? <span className="text-[10px] font-bold text-emerald-700">✔ ACC</span>
                      : <span className="text-[10px] text-gray-500">belum</span>}
                    {r.isSpvSubject && <span className="text-[9px] text-gray-400" title="Laporan SPV di-ACC oleh Direksi">oleh Direksi</span>}
                  </div>
                </td>
                <td className="py-3 px-3 text-center">
                  {r.status === 'finalized'
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Final</span>
                    : r.status === 'in_review'
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">Ditinjau SPV</span>
                    : r.status === 'draft'
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Draf</span>
                    : <span className="text-[10px] text-gray-500">—</span>}
                </td>
                <td className="py-3 pl-3 text-right">
                  {readOnly
                    ? <span className="text-[10px] text-gray-400">—</span>
                    : r.final == null
                    ? <span className="text-[10px] text-gray-500 italic">KPI &amp; 360° kosong</span>
                    : <span className="inline-flex items-center gap-1.5 justify-end">
                        {/* Skor Akhir dari 360° saja (mis. Direksi) — beri konteks di samping tombol. */}
                        {r.kpiAvg == null && r.s360 != null && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200" title="Skor Akhir dihitung dari 360° saja (belum/tak ada KPI)">Tanpa KPI</span>
                        )}
                        <Link href={`${hrefBase}/${r.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50">
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
