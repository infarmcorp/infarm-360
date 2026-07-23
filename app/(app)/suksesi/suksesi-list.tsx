'use client';

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
  draft: { t: 'Draf', c: 'bg-gray-100 text-gray-600' },
  submitted: { t: 'Diajukan', c: 'bg-amber-100 text-amber-800' },
  approved: { t: 'Disetujui', c: 'bg-emerald-100 text-emerald-800' },
  rejected: { t: 'Ditolak', c: 'bg-rose-100 text-rose-700' },
};

export function SuksesiList({ rows }: { rows: SuksesiRow[] }) {
  const [q, setQ] = useState('');
  const [onlyCandidate, setOnlyCandidate] = useState(false);

  const candidateCount = useMemo(() => rows.filter((r) => r.final != null && r.final >= 90).length, [rows]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!onlyCandidate || (r.final != null && r.final >= 90)) &&
      (!t || `${r.name} ${r.dept}`.toLowerCase().includes(t)));
  }, [rows, q, onlyCandidate]);
  const { page, setPage, pageCount, shown, total, rangeFrom, rangeTo } = usePager(filtered);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama atau divisi…"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg flex-1 min-w-[180px] focus:outline-none focus:ring-1 focus:ring-emerald-600" />
        <CheckboxFilter checked={onlyCandidate} onChange={(v) => { setOnlyCandidate(v); setPage(0); }} label="Hanya kandidat (≥ 90)" count={candidateCount} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">Tidak ada pegawai sesuai filter.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const badge = r.plan ? STATUS_BADGE[r.plan.status] : null;
            return (
              <div key={r.id} className="border border-gray-200 rounded-xl p-3 grid md:grid-cols-[1fr_1.6fr] gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 text-sm">{r.name}</span>
                    {r.final != null && r.final >= 90 && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">Kandidat</span>}
                  </div>
                  <div className="text-[11px] text-gray-500">{r.dept}</div>
                  <div className="mt-1 text-xs">Skor Akhir: <span className="font-mono font-black text-slate-800">{r.final != null ? r.final.toFixed(2) : '—'}</span></div>
                  {badge && <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span>}
                  {r.plan?.direksi_comment && <p className="mt-1 text-[10px] text-gray-500 italic">Direksi: “{r.plan.direksi_comment}”</p>}
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
