'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Person } from './struktur-view';

export type OrgNode = Person & { children: OrgNode[] };

const ROLE_LABEL: Record<Person['role'], string> = { employee: 'STAF', spv: 'SUPERVISOR', hrd: 'HRD ADMIN', direksi: 'DIREKSI' };
// Warna kotak per peran (puncak menonjol → daun lebih kalem). Token: apex charcoal → hijau → netral.
const ROLE_BOX: Record<Person['role'], string> = {
  direksi: 'bg-sidebar text-white border-black/30',
  hrd: 'bg-brand-ink text-white border-brand-ink',
  spv: 'bg-brand text-white border-brand',
  employee: 'bg-neutral-tint text-ink border-line',
};

/**
 * Bagan organisasi MENURUN (indented tree): bawahan tersusun ke bawah & menjorok masuk di
 * bawah atasannya — lebar nyaris tetap berapa pun jumlah staf. Atasan EFEKTIF: pegawai
 * berkoordinator tampil di bawah KOORDINATORNYA (bukan langsung SPV). Cabang di bawah node
 * koordinator digambar teal putus-putus untuk menandai relasi koordinasi. Node dengan bawahan
 * bisa dilipat. Read-only.
 */
export function OrgChart({ roots }: { roots: OrgNode[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const Node = ({ n }: { n: OrgNode }) => {
    const kids = n.children;
    const isC = collapsed.has(n.id);
    const light = n.role === 'employee';
    return (
      <li className={n.active ? '' : 'opacity-60'}>
        <button type="button" onClick={() => kids.length && toggle(n.id)}
          className={`vt-box border ${ROLE_BOX[n.role]} ${kids.length ? 'cursor-pointer' : 'cursor-default'}`}
          title={kids.length ? (isC ? 'Klik untuk buka bawahan' : 'Klik untuk tutup bawahan') : undefined}>
          {kids.length > 0
            ? (isC ? <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-80" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-80" />)
            : <span className="w-3.5 shrink-0" />}
          <span className="vt-name">{n.name}</span>
          <span className={`vt-role ${light ? 'bg-line-soft text-ink-soft' : 'bg-white/25 text-white'}`}>{ROLE_LABEL[n.role]}</span>
          {n.dept && <span className={`vt-dept ${light ? 'text-ink-faint' : 'text-white/70'}`}>{n.dept}</span>}
          {n.isHrdAdmin && <span className={`vt-g ${light ? 'bg-brand-tint text-brand-ink' : 'bg-white/25'}`} title="Izin HRD">HRD</span>}
          {n.isCoordinator && <span className={`vt-g ${light ? 'bg-brand-tint text-brand-ink' : 'bg-white/25'}`} title="Koordinator">KOOR</span>}
          {kids.length > 0 && <span className={`vt-count ${light ? 'text-ink-faint' : 'text-white/70'}`}>{kids.length}{n.isCoordinator ? ' binaan' : ''}</span>}
        </button>
        {kids.length > 0 && !isC && (
          // Cabang di bawah KOORDINATOR digambar teal putus-putus (relasi koordinasi, bukan SPV).
          <ul className={n.isCoordinator ? 'vt-coord' : ''}>{kids.map((c) => <Node key={c.id} n={c} />)}</ul>
        )}
      </li>
    );
  };

  return (
    <div className="overflow-x-auto pb-2">
      <ul className="vt">{roots.map((r) => <Node key={r.id} n={r} />)}</ul>
      <style>{`
        .vt, .vt ul { list-style: none; margin: 0; padding: 0; }
        .vt ul { margin-left: 15px; padding-left: 16px; border-left: 2px solid var(--color-line-strong); }
        .vt li { position: relative; }
        .vt ul > li::before { content: ''; position: absolute; left: -16px; top: 17px; width: 13px; border-top: 2px solid var(--color-line-strong); }
        /* tutup ekor garis vertikal di bawah anak terakhir */
        .vt ul > li:last-child::after { content: ''; position: absolute; left: -18px; top: 18px; bottom: 0; width: 2px; background: var(--color-bg); }
        /* cabang KOORDINASI: brand putus-putus (koordinator → binaan, bukan garis SPV) */
        .vt ul.vt-coord { border-left: 2px dashed var(--color-brand); }
        .vt ul.vt-coord > li::before { border-top: 2px dashed var(--color-brand); }
        .vt-box { display: inline-flex; align-items: center; gap: 6px; border-radius: var(--radius-control); padding: 5px 10px; margin: 3px 0; max-width: 100%; }
        .vt-name { font-size: 12px; font-weight: 800; white-space: nowrap; }
        .vt-role { font-size: 8.5px; font-weight: 700; letter-spacing: .04em; padding: 1px 5px; border-radius: 4px; white-space: nowrap; }
        .vt-dept { font-size: 9px; white-space: nowrap; }
        .vt-g { font-size: 8px; font-weight: 700; padding: 0 4px; border-radius: 999px; white-space: nowrap; }
        .vt-count { font-size: 9px; font-weight: 800; margin-left: 1px; white-space: nowrap; }
      `}</style>
    </div>
  );
}
