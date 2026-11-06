'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, Users, Search, ChevronDown, ChevronRight, Building2, Crown, Network, List, UserCheck, AlertTriangle, LayoutGrid } from 'lucide-react';
import { OrgChart, type OrgNode } from './org-chart';
import { CARD, CardTitle, Note, StatCards, FIELD, TABLE_HEAD } from '@/components/infarm-ui';
import { TabBar, TabButton, TabPanel } from '@/components/tab-nav';

export type Person = {
  id: string; empCode: string; name: string; dept: string; role: 'employee' | 'spv' | 'hrd' | 'direksi';
  active: boolean; isHrdAdmin: boolean; isCoordinator: boolean;
};
export type SpvNode = { spv: Person; members: Person[] };
export type CoordNode = { coord: Person; members: Person[] };
export type DeptStat = { dept: string; total: number; active: number };

const ROLE_LABEL: Record<Person['role'], string> = { employee: 'Pegawai', spv: 'Supervisor', hrd: 'HRD Admin', direksi: 'Direksi' };
const CHIP = 'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full';

/** Baris/kartu pegawai dengan badge peran & grant. Ringkas untuk pohon struktur. */
function PersonChip({ p, sub }: { p: Person; sub?: string }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${p.active ? '' : 'opacity-55'}`}>
      <span className="font-semibold text-ink text-[13px]">{p.name}</span>
      <span className="text-xs text-ink-soft"><span className="font-mono">{p.empCode}</span>{sub ? ` · ${sub}` : ''}</span>
      {p.role !== 'employee' && (
        <span className={`${CHIP} bg-neutral-tint text-ink-soft`}>{ROLE_LABEL[p.role]}</span>
      )}
      {p.isHrdAdmin && p.role !== 'hrd' && (
        <span className={`${CHIP} bg-brand-tint text-brand-ink`} title="Izin HRD Admin"><ShieldCheck className="w-3 h-3" /> HRD</span>
      )}
      {p.isCoordinator && (
        <span className={`${CHIP} bg-infarm-cream text-infarm-soil`} title="Koordinator"><Users className="w-3 h-3" /> Koordinator</span>
      )}
      {!p.active && <span className={`${CHIP} bg-danger-tint text-danger-ink`}>nonaktif</span>}
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

  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-5">
      {/* Ringkasan — kartu metrik terpisah; hanya Pegawai aktif yang menonjol. */}
      <StatCards
        lead={{ icon: Users, value: String(stats.active), label: 'Pegawai aktif' }}
        items={[
          { icon: Building2, value: String(stats.depts), label: 'Divisi' },
          { icon: UserCheck, value: String(stats.spv), label: 'Supervisor' },
          { icon: Users, tone: 'soil', value: String(stats.coord), label: 'Koordinator' },
          { icon: ShieldCheck, value: String(stats.hrd), label: 'Izin HRD' },
        ]} />

      <div>
      <TabBar>
        <TabButton active={view === 'bagan'} onClick={() => setView('bagan')} icon={Network}>Bagan</TabButton>
        <TabButton active={view === 'daftar'} onClick={() => setView('daftar')} icon={List}>Daftar</TabButton>
      </TabBar>
      <TabPanel className="space-y-5">

      {view === 'bagan' ? (
        <section className={CARD}>
          <CardTitle icon={Network} className="mb-3">Bagan Lini Pelaporan</CardTitle>
          <div className="mb-4">
            <Note>
              Bagan lini pelaporan (atasan → bawahan, pegawai aktif) — tersusun <strong>menurun</strong>: bawahan
              menjorok masuk di bawah atasannya. <strong>Klik kotak</strong> yang punya bawahan untuk melipat/membuka.
              Koordinasi lintas-jalur lihat tab <strong>Daftar</strong>.
            </Note>
          </div>
          {treeRoots.length === 0
            ? <p className="text-[13px] text-ink-soft italic">Belum ada lini pelaporan untuk ditampilkan.</p>
            : <OrgChart roots={treeRoots} />}
        </section>
      ) : (
      <>
      <div className="relative">
        <Search className="w-4 h-4 text-ink-soft absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode / divisi…"
          className={`${FIELD} w-full pl-9 bg-surface`} />
      </div>

      {/* Direksi */}
      {shownDireksi.length > 0 && (
        <section className={CARD}>
          <CardTitle icon={Crown} className="mb-3">Direksi</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shownDireksi.map((p) => <div key={p.id} className="border border-line rounded-control px-3 py-2.5"><PersonChip p={p} sub={p.dept} /></div>)}
          </div>
        </section>
      )}

      {/* Lini pelaporan: SPV → tim */}
      <section className={CARD}>
        <CardTitle icon={Building2} className="mb-3">Lini Pelaporan (Supervisor → Tim)</CardTitle>
        {shownSpv.length === 0 ? <p className="text-[13px] text-ink-soft italic">Tak ada yang cocok.</p> : (
          <div className="space-y-2">
            {shownSpv.map(({ spv, members }) => {
              const isC = collapsed.has(spv.id);
              return (
                <div key={spv.id} className="border border-line rounded-control overflow-hidden">
                  <button type="button" onClick={() => toggle(spv.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-brand-tint/60 hover:bg-brand-tint text-left">
                    {isC ? <ChevronRight className="w-4 h-4 text-ink-soft shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-soft shrink-0" />}
                    <div className="flex-1 min-w-0"><PersonChip p={spv} sub={spv.dept} /></div>
                    <span className="text-xs font-semibold text-brand-ink shrink-0"><span className="font-mono">{members.length}</span> anggota</span>
                  </button>
                  {!isC && (
                    <div className="divide-y divide-line-soft">
                      {members.length === 0
                        ? <p className="text-xs text-ink-soft italic px-3 py-2 pl-9">Belum ada anggota tim.</p>
                        : members.map((m) => <div key={m.id} className="px-3 py-2 pl-9"><PersonChip p={m} sub={m.dept !== spv.dept ? m.dept : undefined} /></div>)}
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
        <section className={CARD}>
          <CardTitle icon={Users} className="mb-3">Koordinasi (pembinaan lintas-jalur)</CardTitle>
          <div className="mb-3">
            <Note>Koordinator membina beberapa pegawai (bisa beda atasan formal). Ini lapisan tambahan, bukan garis atasan.</Note>
          </div>
          <div className="space-y-2">
            {shownCoord.map(({ coord, members }) => (
              <div key={coord.id} className="border border-line rounded-control overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-infarm-cream/60">
                  <div className="flex-1 min-w-0"><PersonChip p={coord} sub={coord.dept} /></div>
                  <span className="text-xs font-semibold text-infarm-soil shrink-0"><span className="font-mono">{members.length}</span> binaan</span>
                </div>
                <div className="divide-y divide-line-soft">
                  {members.map((m) => <div key={m.id} className="px-3 py-2 pl-6"><PersonChip p={m} sub={m.dept} /></div>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pegawai tanpa atasan (potensi pemetaan belum lengkap) */}
      {shownOrphans.length > 0 && (
        <section className={CARD}>
          <CardTitle icon={AlertTriangle} className="mb-3">Pegawai tanpa atasan langsung (<span className="font-mono">{shownOrphans.length}</span>)</CardTitle>
          <div className="mb-3">
            <Note tone="warn">Aktif tapi belum terhubung ke Supervisor mana pun — periksa di Kelola Pegawai bila ini tak disengaja.</Note>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shownOrphans.map((p) => <div key={p.id} className="border border-warn-tint bg-warn-tint/40 rounded-control px-3 py-2.5"><PersonChip p={p} sub={p.dept} /></div>)}
          </div>
        </section>
      )}

      {/* Ringkasan per divisi */}
      <section className={CARD}>
        <CardTitle icon={LayoutGrid} className="mb-3">Ringkasan per Divisi</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] min-w-[360px]">
            <thead><tr className={TABLE_HEAD}>
              <th className="py-2.5 px-3 rounded-l-lg">Divisi</th><th className="py-2.5 px-3 text-center">Aktif</th><th className="py-2.5 px-3 text-center rounded-r-lg">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-line-soft">
              {deptStats.map((d) => (
                <tr key={d.dept}>
                  <td className="py-3 px-3 font-semibold text-ink">{d.dept}</td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-brand">{d.active}</td>
                  <td className="py-3 px-3 text-center font-mono text-ink-soft">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </>
      )}
      </TabPanel>
      </div>
    </div>
  );
}
