'use client';

import { useMemo, useState, useTransition } from 'react';
import { ShieldCheck, Users, ListChecks, SlidersHorizontal, X, UserPlus, ScrollText, FileStack } from 'lucide-react';
import { setPageGrant, setPageGrantForRole, removePageGrant, removePageGrantForAll, removeAllPageGrantsForEmployee, markAccessReviewed } from './actions';
import { setHrdAdmin, setCoordinator, setCoordinatorTeam, setHrdSections } from '../pegawai/actions';
import { isHrdDept, HRD_SECTIONS, HRD_SECTION_LABELS, GRANT_ROLE_TARGETS, GRANT_ROLE_TARGET_LABELS, type HrdSection, type GrantRoleTarget } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/searchable-select';
import { usePager, Pager, MultiCheckFilter } from '@/components/table-controls';
import { AksesLog, type AksesLogRow } from './akses-log';

export type AksesEmployee = {
  id: string;
  name: string;
  dept: string;
  role: string;
  isExternal: boolean;
  isHrdAdmin: boolean;
  isCoordinator: boolean;
  hrdSections: string[] | null;
  joinedOn: string | null;           // tgl masuk (untuk "Pegawai Baru")
  accessReviewedAt: string | null;   // penanda HRD sudah meninjau akses pegawai baru (null = belum)
  grants: Record<string, { scopes: string[]; canEdit: boolean; canFinalize: boolean }>; // section → { lingkup, meringkas, finalisasi }
};
type PageOpt = { key: string; label: string; kind: string }; // kind: 'pemantauan' | 'administrator'
type ScopeOpt = { key: string; label: string };

const ROLE_LABEL: Record<string, string> = { employee: 'Pegawai', spv: 'SPV', hrd: 'HRD', direksi: 'Direksi' };
const NEW_WINDOW_DAYS = 30; // jendela "Pegawai Baru": joined_on ≤ N hari & belum ditinjau

/** Tab utama: SATU alur "Kelola Akses" (penerima-dulu) + Log aktivitas terpisah. */
type MainTab = 'kelola' | 'log';
/** Sumbu penerima di Langkah 1: seorang pegawai · sebuah peran · sebuah halaman (untuk cabut-massal). */
type Recipient = 'employee' | 'role' | 'page';

/**
 * Klasifikasi peran seorang pemegang untuk FILTER daftar pemegang (mode Halaman). Bisa lebih dari
 * satu — koordinator juga berposisi employee → muncul di 'koordinator' DAN 'pegawai' (selaras
 * roleMemberRows agar cakupan "se-peran" konsisten).
 */
function holderRoleTags(e: AksesEmployee): string[] {
  const t: string[] = [];
  if (e.role === 'spv') t.push('spv');
  else if (e.role === 'direksi') t.push('direksi');
  else if (e.role === 'employee') t.push('pegawai');
  if (e.isCoordinator) t.push('koordinator');
  return t;
}

/** Akses BAWAAN peran (read-only, tak bisa dicabut lewat halaman ini) — untuk lapis info di profil. */
function inheritedAccess(e: AksesEmployee): string[] {
  const out: string[] = [];
  if (e.role === 'hrd' || e.isHrdAdmin) out.push('Menu Administrator HRD (sesuai “Atur Akses”).');
  if (e.role === 'spv') out.push('Input KPI, Laporan Kinerja Tim, & Monitor Kinerja — untuk anggota timnya.');
  if (e.isCoordinator) out.push('Input KPI & Laporan Kinerja Tim — untuk tim naungannya (Koordinator).');
  if (e.role === 'direksi') out.push('Dashboard eksekutif, ACC promosi/suksesi, & Review Hasil Akhir (agregat).');
  out.push('Mengisi 360° Feedback & melihat Laporan Hasil miliknya sendiri.');
  return out;
}

/**
 * Konsol Manajemen Akses — SATU alur "penerima-dulu": (1) pilih SIAPA (pegawai / peran / halaman),
 * (2) lihat profil aksesnya dalam satu layar (bawaan peran · akses halaman · kapabilitas), (3) beri/
 * ubah/cabut di tempat. Menyatukan bekas dua "pintu" (Tambah akses baru + Izin Peran) & tab Mencabut.
 * Log aktivitas tetap tab terpisah. Perubahan optimistis di state lokal + pesan status per baris.
 */
