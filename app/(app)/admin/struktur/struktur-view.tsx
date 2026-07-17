'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, ScanEye, Users, Search, ChevronDown, ChevronRight, Building2, Crown, Network, List } from 'lucide-react';
import { OrgChart, type OrgNode } from './org-chart';

export type Person = {
  id: string; empCode: string; name: string; dept: string; role: 'employee' | 'spv' | 'hrd' | 'direksi';
  active: boolean; isHrdAdmin: boolean; isCrossReviewer: boolean; isCoordinator: boolean;
};
export type SpvNode = { spv: Person; members: Person[] };
export type CoordNode = { coord: Person; members: Person[] };
export type DeptStat = { dept: string; total: number; active: number };

const ROLE_LABEL: Record<Person['role'], string> = { employee: 'Pegawai', spv: 'Supervisor', hrd: 'HRD Admin', direksi: 'Direksi' };

/** Baris/kartu pegawai dengan badge peran & grant. Ringkas untuk pohon struktur. */
function PersonChip({ p, sub }: { p: Person; sub?: string }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${p.active ? '' : 'opacity-55'}`}>
      <span className="font-semibold text-gray-800 text-sm">{p.name}</span>
      <span className="text-[10px] text-gray-500 font-mono">{p.empCode}{sub ? ` · ${sub}` : ''}</span>
      {p.role !== 'employee' && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{ROLE_LABEL[p.role]}</span>
      )}
      {p.isHrdAdmin && p.role !== 'hrd' && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700" title="Izin HRD Admin"><ShieldCheck className="w-2.5 h-2.5" /> HRD</span>
      )}
      {p.isCrossReviewer && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700" title="Peninjau Lintas Divisi"><ScanEye className="w-2.5 h-2.5" /> Peninjau</span>
      )}
      {p.isCoordinator && (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700" title="Koordinator"><Users className="w-2.5 h-2.5" /> Koordinator</span>
      )}
      {!p.active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">nonaktif</span>}
    </div>
  );
}

export function StrukturView({
  direksi, spvNodes, coordNodes, orphans, deptStats, stats, treeRoots,
}: {
  direksi: Person[]; spvNodes: SpvNode[]; coordNodes: CoordNode[]; orphans: Person[];
  deptStats: DeptStat[]; stats: { active: number; depts: number; spv: number; coord: number; hrd: number; reviewer: number };
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
        <Stat label="Peninjau" value={stats.reviewer} />
      </div>

      {/* Toggle Bagan / Daftar */}
      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold">
        <button type="button" onClick={() => setView('bagan')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${view === 'bagan' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          <Network className="w-3.5 h-3.5" /> Bagan
        </button>
        <button type="button" onClick={() => setView('daftar')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${view === 'daftar' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          <List className="w-3.5 h-3.5" /> Daftar
        </button>
      </div>

      {view === 'bagan' ? (
        <section>
          <p className="text-[11px] text-gray-500 mb-2">
            Bagan lini pelaporan (atasan → bawahan, pegawai aktif) — tersusun <strong>menurun</strong>: bawahan
            menjorok masuk di bawah atasannya. <strong>Klik kotak</strong> yang punya bawahan untuk melipat/membuka.
            Koordinasi lintas-jalur lihat tab <strong>Daftar</strong>.
          </p>
          {treeRoots.length === 0
            ? <p className="text-xs text-gray-500 italic">Belum ada lini pelaporan untuk ditampilkan.</p>
            : <OrgChart roots={treeRoots} />}
        </section>
      ) : (
      <>
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode / divisi…"
          className="w-full text-sm pl-8 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600" />
      </div>

      {/* Direksi */}
      {shownDireksi.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2"><Crown className="w-4 h-4 text-amber-500" /> Direksi</h2>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {shownDireksi.map((p) => <div key={p.id} className="border border-gray-200 rounded-lg px-3 py-2"><PersonChip p={p} sub={p.dept} /></div>)}
          </div>
        </section>
      )}

      {/* Lini pelaporan: SPV → tim */}
      <section>
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2"><Building2 className="w-4 h-4 text-emerald-600" /> Lini Pelaporan (Supervisor → Tim)</h2>
        {shownSpv.length === 0 ? <p className="text-xs text-gray-500 italic">Tak ada yang cocok.</p> : (
          <div className="space-y-2">
            {shownSpv.map(({ spv, members }) => {
              const isC = collapsed.has(spv.id);
              return (
                <div key={spv.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => toggle(spv.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-emerald-50/60 hover:bg-emerald-50 text-left">
                    {isC ? <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                    <div className="flex-1 min-w-0"><PersonChip p={spv} sub={spv.dept} /></div>
                    <span className="text-[10px] font-bold text-emerald-700 shrink-0">{members.length} anggota</span>
                  </button>
                  {!isC && (
                    <div className="divide-y divide-gray-100">
                      {members.length === 0
                        ? <p className="text-xs text-gray-400 italic px-3 py-2 pl-9">Belum ada anggota tim.</p>
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
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2"><Users className="w-4 h-4 text-teal-600" /> Koordinasi (pembinaan lintas-jalur)</h2>
          <p className="text-[11px] text-gray-500 mb-2">Koordinator membina beberapa pegawai (bisa beda atasan formal). Ini lapisan tambahan, bukan garis atasan.</p>
          <div className="space-y-2">
            {shownCoord.map(({ coord, members }) => (
              <div key={coord.id} className="border border-teal-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-teal-50/60">
                  <div className="flex-1 min-w-0"><PersonChip p={coord} sub={coord.dept} /></div>
                  <span className="text-[10px] font-bold text-teal-700 shrink-0">{members.length} binaan</span>
                </div>
                <div className="divide-y divide-gray-100">
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
          <h2 className="text-sm font-bold text-amber-700 mb-1">⚠️ Pegawai tanpa atasan langsung ({shownOrphans.length})</h2>
          <p className="text-[11px] text-gray-500 mb-2">Aktif tapi belum terhubung ke Supervisor mana pun — periksa di Kelola Pegawai bila ini tak disengaja.</p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {shownOrphans.map((p) => <div key={p.id} className="border border-amber-200 bg-amber-50/40 rounded-lg px-3 py-2"><PersonChip p={p} sub={p.dept} /></div>)}
          </div>
        </section>
      )}

      {/* Ringkasan per divisi */}
      <section>
        <h2 className="text-sm font-bold text-gray-700 mb-2">Ringkasan per Divisi</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[360px]">
            <thead><tr className="text-[11px] uppercase text-gray-400 border-b border-gray-200">
              <th className="py-2 pr-3">Divisi</th><th className="py-2 px-3 text-center">Aktif</th><th className="py-2 px-3 text-center">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {deptStats.map((d) => (
                <tr key={d.dept}>
                  <td className="py-2 pr-3 font-semibold text-gray-800">{d.dept}</td>
                  <td className="py-2 px-3 text-center font-mono text-emerald-700">{d.active}</td>
                  <td className="py-2 px-3 text-center font-mono text-gray-500">{d.total}</td>
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
    <div className="border border-gray-200 rounded-xl px-3 py-2 text-center min-w-[84px]">
      <div className="text-lg font-black text-gray-800 leading-none">{value}</div>
      <div className="text-[10px] text-gray-500 mt-1">{label}</div>
    </div>
  );
}
