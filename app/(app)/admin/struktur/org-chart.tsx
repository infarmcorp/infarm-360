'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Person } from './struktur-view';

export type OrgNode = Person & { children: OrgNode[] };

const ROLE_LABEL: Record<Person['role'], string> = { employee: 'STAF', spv: 'SUPERVISOR', hrd: 'HRD ADMIN', direksi: 'DIREKSI' };
// Kotak per peran (Design System Infarm): puncak (Direksi) hijau tua solid → pemimpin (SPV/HRD) hijau pucat
// → staf kartu putih bergaris. Koordinator (staf) ditandai krem agar lapisan koordinasi terbaca.
const ROLE_BOX: Record<Person['role'], string> = {
  direksi: 'bg-infarm-dark text-white border-infarm-dark',
  hrd: 'bg-brand-tint text-ink border-infarm-light',
  spv: 'bg-brand-tint text-ink border-infarm-light',
  employee: 'bg-surface text-ink border-line',
};
const COORD_BOX = 'bg-infarm-cream text-ink border-infarm-cream';

/**
 * Bagan organisasi MENURUN (indented tree): bawahan tersusun ke bawah & menjorok masuk di
 * bawah atasannya — lebar nyaris tetap berapa pun jumlah staf. Atasan EFEKTIF: pegawai
 * berkoordinator tampil di bawah KOORDINATORNYA (bukan langsung SPV). Cabang di bawah node
 * koordinator digambar putus-putus untuk menandai relasi koordinasi. Node dengan bawahan
 * bisa dilipat. Read-only.
 */
export function OrgChart({ roots }: { roots: OrgNode[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const Node = ({ n }: { n: OrgNode }) => {
    const kids = n.children;
    const isC = collapsed.has(n.id);
    const dark = n.role === 'direksi';
    const box = n.role === 'employee' && n.isCoordinator ? COORD_BOX : ROLE_BOX[n.role];
    return (
      <li className={n.active ? '' : 'opacity-60'}>
        <button type="button" onClick={() => kids.length && toggle(n.id)}
          className={`vt-box border ${box} ${kids.length ? 'cursor-pointer hover:border-brand' : 'cursor-default'}`}
          title={kids.length ? (isC ? 'Klik untuk buka bawahan' : 'Klik untuk tutup bawahan') : undefined}>
          {kids.length > 0
            ? (isC ? <ChevronRight className="w-4 h-4 shrink-0 opacity-80" /> : <ChevronDown className="w-4 h-4 shrink-0 opacity-80" />)
            : <span className="w-4 shrink-0" />}
          <span className="vt-name">{n.name}</span>
          <span className={`vt-role ${dark ? 'bg-white/20 text-white' : n.role === 'employee' ? 'bg-neutral-tint text-ink-soft' : 'bg-surface text-brand-ink'}`}>{ROLE_LABEL[n.role]}</span>
          {n.dept && <span className={`vt-dept ${dark ? 'text-white/75' : 'text-ink-soft'}`}>{n.dept}</span>}
          {n.isHrdAdmin && <span className={`vt-g ${dark ? 'bg-white/20 text-white' : 'bg-brand-tint text-brand-ink'}`} title="Izin HRD">HRD</span>}
          {n.isCoordinator && <span className={`vt-g ${dark ? 'bg-white/20 text-white' : 'bg-surface text-infarm-soil'}`} title="Koordinator">KOOR</span>}
          {kids.length > 0 && <span className={`vt-count font-mono ${dark ? 'text-white/75' : 'text-ink-soft'}`}>{kids.length}{n.isCoordinator ? <span className="font-sans"> binaan</span> : ''}</span>}
        </button>
        {kids.length > 0 && !isC && (
          // Cabang di bawah KOORDINATOR digambar putus-putus (relasi koordinasi, bukan SPV).
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
        .vt ul { margin-left: 17px; padding-left: 18px; border-left: 2px solid var(--color-line-strong); }
        .vt li { position: relative; }
        .vt ul > li::before { content: ''; position: absolute; left: -18px; top: 21px; width: 15px; border-top: 2px solid var(--color-line-strong); }
        /* tutup ekor garis vertikal di bawah anak terakhir (warna = latar kartu putih) */
        .vt ul > li:last-child::after { content: ''; position: absolute; left: -20px; top: 22px; bottom: 0; width: 2px; background: var(--color-surface); }
        /* cabang KOORDINASI: putus-putus cokelat tanah (koordinator → binaan, bukan garis SPV) */
        .vt ul.vt-coord { border-left: 2px dashed var(--color-infarm-soil); }
        .vt ul.vt-coord > li::before { border-top: 2px dashed var(--color-infarm-soil); }
        .vt-box { display: inline-flex; align-items: center; gap: 8px; border-radius: var(--radius-control); padding: 8px 12px; margin: 4px 0; max-width: 100%; transition: border-color .15s; }
        .vt-name { font-size: 13px; font-weight: 700; white-space: nowrap; }
        .vt-role { font-size: 10px; font-weight: 700; letter-spacing: .04em; padding: 1px 6px; border-radius: 999px; white-space: nowrap; }
        .vt-dept { font-size: 12px; white-space: nowrap; }
        .vt-g { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; white-space: nowrap; }
        .vt-count { font-size: 12px; font-weight: 700; margin-left: 1px; white-space: nowrap; }
      `}</style>
    </div>
  );
}