export function AksesClient({
  employees, pages, scopes, coordTeams: initialTeams, meId, initialTab = 'kelola', logRows, logPage, logPageSize, logTotal,
}: {
  employees: AksesEmployee[]; pages: PageOpt[]; scopes: ScopeOpt[]; coordTeams: Record<string, string[]>; meId: string;
  initialTab?: string; logRows: AksesLogRow[]; logPage: number; logPageSize: number; logTotal: number;
}) {
  const [rows, setRows] = useState(employees);
  const [teams, setTeams] = useState<Record<string, string[]>>(initialTeams);
  const [mainTab, setMainTab] = useState<MainTab>(initialTab === 'log' ? 'log' : 'kelola');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [coordDlg, setCoordDlg] = useState<{ r: AksesEmployee; selected: Set<string>; q: string } | null>(null);
  const [sectionsDlg, setSectionsDlg] = useState<{ r: AksesEmployee; full: boolean; selected: Set<string> } | null>(null);

  // ── Langkah 1: penerima ──
  const [recipient, setRecipient] = useState<Recipient>('employee');
  const [selEmp, setSelEmp] = useState('');           // pegawai terpilih
  const [selRole, setSelRole] = useState<string>(GRANT_ROLE_TARGETS[0]); // peran terpilih
  const [selPage, setSelPage] = useState('');         // halaman terpilih (sumbu Halaman)
  const [addPageSel, setAddPageSel] = useState('');   // halaman yg dipilih untuk DIBERIKAN (mode pegawai/peran)

  // ── Panel Lingkup & Izin (dipakai saat memberi/ubah satu grant) ──
  const [panel, setPanel] = useState<{ empId: string; section: string; scopes: string[]; canEdit: boolean; canFinalize: boolean; roleTarget?: string | null } | null>(null);
  const [panelMsg, setPanelMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{ roleTarget: string; section: string; scopes: string[]; canEdit: boolean; canFinalize: boolean; count: number } | null>(null);
  const [bulkRevoke, setBulkRevoke] = useState<
    | { kind: 'page'; section: string; count: number }
    | { kind: 'employee'; empId: string; name: string; count: number }
    | null
  >(null);

  const pageLabelByKey = useMemo(() => Object.fromEntries(pages.map((p) => [p.key, p.label])), [pages]);
  const scopeLabelByKey = useMemo(() => Object.fromEntries(scopes.map((s) => [s.key, s.label])), [scopes]);
  const empOptions = useMemo(() => rows.map((r) => ({ value: r.id, label: `${r.name} — ${r.dept}` })), [rows]);
  const grantedSections = (e: AksesEmployee) => Object.keys(e.grants).filter((k) => e.grants[k].scopes.length > 0);

  const selEmpObj = useMemo(() => rows.find((r) => r.id === selEmp) ?? null, [rows, selEmp]);

  /** Jalankan aksi server + tampilkan status pada baris; patch state lokal bila sukses. */
  function run(id: string, fn: () => Promise<{ ok: boolean; msg?: string; error?: string }>, patch?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { patch?.(); setMsg({ id, text: res.msg ?? 'Tersimpan.', ok: true }); }
      else setMsg({ id, text: res.error ?? 'Gagal.', ok: false });
    });
  }
  const patchRow = (id: string, upd: Partial<AksesEmployee>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...upd } : r)));

  // ── Grant halaman ber-lingkup + izin 3-tingkat ──
  function changeGrant(emp: AksesEmployee, section: string, scps: string[], canEdit: boolean, canFinalize: boolean) {
    run(emp.id, () => (scps.length ? setPageGrant(emp.id, section, scps, canEdit, canFinalize) : removePageGrant(emp.id, section)), () => {
      const grants = { ...emp.grants };
      if (scps.length) grants[section] = { scopes: scps, canEdit, canFinalize: canEdit && canFinalize }; else delete grants[section];
      patchRow(emp.id, { grants });
    });
  }
  /** Putar izin (Lihat → Meringkas → Finalisasi → Lihat), lingkup tetap. Halaman administrator saja. */
  function cycleIzin(emp: AksesEmployee, section: string) {
    const g = emp.grants[section];
    if (!g) return;
    const [nextEdit, nextFin] = !g.canEdit ? [true, false] : !g.canFinalize ? [true, true] : [false, false];
    changeGrant(emp, section, g.scopes, nextEdit, nextFin);
  }
  /** Cabut satu grant halaman (reversibel → tanpa konfirmasi). */
  function revokeGrant(emp: AksesEmployee, section: string) {
    run(emp.id, () => removePageGrant(emp.id, section), () => {
      const grants = { ...emp.grants }; delete grants[section];
      patchRow(emp.id, { grants });
      setPanel((p) => (p && p.empId === emp.id && p.section === section ? null : p));
    });
  }
  /** Cabut satu halaman dari SEMUA pemegang (mode Halaman). */
  function doRevokePageAll(section: string) {
    setBulkRevoke(null);
    startTransition(async () => {
      const res = await removePageGrantForAll(section);
      if (res.ok) {
        setRows((prev) => prev.map((r) => {
          if (!r.grants[section]) return r;
          const grants = { ...r.grants }; delete grants[section]; return { ...r, grants };
        }));
        setMsg({ id: `page:${section}`, text: res.msg ?? 'Akses dicabut.', ok: true });
        setPanel((p) => (p && p.section === section ? null : p));
      } else setMsg({ id: `page:${section}`, text: res.error ?? 'Gagal.', ok: false });
    });
  }
  /** Cabut SEMUA akses halaman milik satu pegawai. */
  function doRevokeEmployeeAll(empId: string) {
    setBulkRevoke(null);
    run(empId, () => removeAllPageGrantsForEmployee(empId), () => patchRow(empId, { grants: {} }));
    setPanel((p) => (p && p.empId === empId ? null : p));
  }

  // ── Panel: buka untuk pegawai / peran ──
  function openPanel(empId: string, section: string) {
    const emp = rows.find((r) => r.id === empId);
    if (!emp || !section) return;
    const g = emp.grants[section];
    setPanel({ empId, section, scopes: g?.scopes ?? [], canEdit: !!g?.canEdit, canFinalize: !!g?.canFinalize, roleTarget: null });
    setPanelMsg(null);
  }
  function openRolePanel(roleTarget: string, section: string) {
    if (!section) return;
    setPanel({ empId: '', section, scopes: [], canEdit: false, canFinalize: false, roleTarget });
    setPanelMsg(null);
  }
  function roleMemberRows(roleTarget: string) {
    return rows.filter((r) => !r.isExternal && (
      roleTarget === 'koordinator' ? r.isCoordinator :
      roleTarget === 'pegawai' ? r.role === 'employee' :
      roleTarget === 'spv' ? r.role === 'spv' :
      roleTarget === 'direksi' ? r.role === 'direksi' : false));
  }
  function doRoleSave(roleTarget: string, section: string, scps: string[], canEdit: boolean, canFinalize: boolean) {
    setRoleConfirm(null);
    startTransition(async () => {
      const res = await setPageGrantForRole(roleTarget, section, scps, canEdit, canFinalize);
      if (res.ok) {
        const memberIds = new Set(roleMemberRows(roleTarget).map((r) => r.id));
        setRows((prev) => prev.map((r) => (memberIds.has(r.id) ? { ...r, grants: { ...r.grants, [section]: { scopes: scps, canEdit, canFinalize: canEdit && canFinalize } } } : r)));
        setPanelMsg({ ok: true, text: res.msg ?? 'Akses massal tersimpan.' });
        setPanel(null);
      } else setPanelMsg({ ok: false, text: res.error ?? 'Gagal menyimpan.' });
    });
  }
  function togglePanelScope(key: string) {
    setPanel((p) => {
      if (!p) return p;
      if (p.scopes.includes(key)) return { ...p, scopes: p.scopes.filter((s) => s !== key) };
      if (key === 'all') return { ...p, scopes: ['all'] };
      return { ...p, scopes: [...p.scopes.filter((s) => s !== 'all'), key] };
    });
  }
  function savePanel() {
    if (!panel) return;
    const scps = panel.scopes;
    if (!scps.length) { setPanelMsg({ ok: false, text: 'Pilih minimal satu lingkup data.' }); return; }
    const section = panel.section;
    const kind = pages.find((p) => p.key === section)?.kind;
    const canEdit = kind === 'administrator' ? panel.canEdit : false;
    const canFinalize = kind === 'administrator' ? (panel.canEdit && panel.canFinalize) : false;
    if (panel.roleTarget) {
      const rt = panel.roleTarget;
      const count = roleMemberRows(rt).length;
      if (count === 0) { setPanelMsg({ ok: false, text: `Tak ada anggota ${GRANT_ROLE_TARGET_LABELS[rt as GrantRoleTarget]} saat ini.` }); return; }
      if (canFinalize) { setRoleConfirm({ roleTarget: rt, section, scopes: scps, canEdit, canFinalize, count }); return; }
      doRoleSave(rt, section, scps, canEdit, canFinalize);
      return;
    }
    const emp = rows.find((r) => r.id === panel.empId);
    if (!emp) return;
    startTransition(async () => {
      const res = await setPageGrant(emp.id, section, scps, canEdit, canFinalize);
      if (res.ok) {
        patchRow(emp.id, { grants: { ...emp.grants, [section]: { scopes: scps, canEdit, canFinalize } } });
        setPanelMsg({ ok: true, text: res.msg ?? 'Akses tersimpan.' });
        setPanel(null);
      } else setPanelMsg({ ok: false, text: res.error ?? 'Gagal menyimpan.' });
    });
  }

  // ── Kapabilitas peran ──
  const toggleHrd = (r: AksesEmployee) => run(r.id, () => setHrdAdmin(r.id, !r.isHrdAdmin), () => patchRow(r.id, { isHrdAdmin: !r.isHrdAdmin, ...(r.isHrdAdmin ? { hrdSections: null } : {}) }));
  const toggleCoord = (r: AksesEmployee) => run(r.id, () => setCoordinator(r.id, !r.isCoordinator), () => {
    const next = !r.isCoordinator;
    patchRow(r.id, { isCoordinator: next });
    if (!next) setTeams((t) => { const c = { ...t }; delete c[r.id]; return c; });
  });
  function submitCoord() {
    if (!coordDlg) return;
    const { r, selected } = coordDlg;
    setCoordDlg(null);
    run(r.id, () => setCoordinatorTeam(r.id, [...selected]), () => setTeams((t) => ({ ...t, [r.id]: [...selected] })));
  }
  function submitSections() {
    if (!sectionsDlg) return;
    const { r, full, selected } = sectionsDlg;
    const payload = full || selected.size === 0 ? null : [...selected];
    setSectionsDlg(null);
    run(r.id, () => setHrdSections(r.id, payload), () => patchRow(r.id, { hrdSections: payload }));
  }

  // ── Pegawai Baru: joined_on dalam jendela & belum ditinjau. ──
  const newEmployees = useMemo(() => {
    const cutoff = new Date(Date.now() - NEW_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    return rows.filter((r) => !r.isExternal && r.accessReviewedAt == null && r.joinedOn != null && r.joinedOn >= cutoff);
  }, [rows]);
  function markReviewed(r: AksesEmployee) {
    run(r.id, () => markAccessReviewed(r.id), () => patchRow(r.id, { accessReviewedAt: new Date().toISOString() }));
  }
  /** Pilih pegawai ini di Langkah 1 (dari kartu Pegawai Baru). */
  function pickEmployee(id: string) {
    setRecipient('employee'); setSelEmp(id); setPanel(null); setPanelMsg(null); setAddPageSel('');
  }

  // ── Mode Halaman: pemegang halaman terpilih + filter (peran/divisi) + cakupan per-peran. ──
  const [holderRoleSel, setHolderRoleSel] = useState<Set<string>>(new Set()); // kosong = semua peran
  const [holderDeptSel, setHolderDeptSel] = useState<Set<string>>(new Set()); // kosong = semua divisi
  const holders = useMemo(
    () => (recipient === 'page' && selPage ? rows.filter((e) => (e.grants[selPage]?.scopes.length ?? 0) > 0) : []),
    [rows, recipient, selPage],
  );
  const holderDepts = useMemo(() => [...new Set(holders.map((h) => h.dept))].sort(), [holders]);
  const filteredHolders = useMemo(() => holders.filter((h) =>
    (holderDeptSel.size === 0 || holderDeptSel.has(h.dept)) &&
    (holderRoleSel.size === 0 || holderRoleTags(h).some((t) => holderRoleSel.has(t))),
  ), [holders, holderRoleSel, holderDeptSel]);
  const holdersPager = usePager(filteredHolders);
  // Cakupan per-peran: berapa anggota tiap peran yang MEMEGANG halaman ini → chip "se-peran"
  // (hijau bila SELURUH anggota peran memegangnya). Klik chip = saring daftar ke peran itu.
  const roleCoverage = useMemo(() => {
    if (recipient !== 'page' || !selPage) return [];
    return GRANT_ROLE_TARGETS.map((rt) => {
      const members = roleMemberRows(rt);
      const held = members.filter((m) => (m.grants[selPage]?.scopes.length ?? 0) > 0).length;
      return { rt, total: members.length, held };
    }).filter((c) => c.total > 0 && c.held > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, recipient, selPage]);

  const panelPage = panel ? pages.find((p) => p.key === panel.section) ?? null : null;
  const panelEmp = panel && panel.empId ? rows.find((r) => r.id === panel.empId) ?? null : null;
  const showTeamScope = panel?.roleTarget === 'koordinator' || (!!panelEmp && panelEmp.isCoordinator);
  const visibleScopes = scopes.filter((s) => s.key !== 'coordinator_team' || showTeamScope);

  const btn = (active: boolean, tone: string) =>
    `inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-control border disabled:opacity-60 ${active ? tone : 'text-ink-soft border-line hover:border-line-strong'}`;
  const izinBadge = (g: { canEdit: boolean; canFinalize: boolean }) =>
    g.canFinalize ? { t: '✎ finalisasi', c: 'bg-warn-tint text-warn-ink border-warn-ink/30' }
    : g.canEdit ? { t: '✎ meringkas', c: 'bg-brand-tint text-brand-ink border-brand/25' }
    : { t: '👁 lihat', c: 'bg-surface text-ink-soft border-line' };

  /** Kartu Lingkup & Izin (dipakai mode pegawai & peran). */
  function PanelCard() {
    if (!panel || !panelPage) return null;
    return (
      <div className="mt-3 rounded-panel border border-brand/30 bg-brand-tint/40 p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h4 className="text-sm font-bold text-ink">Atur: {panelPage.label}</h4>
            {panel.roleTarget
              ? <p className="text-[11px] text-brand-ink font-semibold">Semua {GRANT_ROLE_TARGET_LABELS[panel.roleTarget as GrantRoleTarget]} · {roleMemberRows(panel.roleTarget).length} orang</p>
              : <p className="text-[11px] text-ink-faint">{panelEmp?.name} · {panelEmp?.dept}</p>}
          </div>
          <button type="button" onClick={() => { setPanel(null); setPanelMsg(null); }} className="text-[11px] text-ink-faint hover:text-ink-soft">Tutup</button>
        </div>

        {/* Lingkup data (MULTI). "Semua pegawai" menyerap → mematikan lingkup lain. */}
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-ink-soft mb-1.5">Lingkup data <span className="font-normal text-ink-faint">(boleh lebih dari satu)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {visibleScopes.map((s) => {
              const checked = panel.scopes.includes(s.key);
              const disabled = pending || (s.key !== 'all' && panel.scopes.includes('all'));
              return (
                <label key={s.key} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => togglePanelScope(s.key)} className="accent-brand" />
                  <span className="text-ink">{s.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Izin 3-tingkat (halaman administrator saja). */}
        <div className="mb-3">
          <p className="text-[11px] font-semibold text-ink-soft mb-1.5">Izin</p>
          {panelPage.kind === 'administrator' ? (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="panel-izin" checked={!panel.canEdit} disabled={pending}
                  onChange={() => setPanel((p) => (p ? { ...p, canEdit: false, canFinalize: false } : p))} className="accent-ink-faint" />
                <span className="text-ink">Lihat saja</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="panel-izin" checked={panel.canEdit && !panel.canFinalize} disabled={pending}
                  onChange={() => setPanel((p) => (p ? { ...p, canEdit: true, canFinalize: false } : p))} className="accent-brand" />
                <span className="text-ink">Boleh meringkas <span className="text-[10px] text-ink-faint">(tulis Ringkasan Aspek, tanpa finalisasi)</span></span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="panel-izin" checked={panel.canEdit && panel.canFinalize} disabled={pending}
                  onChange={() => setPanel((p) => (p ? { ...p, canEdit: true, canFinalize: true } : p))} className="accent-warn-ink" />
                <span className="text-ink">Boleh finalisasi <span className="text-[10px] text-ink-faint">(termasuk finalisasi &amp; rilis)</span></span>
              </label>
            </div>
          ) : (
            <p className="text-[11px] text-ink-faint italic">Halaman pemantauan selalu <strong>lihat-saja</strong>.</p>
          )}
        </div>

        {panelMsg && <p className={`text-[11px] mb-2 ${panelMsg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{panelMsg.text}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={savePanel} disabled={pending}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-control bg-brand text-white hover:bg-brand-ink disabled:opacity-50">Simpan akses</button>
          {!panel.roleTarget && panelEmp?.grants[panel.section] && (
            <button type="button" onClick={() => revokeGrant(panelEmp, panel.section)} disabled={pending}
              className="text-[11px] font-semibold px-3 py-2 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50">Cabut akses</button>
          )}
        </div>
      </div>
    );
  }

  const RECIPIENTS: { key: Recipient; label: string; icon: React.ElementType }[] = [
    { key: 'employee', label: 'Seorang pegawai', icon: UserPlus },
    { key: 'role', label: 'Sebuah peran', icon: Users },
    { key: 'page', label: 'Sebuah halaman', icon: FileStack },
  ];

  return (
    <div className="mt-4">
      {/* Tab utama: Kelola Akses | Log aktivitas */}
      <div className="flex border-b border-line gap-1.5 overflow-x-auto scrollbar-none mb-5">
        {([['kelola', 'Kelola Akses', SlidersHorizontal], ['log', 'Log aktivitas', ScrollText]] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setMainTab(key)}
            className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-colors shrink-0 ${
              mainTab === key ? 'border-brand text-ink' : 'border-transparent text-ink-faint hover:text-ink'}`}>
            <Icon className={`w-4 h-4 ${mainTab === key ? 'text-brand' : 'text-ink-faint'}`} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {mainTab === 'log' && <AksesLog rows={logRows} page={logPage} pageSize={logPageSize} total={logTotal} />}

      {mainTab === 'kelola' && (<>
        {/* Pegawai Baru: pintasan meninjau akses pegawai yang baru masuk. */}
        {newEmployees.length > 0 && (
          <div className="mb-5 rounded-panel border border-warn-ink/25 bg-warn-tint/50 p-4">
            <h3 className="text-sm font-bold text-warn-ink mb-0.5">Pegawai Baru <span className="font-normal opacity-80">({newEmployees.length})</span></h3>
            <p className="text-[11.5px] text-warn-ink/90 mb-3 max-w-3xl leading-relaxed">
              Bergabung ≤ {NEW_WINDOW_DAYS} hari &amp; belum ditinjau. Akses <strong>bawaan peran</strong> sudah aktif — mereka
              <strong> tidak</strong> otomatis mendapat akses tambahan. Klik <span className="font-semibold">Tinjau</span> untuk membuka profilnya, lalu <span className="font-semibold">Tandai selesai</span>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {newEmployees.map((r) => {
                const gc = grantedSections(r).length;
                return (
                  <div key={r.id} className="rounded-control border border-line bg-surface p-3">
                    <div className="font-semibold text-ink text-sm">{r.name}</div>
                    <div className="text-[11px] text-ink-faint">{r.dept} · {ROLE_LABEL[r.role] ?? r.role} · masuk <span className="data-value">{r.joinedOn}</span></div>
                    <div className="text-[10px] text-ink-faint mt-0.5">{gc ? `${gc} akses tambahan` : 'belum ada akses tambahan'}</div>
                    {msg && msg.id === r.id && <div className={`text-[11px] mt-1 ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      <button type="button" onClick={() => pickEmployee(r.id)} disabled={pending}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-control bg-brand text-white hover:bg-brand-ink disabled:opacity-50">Tinjau</button>
                      <button type="button" onClick={() => markReviewed(r)} disabled={pending}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-50">Tandai selesai</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Langkah 1 — Pilih penerima ── */}
        <div className="rounded-panel border border-line bg-neutral-tint p-4 mb-4">
          <h3 className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.05em] mb-2">Langkah 1 · Pilih siapa</h3>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {RECIPIENTS.map((r) => {
              const Icon = r.icon;
              const active = recipient === r.key;
              return (
                <button key={r.key} type="button" onClick={() => { setRecipient(r.key); setPanel(null); setPanelMsg(null); }}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-control border transition-colors ${
                    active ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-soft border-line hover:text-ink hover:border-line-strong'}`}>
                  <Icon className="w-4 h-4" />{r.label}
                </button>
              );
            })}
          </div>
          {recipient === 'employee' && (
            <SearchableSelect value={selEmp} onChange={(v) => { setSelEmp(v); setPanel(null); setAddPageSel(''); }}
              options={empOptions} placeholder="— cari & pilih pegawai —" ariaLabel="Pilih pegawai"
              className="rounded-control border border-line px-3 py-2 text-sm bg-surface max-w-md" />
          )}
          {recipient === 'role' && (
            <select value={selRole} onChange={(e) => { setSelRole(e.target.value); setPanel(null); setAddPageSel(''); }}
              className="w-full max-w-md rounded-control border border-line px-3 py-2 text-sm bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand-tint focus:outline-none">
              {GRANT_ROLE_TARGETS.map((rt) => <option key={rt} value={rt}>Semua {GRANT_ROLE_TARGET_LABELS[rt]}</option>)}
            </select>
          )}
          {recipient === 'page' && (
            <select value={selPage} onChange={(e) => { setSelPage(e.target.value); setPanel(null); setHolderRoleSel(new Set()); setHolderDeptSel(new Set()); }}
              className="w-full max-w-md rounded-control border border-line px-3 py-2 text-sm bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand-tint focus:outline-none">
              <option value="">— pilih halaman —</option>
              {pages.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
        </div>

        {/* ── Langkah 2 — Profil / aksi ── */}
        {recipient === 'employee' && !selEmpObj && (
          <p className="text-sm text-ink-faint italic py-8 text-center">Pilih pegawai di atas untuk melihat & mengatur aksesnya.</p>
        )}

        {recipient === 'employee' && selEmpObj && (() => {
          const emp = selEmpObj;
          const secs = grantedSections(emp);
          const eligibleHrd = emp.role !== 'direksi' && emp.role !== 'hrd' && (isHrdDept(emp.dept) || emp.isHrdAdmin);
          const eligibleCoord = emp.role === 'employee';
          return (
            <div className="rounded-panel border border-line bg-surface p-4 space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="font-bold text-ink">{emp.name}</div>
                  <div className="text-[11px] text-ink-faint">{emp.dept} · {ROLE_LABEL[emp.role] ?? emp.role}</div>
                </div>
                {secs.length > 1 && (
                  <button type="button" onClick={() => setBulkRevoke({ kind: 'employee', empId: emp.id, name: emp.name, count: secs.length })} disabled={pending}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50">Cabut semua akses halaman</button>
                )}
              </div>
              {msg && msg.id === emp.id && <div className={`text-[11px] ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</div>}

              {/* (A) Bawaan peran */}
              <div>
                <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1.5">Akses bawaan peran <span className="font-normal normal-case">(otomatis, tak bisa diubah di sini)</span></p>
                <ul className="text-[12px] text-ink-soft space-y-0.5 list-disc pl-4">
                  {inheritedAccess(emp).map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>

              {/* (B) Akses halaman tambahan */}
              <div>
                <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1.5">Akses halaman tambahan</p>
                {secs.length === 0 ? (
                  <p className="text-[12px] text-ink-faint italic mb-2">Belum ada. Beri akses halaman di bawah.</p>
                ) : (
                  <div className="space-y-1.5 mb-2">
                    {secs.map((section) => {
                      const g = emp.grants[section];
                      const isAdmin = pages.find((p) => p.key === section)?.kind === 'administrator';
                      const summary = g.scopes.map((s) => scopeLabelByKey[s] ?? s).join(' + ');
                      const bd = izinBadge(g);
                      return (
                        <div key={section} className="flex items-center gap-1.5 rounded-control border border-brand/25 bg-brand-tint/60 px-2 py-1.5">
                          <button type="button" onClick={() => openPanel(emp.id, section)} disabled={pending} title="Ubah lingkup akses ini"
                            className="flex-1 min-w-0 text-left text-[12px] disabled:opacity-50">
                            <span className="font-semibold text-brand-ink">{pageLabelByKey[section] ?? section}</span>
                            <span className="text-brand"> · {summary}</span>
                            <span aria-hidden className="text-brand/50"> ✎</span>
                          </button>
                          {isAdmin && (
                            <button type="button" onClick={() => cycleIzin(emp, section)} disabled={pending} title="Putar izin: Lihat → Meringkas → Finalisasi"
                              className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border disabled:opacity-50 ${bd.c}`}>{bd.t}</button>
                          )}
                          <button type="button" onClick={() => revokeGrant(emp, section)} disabled={pending} title="Cabut akses ini"
                            aria-label={`Cabut akses ${pageLabelByKey[section] ?? section}`}
                            className="shrink-0 text-danger-ink hover:bg-danger-tint rounded-md p-1 disabled:opacity-50"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Beri akses halaman baru */}
                <div className="flex flex-wrap items-center gap-2">
                  <select value={addPageSel} onChange={(e) => setAddPageSel(e.target.value)}
                    className="rounded-control border border-line px-3 py-2 text-sm bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand-tint focus:outline-none">
                    <option value="">＋ beri akses halaman…</option>
                    {pages.map((p) => <option key={p.key} value={p.key}>{p.label}{emp.grants[p.key] ? ' (ubah)' : ''}</option>)}
                  </select>
                  <button type="button" onClick={() => { if (addPageSel) openPanel(emp.id, addPageSel); }} disabled={!addPageSel || pending}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-control bg-brand text-white hover:bg-brand-ink disabled:opacity-50">
                    <SlidersHorizontal className="w-4 h-4" /> Atur →
                  </button>
                </div>
                {panel && !panel.roleTarget && panel.empId === emp.id && <PanelCard />}
              </div>

              {/* (C) Kapabilitas */}
              <div>
                <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1.5">Izin khusus / jabatan</p>
                {!eligibleHrd && !eligibleCoord ? (
                  <p className="text-[12px] text-ink-faint italic">Tidak ada izin khusus yang berlaku untuk {ROLE_LABEL[emp.role] ?? emp.role} ini.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {eligibleHrd && (
                      <button type="button" onClick={() => toggleHrd(emp)} disabled={pending}
                        title={emp.isHrdAdmin ? 'Cabut izin HRD Admin' : 'Beri izin HRD Admin'}
                        className={btn(emp.isHrdAdmin, 'text-brand-ink bg-brand-tint border-brand/25 hover:bg-brand-tint/70')}><ShieldCheck className="w-3.5 h-3.5" /> HRD Admin</button>
                    )}
                    {emp.isHrdAdmin && emp.id !== meId && (
                      <button type="button" onClick={() => setSectionsDlg({ r: emp, full: !(emp.hrdSections && emp.hrdSections.length > 0), selected: new Set(emp.hrdSections ?? []) })} disabled={pending}
                        title="Atur bagian admin yang boleh dibuka rekan HRD ini"
                        className={btn(!!(emp.hrdSections && emp.hrdSections.length > 0), 'text-brand-ink bg-brand-tint border-brand/25 hover:bg-brand-tint/70')}>
                        <SlidersHorizontal className="w-3.5 h-3.5" /> Atur Akses{emp.hrdSections && emp.hrdSections.length > 0 ? ` (${emp.hrdSections.length})` : ''}</button>
                    )}
                    {eligibleCoord && (
                      <button type="button" onClick={() => toggleCoord(emp)} disabled={pending}
                        title={emp.isCoordinator ? 'Cabut peran Koordinator' : 'Jadikan Koordinator'}
                        className={btn(emp.isCoordinator, 'text-brand-ink bg-brand-tint border-brand/25 hover:bg-brand-tint/70')}><Users className="w-3.5 h-3.5" /> Koordinator</button>
                    )}
                    {emp.isCoordinator && (
                      <button type="button" onClick={() => setCoordDlg({ r: emp, selected: new Set(teams[emp.id] ?? []), q: '' })} disabled={pending}
                        title="Kelola pegawai yang dinaungi koordinator ini"
                        className={btn(!!teams[emp.id]?.length, 'text-brand-ink bg-brand-tint border-brand/25 hover:bg-brand-tint/70')}>
                        <ListChecks className="w-3.5 h-3.5" /> Kelola Tim{teams[emp.id]?.length ? ` (${teams[emp.id].length})` : ''}</button>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-ink-faint mt-1.5">Peninjau Lintas Divisi bukan izin khusus lagi — beri lewat akses halaman <strong>“Review Hasil Akhir”</strong> (lingkup “selain divisinya”, izin “Boleh meringkas”).</p>
              </div>
            </div>
          );
        })()}

        {/* Mode PERAN: beri akses halaman ke semua anggota peran. */}
        {recipient === 'role' && (
          <div className="rounded-panel border border-line bg-surface p-4">
            <p className="text-[12px] text-ink-soft mb-2">
              Diterapkan ke <strong className="data-value">{roleMemberRows(selRole).length}</strong> {GRANT_ROLE_TARGET_LABELS[selRole as GrantRoleTarget]} saat ini.
              Pegawai baru tak otomatis ikut. <span className="text-ink-faint">Izin khusus (HRD/Koordinator) diberikan per-orang, bukan per-peran.</span>
            </p>

            {/* Daftar koordinator saat ini (siapa saja yang sedang menjabat + tim naungannya). */}
            {selRole === 'koordinator' && (
              <div className="mb-3 rounded-control border border-line bg-neutral-tint p-3">
                <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.05em] mb-2">Koordinator saat ini ({roleMemberRows('koordinator').length})</p>
                {roleMemberRows('koordinator').length === 0 ? (
                  <p className="text-[12px] text-ink-soft italic">Belum ada koordinator. Angkat lewat penerima <strong>Seorang pegawai</strong> → izin khusus <strong>Koordinator</strong>.</p>
                ) : (
                  <ul className="space-y-1">
                    {roleMemberRows('koordinator').map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-2 text-[12px]">
                        <span className="font-semibold text-ink">{c.name}</span>
                        <span className="text-ink-faint">· {c.dept}</span>
                        <span className="text-brand-ink">· menaungi {teams[c.id]?.length ?? 0} pegawai</span>
                        <button type="button" onClick={() => pickEmployee(c.id)}
                          className="ml-auto text-[11px] font-semibold text-brand-ink hover:underline">Kelola →</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <select value={addPageSel} onChange={(e) => setAddPageSel(e.target.value)}
                className="rounded-control border border-line px-3 py-2 text-sm bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand-tint focus:outline-none">
                <option value="">＋ beri akses halaman…</option>
                {pages.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <button type="button" onClick={() => { if (addPageSel) openRolePanel(selRole, addPageSel); }} disabled={!addPageSel || pending}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-control bg-brand text-white hover:bg-brand-ink disabled:opacity-50">
                <SlidersHorizontal className="w-4 h-4" /> Atur →
              </button>
            </div>
            {panel && panel.roleTarget === selRole && <PanelCard />}
          </div>
        )}

        {/* Mode HALAMAN: pemegang + cabut (satu / semua). */}
        {recipient === 'page' && !selPage && (
          <p className="text-sm text-ink-faint italic py-8 text-center">Pilih halaman di atas untuk melihat siapa saja pemegangnya.</p>
        )}
        {recipient === 'page' && selPage && (
          <div className="rounded-panel border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm font-bold text-ink">Pemegang: {pageLabelByKey[selPage] ?? selPage}</h4>
                <p className="text-[11px] text-ink-faint"><span className="data-value">{holders.length}</span> pegawai memegang akses halaman ini.</p>
                {msg && msg.id === `page:${selPage}` && <p className={`text-[11px] mt-0.5 ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
              </div>
              {holders.length > 0 && (
                <button type="button" onClick={() => setBulkRevoke({ kind: 'page', section: selPage, count: holders.length })} disabled={pending}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-2 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50">
                  <X className="w-3.5 h-3.5" /> Cabut dari semua ({holders.length})</button>
              )}
            </div>

            {/* Cakupan per-peran (chip "se-peran"): hijau = SELURUH anggota peran memegang; klik = saring. */}
            {roleCoverage.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="text-[11px] text-ink-faint">Cakupan peran:</span>
                {roleCoverage.map((c) => {
                  const full = c.held === c.total;
                  const label = GRANT_ROLE_TARGET_LABELS[c.rt];
                  const activeFilter = holderRoleSel.has(c.rt);
                  return (
                    <button key={c.rt} type="button"
                      onClick={() => { setHolderRoleSel((s) => { const n = new Set(s); if (n.has(c.rt)) n.delete(c.rt); else n.add(c.rt); return n; }); holdersPager.setPage(0); }}
                      title={full ? `Semua ${label} (${c.total}) memegang halaman ini — klik untuk menyaring daftar` : `${c.held} dari ${c.total} ${label} memegang — klik untuk menyaring`}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-shadow ${activeFilter ? 'ring-2 ring-offset-1 ring-brand/40 ' : ''}${full ? 'bg-brand-tint text-brand-ink border-brand/25' : 'bg-neutral-tint text-ink-soft border-line'}`}>
                      {full ? `✓ Semua ${label} (${c.total})` : `${c.held}/${c.total} ${label}`}
                    </button>
                  );
                })}
              </div>
            )}

            {holders.length === 0 ? (
              <p className="text-[12px] text-ink-faint italic">Belum ada pemegang. Beri lewat penerima <strong>Pegawai</strong> atau <strong>Peran</strong>.</p>
            ) : (
              <div className="space-y-3">
                {/* Filter pemegang: per peran & per divisi (kosong = semua). */}
                <div className="flex flex-wrap items-center gap-2">
                  <MultiCheckFilter label="Peran"
                    options={GRANT_ROLE_TARGETS.map((rt) => ({ value: rt, label: GRANT_ROLE_TARGET_LABELS[rt] }))}
                    selected={holderRoleSel} onChange={(s) => { setHolderRoleSel(s); holdersPager.setPage(0); }} />
                  <MultiCheckFilter label="Divisi"
                    options={holderDepts.map((d) => ({ value: d, label: d }))}
                    selected={holderDeptSel} onChange={(s) => { setHolderDeptSel(s); holdersPager.setPage(0); }} />
                  {(holderRoleSel.size > 0 || holderDeptSel.size > 0) && (
                    <button type="button" onClick={() => { setHolderRoleSel(new Set()); setHolderDeptSel(new Set()); holdersPager.setPage(0); }}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">Bersihkan</button>
                  )}
                  <span className="text-[11px] text-ink-faint ml-auto"><span className="data-value">{filteredHolders.length}</span> dari <span className="data-value">{holders.length}</span> pemegang</span>
                </div>

                {filteredHolders.length === 0 ? (
                  <p className="text-[12px] text-ink-faint italic py-4 text-center">Tak ada pemegang cocok dengan filter.</p>
                ) : (<>
                <div className="space-y-1.5">
                  {holdersPager.shown.map((emp) => {
                    const g = emp.grants[selPage];
                    const isAdmin = pages.find((p) => p.key === selPage)?.kind === 'administrator';
                    const summary = g.scopes.map((s) => scopeLabelByKey[s] ?? s).join(' + ');
                    const bd = izinBadge(g);
                    return (
                      <div key={emp.id} className="flex items-center gap-1.5 rounded-control border border-line px-2 py-1.5">
                        <div className="flex-1 min-w-0 text-[12px]">
                          <span className="font-semibold text-ink">{emp.name}</span>
                          <span className="text-ink-faint"> · {emp.dept} · {summary}</span>
                        </div>
                        {isAdmin && (
                          <button type="button" onClick={() => cycleIzin(emp, selPage)} disabled={pending} title="Putar izin: Lihat → Meringkas → Finalisasi"
                            className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border disabled:opacity-50 ${bd.c}`}>{bd.t}</button>
                        )}
                        <button type="button" onClick={() => revokeGrant(emp, selPage)} disabled={pending} title="Cabut akses pegawai ini"
                          className="shrink-0 text-danger-ink hover:bg-danger-tint rounded-md p-1 disabled:opacity-50"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
                <Pager page={holdersPager.page} pageCount={holdersPager.pageCount} setPage={holdersPager.setPage}
                  total={holdersPager.total} rangeFrom={holdersPager.rangeFrom} rangeTo={holdersPager.rangeTo} unit="pemegang" />
                </>)}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-ink-faint mt-4 max-w-3xl leading-relaxed">
          Lingkup &amp; izin ditegakkan di server (data disaring sesuai pilihan; izin tulis untuk non-HRD lewat jalur
          berlingkup). Semua perubahan tercatat di <span className="font-semibold text-ink-soft">Log aktivitas</span>.
          “Atur Akses” membatasi <strong>tampilan menu</strong> rekan HRD, bukan gembok data.
        </p>
      </>)}

      {/* Dialog: Tim Koordinasi */}
      <ConfirmDialog open={!!coordDlg} icon="👥" title={coordDlg ? `Tim Koordinasi — ${coordDlg.r.name}` : ''} tone="primary"
        confirmLabel={coordDlg ? `Simpan (${coordDlg.selected.size})` : 'Simpan'} busy={pending}
        onConfirm={submitCoord} onCancel={() => { if (!pending) setCoordDlg(null); }}>
        <p>Pilih pegawai yang dinaungi koordinator ini. Koordinator hanya dapat <strong>melihat</strong> Laporan Kinerja Tim mereka.</p>
        <input value={coordDlg?.q ?? ''} onChange={(e) => setCoordDlg((c) => (c ? { ...c, q: e.target.value } : c))}
          placeholder="Cari nama / divisi…" className="w-full text-sm px-2.5 py-1.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <div className="max-h-64 overflow-y-auto border border-line rounded-control divide-y divide-line-soft">
          {coordDlg && (() => {
            const term = coordDlg.q.trim().toLowerCase();
            const cands = rows.filter((r) => r.id !== coordDlg.r.id && !r.isExternal && r.role !== 'direksi' && (!term || `${r.name} ${r.dept}`.toLowerCase().includes(term)));
            if (cands.length === 0) return <p className="text-xs text-ink-soft italic p-3">Tidak ada pegawai cocok.</p>;
            return cands.map((r) => {
              const checked = coordDlg.selected.has(r.id);
              return (
                <label key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-neutral-tint ${checked ? 'bg-brand-tint/60' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => setCoordDlg((c) => {
                    if (!c) return c; const s = new Set(c.selected); if (s.has(r.id)) s.delete(r.id); else s.add(r.id); return { ...c, selected: s };
                  })} className="accent-brand" />
                  <span className="text-xs text-ink font-semibold">{r.name}</span>
                  <span className="text-[10px] text-ink-faint">{r.dept}</span>
                </label>
              );
            });
          })()}
        </div>
      </ConfirmDialog>

      {/* Dialog: Atur Akses HRD (hrd_sections) */}
      <ConfirmDialog open={!!sectionsDlg} icon="🧩" title={sectionsDlg ? `Atur Akses HRD — ${sectionsDlg.r.name}` : ''} tone="primary"
        confirmLabel={sectionsDlg ? (sectionsDlg.full ? 'Simpan (Akses penuh)' : `Simpan (${sectionsDlg.selected.size})`) : 'Simpan'} busy={pending}
        onConfirm={submitSections} onCancel={() => { if (!pending) setSectionsDlg(null); }}>
        <p>Batasi halaman admin yang boleh dibuka rekan HRD ini. <strong>Akses penuh</strong> = semua bagian.</p>
        <p className="text-[11px] text-warn-ink bg-warn-tint border border-warn-ink/25 rounded-control px-2.5 py-1.5">
          ⚠️ Ini pembatasan <strong>tampilan menu</strong>, bukan gembok data: pemegang izin HRD tetap bisa membaca data lewat cara teknis. Cocok untuk pembagian tugas antar rekan HRD tepercaya.
        </p>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="hrd-scope" checked={!!sectionsDlg?.full} onChange={() => setSectionsDlg((d) => (d ? { ...d, full: true } : d))} className="accent-brand" />
            <span className="font-semibold text-ink">Akses penuh (semua bagian)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="hrd-scope" checked={!sectionsDlg?.full} onChange={() => setSectionsDlg((d) => (d ? { ...d, full: false } : d))} className="accent-brand" />
            <span className="font-semibold text-ink">Akses terbatas — centang bagian yang diizinkan:</span>
          </label>
        </div>
        {sectionsDlg && !sectionsDlg.full && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 border border-line rounded-control p-2 max-h-64 overflow-y-auto">
            {HRD_SECTIONS.map((s) => {
              const checked = sectionsDlg.selected.has(s);
              return (
                <label key={s} className={`flex items-center gap-2 px-2 py-1.5 rounded-control cursor-pointer hover:bg-neutral-tint ${checked ? 'bg-brand-tint/70' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => setSectionsDlg((d) => {
                    if (!d) return d; const sel = new Set(d.selected); if (sel.has(s)) sel.delete(s); else sel.add(s); return { ...d, selected: sel };
                  })} className="accent-brand" />
                  <span className="text-xs text-ink">{HRD_SECTION_LABELS[s as HrdSection]}</span>
                </label>
              );
            })}
          </div>
        )}
      </ConfirmDialog>

      {/* Konfirmasi cabut-massal */}
      <ConfirmDialog open={!!bulkRevoke} icon="🗑️" title="Cabut akses secara massal?" tone="danger"
        confirmLabel={bulkRevoke ? `Ya, cabut (${bulkRevoke.count})` : 'Ya, cabut'} busy={pending}
        onConfirm={() => { if (!bulkRevoke) return; if (bulkRevoke.kind === 'page') doRevokePageAll(bulkRevoke.section); else doRevokeEmployeeAll(bulkRevoke.empId); }}
        onCancel={() => { if (!pending) setBulkRevoke(null); }}>
        {bulkRevoke?.kind === 'page' && (
          <p>Mencabut akses halaman <strong>{pageLabelByKey[bulkRevoke.section] ?? bulkRevoke.section}</strong> dari <strong>{bulkRevoke.count} pegawai</strong> sekaligus. Akses bawaan peran mereka tak terpengaruh. Lanjutkan?</p>
        )}
        {bulkRevoke?.kind === 'employee' && (
          <p>Mencabut <strong>semua {bulkRevoke.count} akses halaman</strong> milik <strong>{bulkRevoke.name}</strong>. Akses bawaan perannya tak terpengaruh. Lanjutkan?</p>
        )}
      </ConfirmDialog>

      {/* Peringatan: izin FINALISASI ke PERAN luas */}
      <ConfirmDialog open={!!roleConfirm} icon="⚠️" title="Beri izin finalisasi ke banyak orang?" tone="danger"
        confirmLabel={roleConfirm ? `Ya, berikan ke ${roleConfirm.count} orang` : 'Ya, berikan'} busy={pending}
        onConfirm={() => roleConfirm && doRoleSave(roleConfirm.roleTarget, roleConfirm.section, roleConfirm.scopes, roleConfirm.canEdit, roleConfirm.canFinalize)}
        onCancel={() => { if (!pending) setRoleConfirm(null); }}>
        {roleConfirm && (
          <p>Anda akan mengizinkan <strong>SEMUA {GRANT_ROLE_TARGET_LABELS[roleConfirm.roleTarget as GrantRoleTarget]} ({roleConfirm.count} orang)</strong> untuk <strong>memfinalisasi &amp; merilis</strong> halaman <strong>{pages.find((p) => p.key === roleConfirm.section)?.label}</strong> (dalam lingkupnya masing-masing). Ini kemampuan menulis paling berdampak — pastikan memang diinginkan. Lanjutkan?</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
