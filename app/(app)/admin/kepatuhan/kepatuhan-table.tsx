'use client';

import { useMemo, useState } from 'react';
import { colPercents } from '@/lib/table-cols';
import { Check, CheckCircle2 } from 'lucide-react';
import { TABLE_HEAD } from '@/components/infarm-ui';
import { LateWaiver } from './late-waiver';
import { usePager, StableHeight, Pager, CheckboxFilter, MultiCheckFilter } from '@/components/table-controls';

export type KepatuhanRow = {
  id: string; name: string; dept: string;
  lateCount: number; lateTargets: string[];
  /** Penilaian wajib yang DIKIRIM SESUDAH deadline (terhitung potongan) — nama + waktu kirim pertama (WIB). */
  lateSubmitted: string[];
  latePenalty: number; lateAuto: number; lateOverride: number | null; lateWaiveReason: string | null;
  /** Rincian kewajiban terlambat (terhitung potongan): Wajib vs AJUAN (opsional hasil permohonan). */
  lateWajib: number; lateAjuan: number;
  /** AJUAN yang BELUM dikirim sampai deadline lewat — nama target. */
  ajuanPending: string[];
};

/**
 * Baris "perlu perhatian" = ada penilaian wajib/ajuan belum dikirim, ATAU dikirim terlambat, ATAU
 * sudah punya penetapan potongan HRD (Self Assessment dinonaktifkan Q3 2026) (agar tetap bisa ditinjau/dikoreksi). Sisanya (patuh
 * penuh & tanpa penetapan potongan) disembunyikan secara default → halaman lebih bersih.
 */
const needsAttention = (r: KepatuhanRow) =>
  r.lateCount > 0 || r.lateSubmitted.length > 0 || r.ajuanPending.length > 0 || r.lateOverride != null;

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
        <span className="text-xs text-ink-soft">
          <span className="font-mono font-semibold text-ink">{flagged.length}</span> perlu perhatian{showAll ? ` · ${rows.length} total pegawai` : ''}
        </span>
        <div className="flex items-center gap-3">
          <MultiCheckFilter label="Divisi"
            options={depts.map((d) => ({ value: d, label: d }))}
            selected={deptSel} onChange={(s) => { setDeptSel(s); setPage(0); }} />
          <CheckboxFilter checked={showAll} onChange={(v) => { setShowAll(v); setPage(0); }} label="Tampilkan semua pegawai" />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
            Semua pegawai patuh — tak ada yang perlu ditindak.
          </span>
          {rows.length > 0 && (
            <div className="text-xs mt-1 text-ink-soft">
              Ingin melihat atau mengubah potongan pegawai lain? Centang <strong className="font-semibold text-ink-soft">&quot;Tampilkan semua pegawai&quot;</strong> di atas.
            </div>
          )}
        </div>
      ) : (
        <>
          <StableHeight>
          <div className="overflow-x-auto">
            {/* table-fixed + colgroup: lebar kolom TETAP antar halaman (tak bergeser saat paging). */}
            <table className="w-full table-fixed table-1line text-left text-[13px] min-w-[580px]">
              <colgroup>
                {colPercents([
                  220, // Pegawai + divisi
                  130, // Belum Kirim
                  140, // Kirim Terlambat
                  250, // Potongan 360° (+ form ubah: angka + alasan)
                ]).map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr className={TABLE_HEAD}>
                  <th className="py-2.5 px-3 rounded-l-lg">Pegawai</th>
                  <th className="py-2.5 px-3 text-center">Belum Kirim</th>
                  <th className="py-2.5 px-3 text-center">Kirim Terlambat</th>
                  <th className="py-2.5 px-3 text-center rounded-r-lg">Potongan 360°</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {shown.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-infarm-surface/60">
                    <td className="py-3 px-3 break-words">
                      <span className="font-bold text-ink block">{r.name}</span>
                      <span className="text-xs text-ink-soft">{r.dept}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.lateCount > 0 ? (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-danger-tint text-danger-ink" title={readOnly ? undefined : r.lateTargets.join(', ')}>
                          <span className="font-mono">{r.lateCount}</span> belum
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-brand-tint text-brand-ink">
                          <Check className="w-3 h-3" /> lengkap
                        </span>
                      )}
                      {r.ajuanPending.length > 0 && (
                        <span className="block text-[11px] font-semibold text-warn-ink mt-1"
                          title={readOnly ? 'Ajuan (opsional, diajukan sendiri & disetujui HRD) belum dikirim sampai tenggat' : `Ajuan (opsional, diajukan sendiri & disetujui HRD) belum dikirim sampai tenggat: ${r.ajuanPending.join(', ')}`}>
                          + <span className="font-mono">{r.ajuanPending.length}</span> ajuan belum
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {r.lateSubmitted.length > 0 ? (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-danger-tint text-danger-ink" title={readOnly ? undefined : r.lateSubmitted.join('\n')}>
                          <span className="font-mono">{r.lateSubmitted.length}</span> terlambat
                        </span>
                      ) : <span className="text-[13px] text-ink-soft">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <LateWaiver employeeId={r.id} penalty={r.latePenalty} auto={r.lateAuto} override={r.lateOverride}
                        reason={r.lateWaiveReason} lateWajib={r.lateWajib} lateAjuan={r.lateAjuan} readOnly={readOnly} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />
          </StableHeight>
          {!showAll && hiddenCount > 0 && (
            <p className="text-xs text-ink-soft">
              {hiddenCount} pegawai patuh disembunyikan — centang &quot;Tampilkan semua pegawai&quot; untuk melihat.
            </p>
          )}
        </>
      )}
    </div>
  );
}
