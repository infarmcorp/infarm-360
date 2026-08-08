'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, Users, Search, ChevronDown, ChevronRight, Building2, Crown, Network, List } from 'lucide-react';
import { OrgChart, type OrgNode } from './org-chart';

export type Person = {
  id: string; empCode: string; name: string; dept: string; role: 'employee' | 'spv' | 'hrd' | 'direksi';
  active: boolean; isHrdAdmin: boolean; isCoordinator: boolean;
};
export type SpvNode = { spv: Person; members: Person[] };
export type CoordNode = { coord: Person; members: Person[] };
export type DeptStat = { dept: string; total: number; active: number };

const ROLE_LABEL: Record<Person['role'], string> = { employee: 'Pegawai', spv: 'Supervisor', hrd: 'HRD Admin', direksi: 'Direksi' };

/** Baris/kartu pegawai dengan badge peran & grant. Ringkas untuk pohon struktur. */
function PersonChip({ p, sub }: { p: Person; sub?: string }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${p.active ? '' : 'opacity-55'}`}>
      <span className="font-semibold text-ink text-sm">{p.name}</span>
      <span className="text-[10px] text-ink-faint data-value">{p.empCode}{sub ? ` · ${sub}` : ''}</span>
      {p.role !== 'employee' && (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{ROLE_LABEL[p.role]}</span>
      )}
      {p.isHrdAdmin && p.role !== 'hrd' && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-tint text-brand-ink" title="Izin HRD Admin"><ShieldCheck className="w-2.5 h-2.5" /> HRD</span>
      )}
      {p.isCoordinator && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-tint text-brand-ink" title="Koordinator"><Users className="w-2.5 h-2.5" /> Koordinator</span>
      )}
      {!p.active && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-danger-tint text-danger-ink">nonaktif</span>}
    </div>
  );
}

export function StrukturView({
  direksi, spvNodes, coordNodes, orphans, deptStats, stats, treeRoots,
}: {
  direksi: Person[]; spvNodes: SpvNode[]; coordNodes: CoordNode[]; orphans: Person[];
  deptStats: DeptStat[]; stats: { active: number; depts: number; spv: number; coord: number; hrd: number };
  treeRoots: OrgNode[];
}) {
  const [view, setView] = useState<'bagan' | 'daftar'>('bagan');
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const term = q.trim().toLowerCase();
  const match = (p: Person) => !term || `${p.name} ${p.empCode} ${p.dept}`.toLowerCase().includes(term);

  // Saat mencari: pertahankan node SPV/Koordinator bila pemimpinnya ATAU anggotanya cocok.
  const shownSpv = useMemo(
    () => spvNodes.filter((n) => match(n.spv) || n.members.some(match)).map((n) => ({ ...n, members: term ? n.members.filter(match) : n.members })),
    [spvNodes, term], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shownCoord = useMemo(
    () => coordNodes.filter((n) => match(n.coord) || n.members.some(match)).map((n) => ({ ...n, members: term ? n.members.filter(match) : n.members })),
    [coordNodes, term], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shownDireksi = direksi.filter(match);
  const shownOrphans = orphans.filter(match);

  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-5">
      {/* Ringkasan */}
      <div className="flex flex-wrap gap-2">
        <Stat label="Pegawai aktif" value={stats.active} />
        <Stat label="Divisi" value={stats.depts} />
        <Stat label="Supervisor" value={stats.spv} />
        <Stat label="Koordinator" value={stats.coord} />
        <Stat label="Izin HRD" value={stats.hrd} />
      </div>

      {/* Toggle Bagan / Daftar */}
      <div className="inline-flex rounded-control border border-line overflow-hidden text-xs font-semibold">
        <button type="button" onClick={() => setView('bagan')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${view === 'bagan' ? 'bg-brand text-white' : 'bg-surface text-ink-soft hover:bg-neutral-tint'}`}>
          <Network className="w-3.5 h-3.5" /> Bagan
        </button>
        <button type="button" onClick={() => setView('daftar')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${view === 'daftar' ? 'bg-brand text-white' : 'bg-surface text-ink-soft hover:bg-neutral-tint'}`}>
          <List className="w-3.5 h-3.5" /> Daftar
        </button>
      </div>

      {view === 'bagan' ? (
        <section>
          <p className="text-[11px] text-ink-faint mb-2 leading-relaxed">
            Bagan lini pelaporan (atasan → bawahan, pegawai aktif) — tersusun <strong>menurun</strong>: bawahan
            menjorok masuk di bawah atasannya. <strong>Klik kotak</strong> yang punya bawahan untuk melipat/membuka.
            Koordinasi lintas-jalur lihat tab <strong>Daftar</strong>.
          </p>
          {treeRoots.length === 0
            ? <p className="text-xs text-ink-faint italic">Belum ada lini pelaporan untuk ditampilkan.</p>
            : <OrgChart roots={treeRoots} />}
        </section>
      ) : (
      <>
      <div className="relative">
        <Search className="w-4 h-4 text-ink-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode / divisi…"
          className="w-full text-sm pl-8 pr-3 py-2 border border-line rounded-control bg-surface focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
      </div>

      {/* Direksi */}
      {shownDireksi.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink mb-2"><Crown className="w-4 h-4 text-warn-ink" /> Direksi</h2>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {shownDireksi.map((p) => <div key={p.id} className="border border-line rounded-control px-3 py-2"><PersonChip p={p} sub={p.dept} /></div>)}
          </div>
        </section>
      )}

      {/* Lini pelaporan: SPV → tim */}
      <section>
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink mb-2"><Building2 className="w-4 h-4 text-brand" /> Lini Pelaporan (Supervisor → Tim)</h2>
        {shownSpv.length === 0 ? <p className="text-xs text-ink-faint italic">Tak ada yang cocok.</p> : (
          <div className="space-y-2">
            {shownSpv.map(({ spv, members }) => {
              const isC = collapsed.has(spv.id);
              return (
                <div key={spv.id} className="border border-line rounded-panel overflow-hidden">
                  <button type="button" onClick={() => toggle(spv.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-brand-tint/60 hover:bg-brand-tint text-left">
                    {isC ? <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-faint shrink-0" />}
                    <div className="flex-1 min-w-0"><PersonChip p={spv} sub={spv.dept} /></div>
                    <span className="text-[10px] font-semibold text-brand-ink shrink-0"><span className="data-value">{members.length}</span> anggota</span>
                  </button>
                  {!isC && (
                    <div className="divide-y divide-line-soft">
                      {members.length === 0
                        ? <p className="text-xs text-ink-faint italic px-3 py-2 pl-9">Belum ada anggota tim.</p>
                        : members.map((m) => <div key={m.id} className="px-3 py-1.5 pl-9"><PersonChip p={m} sub={m.dept !== spv.dept ? m.dept : undefined} /></div>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Koordinasi (overlay) */}
      {shownCoord.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink mb-2"><Users className="w-4 h-4 text-brand" /> Koordinasi (pembinaan lintas-jalur)</h2>
          <p className="text-[11px] text-ink-faint mb-2">Koordinator membina beberapa pegawai (bisa beda atasan formal). Ini lapisan tambahan, bukan garis atasan.</p>
          <div className="space-y-2">
            {shownCoord.map(({ coord, members }) => (
              <div key={coord.id} className="border border-line rounded-panel overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-neutral-tint">
                  <div className="flex-1 min-w-0"><PersonChip p={coord} sub={coord.dept} /></div>
                  <span className="text-[10px] font-semibold text-brand-ink shrink-0"><span className="data-value">{members.length}</span> binaan</span>
                </div>
                <div className="divide-y divide-line-soft">
                  {members.map((m) => <div key={m.id} className="px-3 py-1.5 pl-6"><PersonChip p={m} sub={m.dept} /></div>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pegawai tanpa atasan (potensi pemetaan belum lengkap) */}
      {shownOrphans.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-warn-ink mb-1">⚠️ Pegawai tanpa atasan langsung ({shownOrphans.length})</h2>
          <p className="text-[11px] text-ink-faint mb-2">Aktif tapi belum terhubung ke Supervisor mana pun — periksa di Kelola Pegawai bila ini tak disengaja.</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {shownOrphans.map((p) => <div key={p.id} className="border border-warn-ink/25 bg-warn-tint/40 rounded-control px-3 py-2"><PersonChip p={p} sub={p.dept} /></div>)}
          </div>
        </section>
      )}

      {/* Ringkasan per divisi */}
      <section>
        <h2 className="text-sm font-bold text-ink mb-2">Ringkasan per Divisi</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[360px]">
            <thead><tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
              <th className="py-2 pr-3 font-semibold">Divisi</th><th className="py-2 px-3 text-center font-semibold">Aktif</th><th className="py-2 px-3 text-center font-semibold">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-line-soft">
              {deptStats.map((d) => (
                <tr key={d.dept}>
                  <td className="py-2 pr-3 font-semibold text-ink">{d.dept}</td>
                  <td className="py-2 px-3 text-center data-value text-brand-ink">{d.active}</td>
                  <td className="py-2 px-3 text-center data-value text-ink-faint">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line rounded-panel bg-surface px-3 py-2 text-center min-w-[84px]">
      <div className="text-lg font-bold data-value text-ink leading-none">{value}</div>
      <div className="text-[10px] text-ink-faint mt-1">{label}</div>
    </div>
  );
}
