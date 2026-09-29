'use client';

import { fmt2 } from '@/lib/scoring';

import { useMemo, useState } from 'react';
import { usePager, Pager, CheckboxFilter } from '@/components/table-controls';
import { PlanForm } from './plan-form';

/**
 * Daftar kandidat Promosi & Suksesi (HRD) — klien. Data (Skor Akhir + rencana) dihitung
 * server; komponen ini menyajikan + paginasi 5-baris + pencarian + filter "hanya kandidat"
 * (Skor Akhir ≥ 90). Diurut Skor Akhir tertinggi lebih dulu (dari server).
 */
export type SuksesiRow = {
  id: string; name: string; dept: string; final: number | null;
  plan: { id: string; plan: string; justification: string | null; status: string; direksi_comment: string | null } | null;
};

const STATUS_BADGE: Record<string, { t: string; c: string }> = {
  draft: { t: 'Draf', c: 'bg-neutral-tint text-ink-soft' },
  submitted: { t: 'Diajukan', c: 'bg-warn-tint text-warn-ink' },
  approved: { t: 'Disetujui', c: 'bg-brand-tint text-brand-ink' },
  rejected: { t: 'Ditolak', c: 'bg-danger-tint text-danger-ink' },
};

/** "Perlu perhatian" = kandidat (Skor Akhir ≥ 90) ATAU sudah punya rencana berjalan (agar rencana
 *  yang sedang diproses tak ikut tersembunyi saat fokus). */
const isActionable = (r: SuksesiRow) => (r.final != null && r.final >= 90) || r.plan != null;

export function SuksesiList({ rows }: { rows: SuksesiRow[] }) {
  const [q, setQ] = useState('');
  const [onlyActionable, setOnlyActionable] = useState(true); // default fokus ke yang perlu perhatian

  const candidateCount = useMemo(() => rows.filter((r) => r.final != null && r.final >= 90).length, [rows]);
  const actionableCount = useMemo(() => rows.filter(isActionable).length, [rows]);
  // Ringkasan status rencana (ACC Direksi) untuk baris ringkasan-dulu.
  const stat = useMemo(() => {
    let submitted = 0, approved = 0;
    for (const r of rows) { if (r.plan?.status === 'submitted') submitted++; else if (r.plan?.status === 'approved') approved++; }
    return { submitted, approved };
  }, [rows]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!onlyActionable || isActionable(r)) &&
      (!t || `${r.name} ${r.dept}`.toLowerCase().includes(t)));
  }, [rows, q, onlyActionable]);
  const { page, setPage, pageCount, shown, total, rangeFrom, rangeTo } = usePager(filtered);
  const hiddenCount = rows.length - actionableCount;

  return (
    <div className="space-y-3">
      {/* Ringkasan-dulu: gambaran cepat sebelum daftar. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        <span><strong className="text-ink data-value">{rows.length}</strong> pegawai</span>
        <span><strong className="text-brand-ink data-value">{candidateCount}</strong> kandidat (≥90)</span>
        {stat.submitted > 0 && <span><strong className="text-warn-ink data-value">{stat.submitted}</strong> menunggu ACC Direksi</span>}
        <span><strong className="text-brand-ink data-value">{stat.approved}</strong> disetujui</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama atau divisi…"
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface flex-1 min-w-[180px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <CheckboxFilter checked={onlyActionable} onChange={(v) => { setOnlyActionable(v); setPage(0); }} label="Fokus (kandidat & rencana berjalan)" count={actionableCount} />
      </div>

      {onlyActionable && hiddenCount > 0 && (
        <p className="text-[11px] text-ink-faint italic">{hiddenCount} pegawai lain disembunyikan — hilangkan centang <strong>“Fokus”</strong> untuk melihat semua.</p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-soft">Tidak ada pegawai sesuai filter.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const badge = r.plan ? STATUS_BADGE[r.plan.status] : null;
            return (
              <div key={r.id} className="border border-line rounded-panel p-3 grid md:grid-cols-[1fr_1.6fr] gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink text-sm">{r.name}</span>
                    {r.final != null && r.final >= 90 && <span className="text-[10px] font-semibold bg-brand-tint text-brand-ink px-1.5 py-0.5 rounded-full">Kandidat</span>}
                  </div>
                  <div className="text-[11px] text-ink-faint">{r.dept}</div>
                  <div className="mt-1 text-xs text-ink-soft">Skor Akhir: <span className="data-value font-bold text-ink">{r.final != null ? fmt2(r.final) : '—'}</span></div>
                  {badge && <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span>}
                  {r.plan?.direksi_comment && <p className="mt-1 text-[10px] text-ink-faint italic">Direksi: “{r.plan.direksi_comment}”</p>}
                </div>
                <PlanForm
                  employeeId={r.id}
                  planId={r.plan?.id ?? null}
                  currentPlan={r.plan?.plan ?? ''}
                  currentJust={r.plan?.justification ?? ''}
                  status={r.plan?.status ?? null}
                />
              </div>
            );
          })}
        </div>
      )}
      <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />
    </div>
  );
}
