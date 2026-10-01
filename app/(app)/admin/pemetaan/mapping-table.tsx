'use client';

import { useMemo, useState } from 'react';
import { colPercents } from '@/lib/table-cols';
import { DeleteButton } from './delete-button';
import type { PairStatus } from './actions';
import { SearchableSelect } from '@/components/searchable-select';
import { usePager, Pager } from '@/components/table-controls';

export type MapRow = {
  id: string; assessorId: string; assessor: string; targetId: string; target: string;
  relation: string; mandatory: boolean;
  /** Status penilaian pasangan ini (Screen 07). */
  status: PairStatus;
};

const STATUS_LABEL: Record<PairStatus, string> = { none: 'Belum Mulai', draft: 'Draft', submitted: 'Terkirim', invalidated: 'Dibatalkan' };
const STATUS_CLS: Record<PairStatus, string> = {
  none: 'bg-neutral-tint text-ink-soft', draft: 'bg-warn-tint text-warn-ink',
  submitted: 'bg-brand-tint text-brand-ink', invalidated: 'bg-neutral-tint text-ink-faint',
};

/** Daftar pemetaan + filter Penilai & Target (ala legacy). */
export function MappingTable({ rows }: { rows: MapRow[] }) {
  const [fAssessor, setFAssessor] = useState('all');
  const [fTarget, setFTarget] = useState('all');
  const [fStatus, setFStatus] = useState<'all' | PairStatus>('all');

  const assessors = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.assessorId, r.assessor));
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const targets = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.targetId, r.target));
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const shown = rows.filter((r) => (fAssessor === 'all' || r.assessorId === fAssessor) && (fTarget === 'all' || r.targetId === fTarget)
    && (fStatus === 'all' || r.status === fStatus));
  const active = fAssessor !== 'all' || fTarget !== 'all' || fStatus !== 'all';
  // Paginasi 5-baris (komponen bersama) → pemetaan bisa ratusan pasangan.
  const { page, setPage, pageCount, shown: paged, total, rangeFrom, rangeTo } = usePager(shown);

  if (rows.length === 0) return (
    <div className="border border-dashed border-line-strong rounded-panel p-5 text-center">
      <p className="text-2xl mb-1">🔗</p>
      <p className="text-sm font-bold text-ink">Belum ada pemetaan penilai untuk periode ini</p>
      <p className="text-[12.5px] text-ink-soft mt-1 max-w-sm mx-auto leading-relaxed">
        Tentukan siapa menilai siapa dengan salah satu cara di atas:
        <strong className="font-semibold text-ink"> tambah manual</strong>, <strong className="font-semibold text-ink">impor Excel</strong>, atau <strong className="font-semibold text-ink">salin dari periode sebelumnya</strong> (tetap bisa diedit).
      </p>
    </div>
  );

  // Label total dinamis mengikuti filter aktif.
  const aName = assessors.find((a) => a.id === fAssessor)?.name;
  const tName = targets.find((t) => t.id === fTarget)?.name;
  const totalLabel = !active
    ? `Total ${rows.length} pasangan penilaian`
    : aName && tName ? `${shown.length} pasangan · ${aName} → ${tName}`
    : aName ? `${shown.length} pasangan dinilai oleh ${aName}`
    : tName ? `${shown.length} pasangan menilai ${tName}`
    : `${shown.length} pasangan · ${STATUS_LABEL[fStatus as PairStatus]}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-ink">Daftar Pemetaan</h3>
        <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${active ? 'text-brand-ink bg-brand-tint border border-brand/20' : 'text-ink-soft bg-neutral-tint'}`}>
          {totalLabel}{active && <span className="font-normal text-ink-faint"> · dari <span className="data-value">{rows.length}</span></span>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-56">
          <SearchableSelect
            value={fAssessor}
            onChange={(v) => { setFAssessor(v); setPage(0); }}
            options={[{ value: 'all', label: '👤 Semua Penilai' }, ...assessors.map((a) => ({ value: a.id, label: a.name }))]}
            searchPlaceholder="Cari penilai…"
            className="text-xs px-3 py-2 border border-line rounded-control bg-surface focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </div>
        <div className="w-full sm:w-56">
          <SearchableSelect
            value={fTarget}
            onChange={(v) => { setFTarget(v); setPage(0); }}
            options={[{ value: 'all', label: '🎯 Semua Target' }, ...targets.map((t) => ({ value: t.id, label: t.name }))]}
            searchPlaceholder="Cari target…"
            className="text-xs px-3 py-2 border border-line rounded-control bg-surface focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
        </div>
        <select value={fStatus} onChange={(e) => { setFStatus(e.target.value as typeof fStatus); setPage(0); }}
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
          <option value="all">Semua Status</option>
          {(Object.keys(STATUS_LABEL) as PairStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
        {active && (
          <button type="button" onClick={() => { setFAssessor('all'); setFTarget('all'); setFStatus('all'); setPage(0); }}
            className="text-[11px] font-semibold px-2.5 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">Bersihkan</button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-soft">Tidak ada pemetaan sesuai filter.</p>
      ) : (
        <div className="overflow-x-auto">
        {/* table-fixed + colgroup: lebar kolom TETAP antar halaman/filter (tak bergeser saat paging). */}
        <table className="w-full table-fixed text-left text-sm min-w-[530px]">
          <colgroup>
            {colPercents([
              18, // Penilai (%)
              18, // Yang Dinilai
              14, // Relasi ("Atasan"/"Bawahan" muat satu baris)
              14, // Sifat (Wajib/Opsional)
              18, // Status ("Belum Mulai")
              18, // Aksi ("Periksa Validitas", boleh 2 baris)
            ]).map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
              <th className="py-2 pr-3 font-semibold">Penilai</th><th className="py-2 px-3 font-semibold">Yang Dinilai</th><th className="py-2 px-3 font-semibold">Relasi</th>
              <th className="py-2 px-3 text-center font-semibold">Sifat</th><th className="py-2 px-3 text-center font-semibold">Status</th>
              <th className="py-2 pl-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {paged.map((r) => (
              <tr key={r.id}>
                <td className="py-3 pr-3 font-bold text-ink break-words">{r.assessor}</td>
                <td className="py-3 px-3 text-ink-soft break-words">{r.target}</td>
                <td className="py-3 px-2 text-ink-soft">{r.relation}</td>
                <td className="py-3 px-2 text-center">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.mandatory ? 'bg-danger-tint text-danger-ink' : 'bg-neutral-tint text-ink-faint'}`}>
                    {r.mandatory ? 'Wajib' : 'Opsional'}
                  </span>
                </td>
                <td className="py-3 px-2 text-center">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td className="py-3 pl-3 text-right"><DeleteButton mappingId={r.id} status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pasangan" />
      <p className="text-[11px] text-ink-faint leading-relaxed">
        Relasi menentukan kelas bobot 360 (Atasan/Peer/Cross/Self). Sifat Wajib jadi dasar Flag Kepatuhan.
        Hapus hanya untuk status Belum Mulai &amp; Draft (alasan wajib). Penilaian Terkirim tidak dapat dihapus —
        gunakan <strong className="font-semibold text-ink-soft">Periksa Validitas</strong> untuk membatalkan validitasnya
        (dikeluarkan dari Skor 360°, jawaban tetap tersimpan sebagai arsip). Semua tindakan tercatat di Log Aktivitas.
      </p>
    </div>
  );
}
