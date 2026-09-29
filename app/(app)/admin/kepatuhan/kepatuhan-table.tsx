'use client';

import { useMemo, useState } from 'react';
import { PenaltyInput } from './penalty-input';
import { LateWaiver } from './late-waiver';
import { usePager, Pager, CheckboxFilter, MultiCheckFilter } from '@/components/table-controls';

export type KepatuhanRow = {
  id: string; name: string; dept: string;
  lateCount: number; lateTargets: string[]; selfMissing: boolean; points: number;
  /** Penilaian wajib yang DIKIRIM SESUDAH deadline (terhitung potongan) — nama + waktu kirim pertama (WIB). */
  lateSubmitted: string[];
  latePenalty: number; lateAuto: number; lateOverride: number | null; lateWaiveReason: string | null;
  /** Rincian kewajiban terlambat (terhitung potongan): Wajib vs AJUAN (opsional hasil permohonan). */
  lateWajib: number; lateAjuan: number;
  /** AJUAN yang BELUM dikirim sampai deadline lewat — nama target. */
  ajuanPending: string[];
};

/**
 * Baris "perlu perhatian" = ada penilaian wajib belum dikirim, ATAU dikirim terlambat, ATAU
 * belum self-assessment, ATAU sudah punya punishment/pengecualian (agar tetap bisa ditinjau/dikoreksi). Sisanya (patuh
 * penuh & tanpa punishment) disembunyikan secara default → halaman lebih bersih.
 */
const needsAttention = (r: KepatuhanRow) =>
  r.lateCount > 0 || r.lateSubmitted.length > 0 || r.ajuanPending.length > 0 || r.lateOverride != null || r.selfMissing || r.points > 0;

export function KepatuhanTable({ rows, readOnly = false }: { rows: KepatuhanRow[]; readOnly?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [deptSel, setDeptSel] = useState<Set<string>>(new Set()); // kosong = semua divisi
  const depts = useMemo(() => [...new Set(rows.map((r) => r.dept))].sort(), [rows]);
  const flagged = useMemo(() => rows.filter(needsAttention), [rows]);
  const base = showAll ? rows : flagged;
  const list = useMemo(
    () => (deptSel.size === 0 ? base : base.filter((r) => deptSel.has(r.dept))),
    [base, deptSel],
  );
  const hiddenCount = rows.length - flagged.length;
  // Paginasi 5-baris (komponen bersama) → "Tampilkan semua" bisa >100 baris.
  const { page, setPage, pageCount, shown, total, rangeFrom, rangeTo } = usePager(list);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-ink-soft">
          <span className="data-value font-semibold text-ink">{flagged.length}</span> perlu perhatian{showAll ? ` · ${rows.length} total pegawai` : ''}
        </span>
        <div className="flex items-center gap-3">
          <MultiCheckFilter label="Divisi"
            options={depts.map((d) => ({ value: d, label: d }))}
            selected={deptSel} onChange={(s) => { setDeptSel(s); setPage(0); }} />
          <CheckboxFilter checked={showAll} onChange={(v) => { setShowAll(v); setPage(0); }} label="Tampilkan semua pegawai" />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-10 text-sm text-ink-soft">
          ✅ Semua pegawai patuh &amp; tanpa punishment — tak ada yang perlu ditindak.
          {rows.length > 0 && (
            <div className="text-[11px] mt-1 text-ink-faint">
              Ingin memberi punishment manual? Centang <strong className="font-semibold text-ink-soft">&quot;Tampilkan semua pegawai&quot;</strong> di atas.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[720px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
                  <th className="py-2 pr-3 font-semibold">Pegawai</th>
                  <th className="py-2 px-3 text-center font-semibold">Belum Kirim</th>
                  <th className="py-2 px-3 text-center font-semibold">Kirim Terlambat</th>
                  <th className="py-2 px-3 text-center font-semibold">Potongan 360°</th>
                  <th className="py-2 px-3 text-center font-semibold">Self</th>
                  <th className="py-2 pl-3 text-right font-semibold">Punishment (poin)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-3">
                      <span className="font-bold text-ink block">{r.name}</span>
                      <span className="text-[11px] text-ink-faint">{r.dept}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.lateCount > 0 ? (
                        <span className="text-[11px] font-semibold text-danger-ink" title={r.lateTargets.join(', ')}>
                          <span className="data-value">{r.lateCount}</span> belum
                        </span>
                      ) : <span className="text-[11px] text-brand-ink">✔ lengkap</span>}
                      {r.ajuanPending.length > 0 && (
                        <span className="block text-[10px] font-semibold text-warn-ink mt-0.5"
                          title={`Ajuan (opsional, diajukan sendiri & disetujui HRD) belum dikirim sampai deadline: ${r.ajuanPending.join(', ')}`}>
                          + <span className="data-value">{r.ajuanPending.length}</span> ajuan belum
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.lateSubmitted.length > 0 ? (
                        <span className="text-[11px] font-semibold text-warn-ink" title={r.lateSubmitted.join('\n')}>
                          <span className="data-value">{r.lateSubmitted.length}</span> terlambat
                        </span>
                      ) : <span className="text-[11px] text-ink-faint">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <LateWaiver employeeId={r.id} penalty={r.latePenalty} auto={r.lateAuto} override={r.lateOverride}
                        reason={r.lateWaiveReason} lateWajib={r.lateWajib} lateAjuan={r.lateAjuan} readOnly={readOnly} />
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.selfMissing
                        ? <span className="text-[10px] font-semibold text-warn-ink">belum</span>
                        : <span className="text-[10px] text-brand-ink">✔</span>}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {readOnly
                        ? <span className={`text-sm font-bold data-value ${r.points > 0 ? 'text-danger-ink' : 'text-ink-faint'}`}>{r.points > 0 ? `${r.points} poin` : '—'}</span>
                        : <PenaltyInput employeeId={r.id} initial={r.points} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />
          {!showAll && hiddenCount > 0 && (
            <p className="text-[11px] text-ink-faint italic">
              {hiddenCount} pegawai patuh disembunyikan — centang &quot;Tampilkan semua pegawai&quot; untuk melihat.
            </p>
          )}
        </>
      )}
    </div>
  );
}
