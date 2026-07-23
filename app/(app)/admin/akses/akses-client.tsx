'use client';

import { useMemo, useState, useTransition } from 'react';
import { ShieldCheck, ScanEye, Users, ListChecks, SlidersHorizontal, X, UserPlus, ScrollText } from 'lucide-react';
import { setPageGrant, setPageGrantForRole, removePageGrant, markAccessReviewed } from './actions';
import { setHrdAdmin, setCrossReviewer, setCoordinator, setCoordinatorTeam, setHrdSections } from '../pegawai/actions';
import { isHrdDept, HRD_SECTIONS, HRD_SECTION_LABELS, GRANT_ROLE_TARGETS, GRANT_ROLE_TARGET_LABELS, type HrdSection, type GrantRoleTarget } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/searchable-select';
import { AksesLog, type AksesLogRow } from './akses-log';

export type AksesEmployee = {
  id: string;
  name: string;
  dept: string;
  role: string;
  isExternal: boolean;
  isHrdAdmin: boolean;
  isCrossReviewer: boolean;
  isCoordinator: boolean;
  hrdSections: string[] | null;
  joinedOn: string | null;           // tgl masuk (untuk section "Pegawai Baru")
  accessReviewedAt: string | null;   // penanda HRD sudah meninjau akses pegawai baru (null = belum)
  grants: Record<string, { scopes: string[]; canEdit: boolean }>; // section halaman → { daftar lingkup, boleh-edit }
};
type PageOpt = { key: string; label: string; kind: string }; // kind: 'pemantauan' | 'administrator'
type ScopeOpt = { key: string; label: string };

const ROLE_LABEL: Record<string, string> = { employee: 'Pegawai', spv: 'SPV', hrd: 'HRD', direksi: 'Direksi' };
const PAGE_SIZE = 12;
const NEW_WINDOW_DAYS = 30; // jendela "Pegawai Baru": joined_on ≤ N hari terakhir & belum ditinjau

// Sub-tab halaman (pola seperti Dashboard Organisasi): beri akses · cabut akses · log aktivitas.
type AksesTab = 'beri' | 'cabut' | 'log';
const AKSES_TABS: { key: AksesTab; label: string; icon: React.ElementType }[] = [
  { key: 'beri', label: 'Memberikan akses', icon: UserPlus },
  { key: 'cabut', label: 'Mencabut akses', icon: X },
  { key: 'log', label: 'Log aktivitas', icon: ScrollText },
];

/**
 * Konsol Manajemen Akses — SATU tempat mengatur seluruh akses/izin pegawai (dipindah dari Kelola
 * Pegawai): (1) grant HALAMAN ber-lingkup (mis. Monitor: semua/satu/selain divisi); (2) izin peran —
 * HRD Admin (+ Atur Akses per-bagian), Peninjau Lintas Divisi, Koordinator (+ Tim). Perubahan
 * optimistis di state lokal + pesan status per baris; pencarian & paginasi sisi-klien.
 */
export function AksesClient({
  employees, pages, scopes, coordTeams: initialTeams, meId, initialTab = 'beri', logRows, logPage, logPageSize, logTotal,
}: {
  employees: AksesEmployee[]; pages: PageOpt[]; scopes: ScopeOpt[]; coordTeams: Record<string, string[]>; meId: string;
  initialTab?: AksesTab; logRows: AksesLogRow[]; logPage: number; logPageSize: number; logTotal: number;
}) {
  const [rows, setRows] = useState(employees);
  const [teams, setTeams] = useState<Record<string, string[]>>(initialTeams);
  const [tab, setTab] = useState<AksesTab>(initialTab);
  const [q, setQ] = useState('');      // pencarian daftar "Akses Halaman Aktif"
  const [q3, setQ3] = useState('');    // pencarian blok "Izin Peran & Akses HRD" (kosong = hanya pemegang)
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [coordDlg, setCoordDlg] = useState<{ r: AksesEmployee; selected: Set<string>; q: string } | null>(null);
  const [sectionsDlg, setSectionsDlg] = useState<{ r: AksesEmployee; full: boolean; selected: Set<string> } | null>(null);
  // ── Card "Tambah akses baru" + panel kanan ──
  // Penerima: 'employee' (pegawai tertentu, pakai SearchableSelect) ATAU salah satu PERAN (Fase 2).
  const [addTarget, setAddTarget] = useState<string>('employee');
  const [addEmp, setAddEmp] = useState('');   // employee_id terpilih di card (mode 'employee')
  const [addPage, setAddPage] = useState(''); // section halaman terpilih di card
  // Panel: lingkup = MULTI (Diri sendiri / Divisi sendiri / Divisi lain / Semua pegawai / Tim naungan),
  // dari daftar `scopes`. Checkbox boleh >1; "Semua pegawai" menyerap → mengosongkan lingkup lain.
  // `roleTarget` != null → panel dalam mode PERAN (materialisasi ke semua anggota peran saat ini).
  const [panel, setPanel] = useState<{ empId: string; section: string; scopes: string[]; canEdit: boolean; roleTarget?: string | null } | null>(null);
  const [panelMsg, setPanelMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Konfirmasi peringatan: memberi izin EDIT halaman administrator ke PERAN luas (banyak orang).
  const [roleConfirm, setRoleConfirm] = useState<{ roleTarget: string; section: string; scopes: string[]; canEdit: boolean; count: number } | null>(null);

  const pageLabelByKey = useMemo(() => Object.fromEntries(pages.map((p) => [p.key, p.label])), [pages]);
  const grantedSections = (e: AksesEmployee) => Object.keys(e.grants).filter((k) => e.grants[k].scopes.length > 0);

  // ── Daftar "Akses Halaman Aktif": HANYA pegawai yang punya grant halaman (matriks dibuang). ──
  const filtered = useMemo(() => {
    const withGrants = rows.filter((e) => grantedSections(e).length > 0);
    const s = q.trim().toLowerCase();
    if (!s) return withGrants;
    return withGrants.filter((e) =>
      e.name.toLowerCase().includes(s) ||
      e.dept.toLowerCase().includes(s) ||
      (ROLE_LABEL[e.role] ?? e.role).toLowerCase().includes(s) ||
      grantedSections(e).some((k) => (pageLabelByKey[k] ?? k).toLowerCase().includes(s)));
  }, [rows, q, pageLabelByKey]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount - 1);
  const shown = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  // ── Blok "Izin Peran & Akses HRD": kelola HRD Admin / Atur Akses / Peninjau / Koordinator. ──
  // Kelayakan (mirror gate tombol lama di matriks): HRD/Peninjau hanya divisi HRD; Koordinator hanya
  // pegawai (role employee). Default tampilkan PEMEGANG saja; cari → tampilkan yang LAYAK diberi izin.
  const holdsRolePerm = (e: AksesEmployee) => e.isHrdAdmin || e.isCrossReviewer || e.isCoordinator;
  const eligibleHrd = (e: AksesEmployee) => e.role !== 'direksi' && e.role !== 'hrd' && (isHrdDept(e.dept) || e.isHrdAdmin);
  const eligibleCross = (e: AksesEmployee) => e.role !== 'direksi' && e.role !== 'hrd' && (isHrdDept(e.dept) || e.isCrossReviewer);
  const eligibleCoord = (e: AksesEmployee) => e.role === 'employee';
  const eligibleRolePerm = (e: AksesEmployee) => holdsRolePerm(e) || eligibleHrd(e) || eligibleCross(e) || eligibleCoord(e);
  const roleRows = useMemo(() => {
    const s = q3.trim().toLowerCase();
    if (!s) return rows.filter(holdsRolePerm);
    return rows.filter((e) => eligibleRolePerm(e) &&
      (e.name.toLowerCase().includes(s) || e.dept.toLowerCase().includes(s) || (ROLE_LABEL[e.role] ?? e.role).toLowerCase().includes(s)));
  }, [rows, q3]);

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

  // ── Grant HALAMAN ber-lingkup MULTI (+ dimensi boleh-edit untuk halaman administrator) ────────
  function changeGrant(emp: AksesEmployee, section: string, scopes: string[], canEdit: boolean) {
    run(emp.id, () => (scopes.length ? setPageGrant(emp.id, section, scopes, canEdit) : removePageGrant(emp.id, section)), () => {
      const grants = { ...emp.grants };
      if (scopes.length) grants[section] = { scopes, canEdit }; else delete grants[section];
      patchRow(emp.id, { grants });
    });
  }
  /** Toggle boleh-edit/hanya-lihat untuk halaman administrator (pertahankan lingkup saat ini). */
  function toggleEdit(emp: AksesEmployee, section: string) {
    const cur = emp.grants[section];
    if (!cur) return;
    changeGrant(emp, section, cur.scopes, !cur.canEdit);
  }
  /** Cabut satu grant halaman langsung dari daftar "Akses Halaman Aktif" (reversibel → tanpa konfirmasi). */
  function revokeGrant(emp: AksesEmployee, section: string) {
    run(emp.id, () => removePageGrant(emp.id, section), () => {
      const grants = { ...emp.grants }; delete grants[section];
      patchRow(emp.id, { grants });
      // Bila panel sedang membuka grant ini, kosongkan lingkupnya agar konsisten.
      setPanel((p) => (p && p.empId === emp.id && p.section === section ? { ...p, scopes: [], canEdit: false } : p));
    });
  }

  // ── Card "Tambah akses baru" + panel kanan ──────────────────────────────────
  const empOptions = useMemo(
    () => rows.map((r) => ({ value: r.id, label: `${r.name} — ${r.dept}` })),
    [rows],
  );
  const scopeLabelByKey = useMemo(() => Object.fromEntries(scopes.map((s) => [s.key, s.label])), [scopes]);

  // ── Pegawai Baru (Fase 3): joined_on dalam jendela & belum ditinjau HRD. Akses BAWAAN peran tetap
  //    jalan; section ini hanya mengingatkan HRD memutuskan akses TAMBAHAN lalu menandainya selesai. ──
  const newEmployees = useMemo(() => {
    const cutoff = new Date(Date.now() - NEW_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    return rows.filter((r) => !r.isExternal && r.accessReviewedAt == null && r.joinedOn != null && r.joinedOn >= cutoff);
  }, [rows]);
  /** Tandai akses pegawai baru sudah ditinjau → kartu hilang (patch state lokal). */
  function markReviewed(r: AksesEmployee) {
    run(r.id, () => markAccessReviewed(r.id), () => patchRow(r.id, { accessReviewedAt: new Date().toISOString() }));
  }
  /** "Tinjau akses": prefill card "Tambah akses baru" dengan pegawai ini (mode pegawai tertentu). */
  function reviewAccessFor(r: AksesEmployee) {
    setAddTarget('employee'); setAddEmp(r.id); setPanel(null); setPanelMsg(null);
  }
  const panelEmp = panel ? rows.find((r) => r.id === panel.empId) ?? null : null;
  const panelPage = panel ? pages.find((p) => p.key === panel.section) ?? null : null;
  const panelRoleLabel = panel?.roleTarget ? GRANT_ROLE_TARGET_LABELS[panel.roleTarget as GrantRoleTarget] : null;
  const panelRoleCount = panel?.roleTarget ? roleMemberRows(panel.roleTarget).length : 0;
  // Lingkup 'Tim naungannya' hanya relevan untuk Koordinator (peran atau pegawai koordinator) → sembunyikan selain itu.
  const showTeamScope = panel?.roleTarget === 'koordinator' || (!!panelEmp && panelEmp.isCoordinator);
  const visibleScopes = scopes.filter((s) => s.key !== 'coordinator_team' || showTeamScope);

  /** Buka panel untuk (pegawai, halaman) — dari card (default) atau dari sel tabel. Prefill grant existing. */
  function openPanel(empId: string = addEmp, section: string = addPage) {
    const emp = rows.find((r) => r.id === empId);
    if (!emp || !section) return;
    const g = emp.grants[section];
    setTab('beri'); // panel pengaturan lingkup ada di tab "Memberikan akses" → pindah ke sana bila dipicu dari chip.
    setPanel({ empId, section, scopes: g?.scopes ?? [], canEdit: !!g?.canEdit, roleTarget: null });
    setPanelMsg(null);
  }

  /** Anggota peran SAAT INI (mirror predikat server) — untuk hitung jumlah + patch state lokal. */
  function roleMemberRows(roleTarget: string) {
    return rows.filter((r) => !r.isExternal && (
      roleTarget === 'koordinator' ? r.isCoordinator :
      roleTarget === 'pegawai' ? r.role === 'employee' :
      roleTarget === 'spv' ? r.role === 'spv' :
      roleTarget === 'direksi' ? r.role === 'direksi' : false));
  }

  /** Buka panel dalam mode PERAN (tanpa prefill — grant per-peran = pemberian baru ke semua anggota). */
  function openRolePanel(roleTarget: string, section: string) {
    setPanel({ empId: '', section, scopes: [], canEdit: false, roleTarget });
    setPanelMsg(null);
  }

  /** Tombol "Atur akses" di card: buka panel sesuai penerima terpilih (pegawai tertentu vs peran). */
  function openPanelFromCard() {
    if (!addPage) return;
    if (addTarget === 'employee') openPanel(addEmp, addPage);
    else openRolePanel(addTarget, addPage);
  }

  /** Terapkan grant ke SEMUA anggota peran (setelah konfirmasi bila perlu) + patch state lokal. */
  function doRoleSave(roleTarget: string, section: string, scps: string[], canEdit: boolean) {
    setRoleConfirm(null);
    startTransition(async () => {
      const res = await setPageGrantForRole(roleTarget, section, scps, canEdit);
      if (res.ok) {
        const memberIds = new Set(roleMemberRows(roleTarget).map((r) => r.id));
        setRows((prev) => prev.map((r) => (memberIds.has(r.id) ? { ...r, grants: { ...r.grants, [section]: { scopes: scps, canEdit } } } : r)));
        setPanelMsg({ ok: true, text: res.msg ?? 'Akses massal tersimpan.' });
      } else setPanelMsg({ ok: false, text: res.error ?? 'Gagal menyimpan.' });
    });
  }

  /** Toggle satu lingkup di panel (multi). "Semua pegawai" menyerap → mengosongkan lingkup lain;
   *  memilih lingkup lain melepas "Semua". */
  function togglePanelScope(key: string) {
    setPanel((p) => {
      if (!p) return p;
      if (p.scopes.includes(key)) return { ...p, scopes: p.scopes.filter((s) => s !== key) };
      if (key === 'all') return { ...p, scopes: ['all'] };
      return { ...p, scopes: [...p.scopes.filter((s) => s !== 'all'), key] };
    });
  }

  /** Simpan kombinasi panel via setPageGrant (pola yang sama) + patch rows agar tabel ter-update. */
  function savePanel() {
    if (!panel) return;
    const scps = panel.scopes;
    if (!scps.length) { setPanelMsg({ ok: false, text: 'Pilih minimal satu lingkup data.' }); return; }
    const section = panel.section;
    // Halaman pemantauan selalu lihat-saja → paksa canEdit=false (server juga menormalkan).
    const kind = pages.find((p) => p.key === section)?.kind;
    const canEdit = kind === 'administrator' ? panel.canEdit : false;
    // Mode PERAN: materialisasi ke semua anggota. Peringatan bila EDIT halaman administrator ke peran luas.
    if (panel.roleTarget) {
      const rt = panel.roleTarget;
      const count = roleMemberRows(rt).length;
      if (count === 0) { setPanelMsg({ ok: false, text: `Tak ada anggota ${GRANT_ROLE_TARGET_LABELS[rt as GrantRoleTarget]} saat ini.` }); return; }
      if (kind === 'administrator' && canEdit) { setRoleConfirm({ roleTarget: rt, section, scopes: scps, canEdit, count }); return; }
      doRoleSave(rt, section, scps, canEdit);
      return;
    }
    const emp = rows.find((r) => r.id === panel.empId);
    if (!emp) return;
    startTransition(async () => {
      const res = await setPageGrant(emp.id, section, scps, canEdit);
      if (res.ok) {
        patchRow(emp.id, { grants: { ...emp.grants, [section]: { scopes: scps, canEdit } } });
        setPanelMsg({ ok: true, text: res.msg ?? 'Akses tersimpan.' });
      } else setPanelMsg({ ok: false, text: res.error ?? 'Gagal menyimpan.' });
    });
  }

  /** Cabut akses (dari panel) untuk (pegawai, halaman) saat ini. */
  function removePanel() {
    if (!panel) return;
    const emp = rows.find((r) => r.id === panel.empId);
    if (!emp) return;
    const section = panel.section;
    startTransition(async () => {
      const res = await removePageGrant(emp.id, section);
      if (res.ok) {
        const grants = { ...emp.grants }; delete grants[section];
        patchRow(emp.id, { grants });
        setPanel((p) => (p ? { ...p, scopes: [], canEdit: false } : p));
        setPanelMsg({ ok: true, text: res.msg ?? 'Akses dicabut.' });
      } else setPanelMsg({ ok: false, text: res.error ?? 'Gagal mencabut.' });
    });
  }

  // ── Izin peran ──────────────────────────────────────────────────────────────
  const toggleHrd = (r: AksesEmployee) => run(r.id, () => setHrdAdmin(r.id, !r.isHrdAdmin), () => patchRow(r.id, { isHrdAdmin: !r.isHrdAdmin, ...(r.isHrdAdmin ? { hrdSections: null } : {}) }));
  const toggleCross = (r: AksesEmployee) => run(r.id, () => setCrossReviewer(r.id, !r.isCrossReviewer), () => patchRow(r.id, { isCrossReviewer: !r.isCrossReviewer }));
  const toggleCoord = (r: AksesEmployee) => run(r.id, () => setCoordinator(r.id, !r.isCoordinator), () => {
    const next = !r.isCoordinator;
    patchRow(r.id, { isCoordinator: next });
    if (!next) setTeams((t) => { const c = { ...t }; delete c[r.id]; return c; });
  });

  // ── Dialog Tim Koordinasi ─────────────────────────────────────────────────
  function submitCoord() {
    if (!coordDlg) return;
    const { r, selected } = coordDlg;
    setCoordDlg(null);
    run(r.id, () => setCoordinatorTeam(r.id, [...selected]), () => setTeams((t) => ({ ...t, [r.id]: [...selected] })));
  }

  // ── Dialog Atur Akses (hrd_sections) ──────────────────────────────────────
  function submitSections() {
    if (!sectionsDlg) return;
    const { r, full, selected } = sectionsDlg;
    const payload = full || selected.size === 0 ? null : [...selected];
    setSectionsDlg(null);
    run(r.id, () => setHrdSections(r.id, payload), () => patchRow(r.id, { hrdSections: payload }));
  }

  const btn = (active: boolean, tone: string) =>
    `inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-60 ${active ? tone : 'text-gray-500 hover:bg-gray-100'}`;

  return (
    <div className="mt-4">
      {/* Sub-tab: Memberikan · Mencabut · Log aktivitas (pola seperti Dashboard Organisasi) */}
      <div className="flex border-b border-gray-200 gap-1.5 overflow-x-auto scrollbar-none mb-5">
        {AKSES_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 py-2 px-4 text-xs font-bold border-b-2 transition-all shrink-0 ${
                active ? 'border-emerald-700 text-emerald-950' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon className="w-4 h-4 text-emerald-700" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'beri' && (<>
      {/* ── Tambah akses baru: 3 kolom (halaman · penerima · lingkup&izin) ─────────────────── */}
      <h3 className="text-sm font-bold text-gray-800 mb-0.5">Tambah akses baru</h3>
      <p className="text-[11px] text-gray-500 mb-3">Pilih <strong>halaman</strong>, <strong>penerima</strong>, lalu atur <strong>lingkup &amp; izin</strong>.</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        {/* Kolom 1: Pilih halaman (dikelompokkan Pemantauan / Menu Administrator) */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
          <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-2">1 · Pilih halaman</h4>
          {(['pemantauan', 'administrator'] as const).map((kind) => {
            const group = pages.filter((p) => p.kind === kind);
            if (!group.length) return null;
            return (
              <div key={kind} className="mb-3 last:mb-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">{kind === 'pemantauan' ? 'Pemantauan' : 'Menu Administrator'}</p>
                <div className="space-y-1">
                  {group.map((p) => (
                    <label key={p.key} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg cursor-pointer border ${addPage === p.key ? 'bg-emerald-50 border-emerald-300' : 'border-transparent hover:bg-gray-100'}`}>
                      <input type="radio" name="add-page" checked={addPage === p.key} onChange={() => setAddPage(p.key)} className="accent-emerald-600" />
                      <span className="text-gray-800">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Kolom 2: Pilih penerima */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
          <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-2">2 · Pilih penerima</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Penerima</label>
              <select
                value={addTarget}
                onChange={(e) => setAddTarget(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="employee">Pegawai tertentu…</option>
                {GRANT_ROLE_TARGETS.map((rt) => (
                  <option key={rt} value={rt}>Semua {GRANT_ROLE_TARGET_LABELS[rt]}</option>
                ))}
              </select>
              {addTarget !== 'employee' && (
                <p className="text-[10px] text-gray-500 mt-1">
                  Diterapkan ke <strong>{roleMemberRows(addTarget).length}</strong> {GRANT_ROLE_TARGET_LABELS[addTarget as GrantRoleTarget]} saat ini. Pegawai baru tak otomatis ikut.
                </p>
              )}
            </div>
            {addTarget === 'employee' && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Pegawai</label>
                <SearchableSelect
                  value={addEmp}
                  onChange={setAddEmp}
                  options={empOptions}
                  placeholder="— pilih pegawai —"
                  ariaLabel="Pilih pegawai"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                />
              </div>
            )}
            <button
              type="button"
              onClick={openPanelFromCard}
              disabled={!addPage || (addTarget === 'employee' && !addEmp) || pending}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <SlidersHorizontal className="w-4 h-4" /> Atur akses →
            </button>
            {!addPage && <p className="text-[10px] text-gray-400">Pilih halaman di kolom 1 dulu.</p>}
          </div>
        </div>

        {/* Kolom 3: Lingkup & izin (panel pengaturan) */}
        <div className="rounded-2xl border border-gray-200 p-4">
          <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-2">3 · Lingkup &amp; izin</h4>
          {!panel || !panelPage || (!panel.roleTarget && !panelEmp) ? (
            <div className="flex items-center justify-center text-center text-[12px] text-gray-400 italic py-8">
              Pilih halaman &amp; penerima, lalu klik <span className="font-semibold text-gray-500">&nbsp;Atur akses&nbsp;</span> untuk menampilkan pengaturan di sini.
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">{panelPage.label}</h3>
                  {panel.roleTarget ? (
                    <p className="text-[11px] text-teal-700 font-semibold">Semua {panelRoleLabel} · {panelRoleCount} orang</p>
                  ) : (
                    <p className="text-[11px] text-gray-500">{panelEmp!.name} · {panelEmp!.dept}</p>
                  )}
                </div>
                <button type="button" onClick={() => { setPanel(null); setPanelMsg(null); }} className="text-[11px] text-gray-400 hover:text-gray-600">Tutup</button>
              </div>

              {/* Lingkup data — MULTI (boleh >1). "Semua pegawai" menyerap → mematikan lingkup lain. */}
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-gray-600 mb-1.5">Lingkup data <span className="font-normal text-gray-400">(boleh lebih dari satu)</span></p>
                <div className="space-y-1.5">
                  {visibleScopes.map((s) => {
                    const checked = panel.scopes.includes(s.key);
                    const disabled = pending || (s.key !== 'all' && panel.scopes.includes('all'));
                    return (
                      <label key={s.key} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                        <input type="checkbox" checked={checked} disabled={disabled}
                          onChange={() => togglePanelScope(s.key)} className="accent-emerald-600" />
                        <span className="text-gray-800">{s.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Izin — dua checkbox saling eksklusif → dipetakan ke can_edit. */}
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-gray-600 mb-1.5">Izin</p>
                {panelPage.kind === 'administrator' ? (
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={panel.canEdit} disabled={pending}
                        onChange={() => setPanel((p) => (p ? { ...p, canEdit: true } : p))} className="accent-amber-600" />
                      <span className="text-gray-800">Edit</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!panel.canEdit} disabled={pending}
                        onChange={() => setPanel((p) => (p ? { ...p, canEdit: false } : p))} className="accent-gray-500" />
                      <span className="text-gray-800">Lihat saja</span>
                    </label>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 italic">Halaman pemantauan selalu <strong>lihat-saja</strong>.</p>
                )}
              </div>

              {panelMsg && (
                <p className={`text-[11px] mb-2 ${panelMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{panelMsg.text}</p>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={savePanel} disabled={pending}
                  className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  Simpan akses
                </button>
                {!panel.roleTarget && panelEmp && panelEmp.grants[panel.section] && (
                  <button type="button" onClick={removePanel} disabled={pending}
                    className="text-[11px] font-bold px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                    Cabut akses
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section "Pegawai Baru": tinjau akses tambahan lalu tandai selesai ─────────────────── */}
      {newEmployees.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <h3 className="text-sm font-bold text-amber-900 mb-0.5">Pegawai Baru <span className="font-normal text-amber-700">({newEmployees.length})</span></h3>
          <p className="text-[11px] text-amber-800/80 mb-3 max-w-3xl">
            Bergabung ≤ {NEW_WINDOW_DAYS} hari terakhir &amp; belum ditinjau. Akses <strong>bawaan peran</strong> mereka
            sudah aktif — pegawai baru <strong>tidak</strong> otomatis mendapat akses tambahan. Putuskan apakah perlu
            grant tambahan (klik <span className="font-semibold">Tinjau akses</span>), lalu <span className="font-semibold">Tandai sudah ditinjau</span>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {newEmployees.map((r) => {
              const grantCount = Object.values(r.grants).filter((g) => g.scopes.length > 0).length;
              return (
                <div key={r.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="font-medium text-gray-800 text-sm">{r.name}</div>
                  <div className="text-[11px] text-gray-500">{r.dept} · {ROLE_LABEL[r.role] ?? r.role} · masuk {r.joinedOn}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{grantCount ? `${grantCount} akses tambahan` : 'belum ada akses tambahan'}</div>
                  {msg && msg.id === r.id && (
                    <div className={`text-[11px] mt-1 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <button type="button" onClick={() => reviewAccessFor(r)} disabled={pending}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      Tinjau akses
                    </button>
                    <button type="button" onClick={() => markReviewed(r)} disabled={pending}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                      Tandai sudah ditinjau
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>)}

      {/* ── TAB "Mencabut akses": daftar akses halaman aktif per-pegawai + tombol cabut ── */}
      {tab === 'cabut' && (
      <div className="mb-2">
        <h3 className="text-sm font-bold text-gray-800 mb-0.5">Akses Halaman Aktif</h3>
        <p className="text-[11px] text-gray-500 mb-3 max-w-3xl">
          Pegawai yang <strong>diberi akses halaman</strong> berlingkup. Tombol <span className="font-semibold">✕</span> untuk{' '}
          <strong>mencabut</strong>; klik chip untuk <strong>ubah lingkup</strong> (pindah ke tab <span className="font-semibold">Memberikan akses</span>).
          Pegawai tanpa grant tak ditampilkan.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Cari nama, divisi, peran, atau halaman…"
            className="w-full sm:w-80 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500 whitespace-nowrap">{filtered.length} pegawai</span>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
            {rows.some((e) => grantedSections(e).length > 0)
              ? 'Tak ada yang cocok dengan pencarian.'
              : 'Belum ada akses halaman yang diberikan. Gunakan “Tambah akses baru” di atas.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {shown.map((emp) => {
              const secs = grantedSections(emp);
              return (
                <div key={emp.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div className="font-bold text-gray-800 text-sm">{emp.name}</div>
                      <div className="text-[11px] text-gray-500">{emp.dept} · {ROLE_LABEL[emp.role] ?? emp.role}</div>
                    </div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{secs.length} akses</span>
                  </div>
                  {msg && msg.id === emp.id && (
                    <div className={`text-[11px] mt-1 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</div>
                  )}
                  <div className="mt-2 space-y-1.5">
                    {secs.map((section) => {
                      const grant = emp.grants[section];
                      const pg = pages.find((p) => p.key === section);
                      const summary = grant.scopes.map((s) => scopeLabelByKey[s] ?? s).join(' + ');
                      const isAdmin = pg?.kind === 'administrator';
                      return (
                        <div key={section} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1.5">
                          <button type="button" onClick={() => openPanel(emp.id, section)} disabled={pending}
                            title="Ubah lingkup akses ini" className="flex-1 min-w-0 text-left text-[12px] disabled:opacity-50">
                            <span className="font-semibold text-emerald-900">{pageLabelByKey[section] ?? section}</span>
                            <span className="text-emerald-700"> · {summary}</span>
                            <span aria-hidden className="text-emerald-400"> ✎</span>
                          </button>
                          {isAdmin && (
                            <button type="button" onClick={() => toggleEdit(emp, section)} disabled={pending}
                              title={grant.canEdit ? 'Boleh edit — klik untuk jadikan hanya-lihat' : 'Hanya-lihat — klik untuk izinkan edit/finalisasi'}
                              className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border disabled:opacity-50 ${grant.canEdit ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-white text-gray-600 border-gray-300'}`}>
                              {grant.canEdit ? '✎ edit' : '👁 lihat'}
                            </button>
                          )}
                          <button type="button" onClick={() => revokeGrant(emp, section)} disabled={pending}
                            title="Cabut akses ini" aria-label={`Cabut akses ${pageLabelByKey[section] ?? section}`}
                            className="shrink-0 text-rose-500 hover:bg-rose-100 rounded-md p-1 disabled:opacity-50">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
            <button onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">← Sebelumnya</button>
            <span>Halaman {cur + 1} / {pageCount}</span>
            <button onClick={() => setPage(Math.min(pageCount - 1, cur + 1))} disabled={cur >= pageCount - 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Berikutnya →</button>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3 max-w-3xl">
          Lingkup halaman ditegakkan di server (data disaring sesuai pilihan). Semua perubahan tercatat di{' '}
          <span className="font-semibold text-gray-500">Log Aktivitas HRD</span> &amp; tab <span className="font-semibold text-gray-500">Log aktivitas</span>.
        </p>
      </div>
      )}

      {/* ── TAB "Memberikan akses" (lanjutan): Izin Peran & Akses HRD — kapabilitas peran ── */}
      {tab === 'beri' && (
      <div className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-bold text-gray-800 mb-0.5">Izin Peran &amp; Akses HRD</h3>
        <p className="text-[11px] text-gray-500 mb-3 max-w-3xl">
          Kapabilitas peran (bukan grant halaman berlingkup): <strong>HRD Admin</strong> (+ pembatasan bagian lewat
          Atur Akses), <strong>Peninjau Lintas Divisi</strong>, <strong>Koordinator</strong> (+ tim naungan). Default
          menampilkan <strong>pemegang izin</strong>; cari nama untuk memberi/mengubah izin pegawai lain yang memenuhi syarat.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={q3}
            onChange={(e) => setQ3(e.target.value)}
            placeholder="Cari pegawai untuk beri / ubah izin peran…"
            className="w-full sm:w-80 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500 whitespace-nowrap">{roleRows.length} pegawai</span>
        </div>

        {roleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
            {q3.trim() ? 'Tak ada pegawai memenuhi syarat yang cocok.' : 'Belum ada pemegang izin peran. Cari nama untuk memberikan izin.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-semibold">Pegawai</th>
                  <th className="px-3 py-2 font-semibold">Divisi</th>
                  <th className="px-3 py-2 font-semibold">Peran</th>
                  <th className="px-3 py-2 font-semibold">Izin</th>
                </tr>
              </thead>
              <tbody>
                {roleRows.map((emp) => (
                  <tr key={emp.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{emp.name}</div>
                      {msg && msg.id === emp.id && (
                        <div className={`text-[11px] mt-0.5 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{emp.dept}</td>
                    <td className="px-3 py-2 text-gray-600">{ROLE_LABEL[emp.role] ?? emp.role}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {/* HRD Admin — hanya pegawai divisi HRD (kebijakan), bukan direksi/hrd-posisi. */}
                        {emp.role !== 'direksi' && emp.role !== 'hrd' && (isHrdDept(emp.dept) || emp.isHrdAdmin) && (
                          <button type="button" onClick={() => toggleHrd(emp)} disabled={pending}
                            title={emp.isHrdAdmin ? 'Cabut izin HRD Admin' : 'Beri izin HRD Admin'}
                            className={btn(emp.isHrdAdmin, 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100')}>
                            <ShieldCheck className="w-3.5 h-3.5" /> HRD</button>
                        )}
                        {/* Atur Akses per-bagian — hanya pemegang HRD Admin & bukan akun sendiri. */}
                        {emp.isHrdAdmin && emp.id !== meId && (
                          <button type="button" onClick={() => setSectionsDlg({ r: emp, full: !(emp.hrdSections && emp.hrdSections.length > 0), selected: new Set(emp.hrdSections ?? []) })} disabled={pending}
                            title="Atur akses halaman untuk rekan HRD ini"
                            className={btn(!!(emp.hrdSections && emp.hrdSections.length > 0), 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100')}>
                            <SlidersHorizontal className="w-3.5 h-3.5" />{emp.hrdSections && emp.hrdSections.length > 0 ? ` ${emp.hrdSections.length}` : ''}</button>
                        )}
                        {/* Peninjau Lintas Divisi — hanya pegawai divisi HRD. */}
                        {emp.role !== 'direksi' && emp.role !== 'hrd' && (isHrdDept(emp.dept) || emp.isCrossReviewer) && (
                          <button type="button" onClick={() => toggleCross(emp)} disabled={pending}
                            title={emp.isCrossReviewer ? 'Cabut izin Peninjau Lintas Divisi' : 'Beri izin Peninjau Hasil Lintas Divisi'}
                            className={btn(emp.isCrossReviewer, 'text-violet-700 bg-violet-50 hover:bg-violet-100')}>
                            <ScanEye className="w-3.5 h-3.5" /> Peninjau</button>
                        )}
                        {/* Koordinator — hanya pegawai (role employee). */}
                        {emp.role === 'employee' && (
                          <button type="button" onClick={() => toggleCoord(emp)} disabled={pending}
                            title={emp.isCoordinator ? 'Cabut peran Koordinator' : 'Jadikan Koordinator'}
                            className={btn(emp.isCoordinator, 'text-teal-700 bg-teal-50 hover:bg-teal-100')}>
                            <Users className="w-3.5 h-3.5" /> Koord</button>
                        )}
                        {emp.isCoordinator && (
                          <button type="button" onClick={() => setCoordDlg({ r: emp, selected: new Set(teams[emp.id] ?? []), q: '' })} disabled={pending}
                            title="Kelola pegawai yang dinaungi koordinator ini"
                            className={btn(!!teams[emp.id]?.length, 'text-teal-700 bg-teal-50 hover:bg-teal-100')}>
                            <ListChecks className="w-3.5 h-3.5" />{teams[emp.id]?.length ? ` ${teams[emp.id].length}` : ''}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3 max-w-3xl">
          ⚠️ &ldquo;Atur Akses&rdquo; membatasi <strong>tampilan menu</strong> rekan HRD, bukan gembok data. Semua perubahan tercatat di{' '}
          <span className="font-semibold text-gray-500">Log Aktivitas HRD</span> &amp; tab <span className="font-semibold text-gray-500">Log aktivitas</span>.
        </p>
      </div>
      )}

      {/* ── TAB "Log aktivitas": jejak perubahan akses (server-paginated via ?tab=log&logPage=) ── */}
      {tab === 'log' && (
        <AksesLog rows={logRows} page={logPage} pageSize={logPageSize} total={logTotal} />
      )}

      {/* Dialog: Tim Koordinasi */}
      <ConfirmDialog
        open={!!coordDlg}
        icon="👥"
        title={coordDlg ? `Tim Koordinasi — ${coordDlg.r.name}` : ''}
        tone="primary"
        confirmLabel={coordDlg ? `Simpan (${coordDlg.selected.size})` : 'Simpan'}
        busy={pending}
        onConfirm={submitCoord}
        onCancel={() => { if (!pending) setCoordDlg(null); }}
      >
        <p>Pilih pegawai yang dinaungi koordinator ini. Koordinator hanya dapat <strong>melihat</strong> Laporan Kinerja Tim mereka.</p>
        <input
          value={coordDlg?.q ?? ''}
          onChange={(e) => setCoordDlg((c) => (c ? { ...c, q: e.target.value } : c))}
          placeholder="Cari nama / divisi…"
          className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {coordDlg && (() => {
            const term = coordDlg.q.trim().toLowerCase();
            const cands = rows.filter((r) =>
              r.id !== coordDlg.r.id && !r.isExternal && r.role !== 'direksi' &&
              (!term || `${r.name} ${r.dept}`.toLowerCase().includes(term)));
            if (cands.length === 0) return <p className="text-xs text-gray-500 italic p-3">Tidak ada pegawai cocok.</p>;
            return cands.map((r) => {
              const checked = coordDlg.selected.has(r.id);
              return (
                <label key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-teal-50/60' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => setCoordDlg((c) => {
                    if (!c) return c; const s = new Set(c.selected); if (s.has(r.id)) s.delete(r.id); else s.add(r.id); return { ...c, selected: s };
                  })} className="accent-teal-600" />
                  <span className="text-xs text-gray-800 font-semibold">{r.name}</span>
                  <span className="text-[10px] text-gray-500">{r.dept}</span>
                </label>
              );
            });
          })()}
        </div>
      </ConfirmDialog>

      {/* Dialog: Atur Akses HRD (hrd_sections) */}
      <ConfirmDialog
        open={!!sectionsDlg}
        icon="🧩"
        title={sectionsDlg ? `Atur Akses HRD — ${sectionsDlg.r.name}` : ''}
        tone="primary"
        confirmLabel={sectionsDlg ? (sectionsDlg.full ? 'Simpan (Akses penuh)' : `Simpan (${sectionsDlg.selected.size})`) : 'Simpan'}
        busy={pending}
        onConfirm={submitSections}
        onCancel={() => { if (!pending) setSectionsDlg(null); }}
      >
        <p>Batasi halaman admin yang boleh dibuka rekan HRD ini. <strong>Akses penuh</strong> = semua bagian.</p>
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          ⚠️ Ini pembatasan <strong>tampilan menu</strong>, bukan gembok data: pemegang izin HRD tetap bisa
          membaca data lewat cara teknis. Cocok untuk pembagian tugas antar rekan HRD tepercaya.
        </p>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="hrd-scope" checked={!!sectionsDlg?.full}
              onChange={() => setSectionsDlg((d) => (d ? { ...d, full: true } : d))} className="accent-emerald-600" />
            <span className="font-semibold text-gray-800">Akses penuh (semua bagian)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="hrd-scope" checked={!sectionsDlg?.full}
              onChange={() => setSectionsDlg((d) => (d ? { ...d, full: false } : d))} className="accent-emerald-600" />
            <span className="font-semibold text-gray-800">Akses terbatas — centang bagian yang diizinkan:</span>
          </label>
        </div>
        {sectionsDlg && !sectionsDlg.full && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 border border-gray-200 rounded-lg p-2 max-h-64 overflow-y-auto">
            {HRD_SECTIONS.map((s) => {
              const checked = sectionsDlg.selected.has(s);
              return (
                <label key={s} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 ${checked ? 'bg-indigo-50/70' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => setSectionsDlg((d) => {
                    if (!d) return d; const sel = new Set(d.selected); if (sel.has(s)) sel.delete(s); else sel.add(s); return { ...d, selected: sel };
                  })} className="accent-indigo-600" />
                  <span className="text-xs text-gray-800">{HRD_SECTION_LABELS[s as HrdSection]}</span>
                </label>
              );
            })}
          </div>
        )}
      </ConfirmDialog>

      {/* Peringatan: memberi izin EDIT halaman administrator ke PERAN luas (banyak orang sekaligus). */}
      <ConfirmDialog
        open={!!roleConfirm}
        icon="⚠️"
        title="Beri izin edit ke banyak orang?"
        tone="danger"
        confirmLabel={roleConfirm ? `Ya, berikan ke ${roleConfirm.count} orang` : 'Ya, berikan'}
        busy={pending}
        onConfirm={() => roleConfirm && doRoleSave(roleConfirm.roleTarget, roleConfirm.section, roleConfirm.scopes, roleConfirm.canEdit)}
        onCancel={() => { if (!pending) setRoleConfirm(null); }}
      >
        {roleConfirm && (
          <p>Anda akan mengizinkan <strong>SEMUA {GRANT_ROLE_TARGET_LABELS[roleConfirm.roleTarget as GrantRoleTarget]} ({roleConfirm.count} orang)</strong> untuk{' '}
          <strong>meng-edit/finalisasi</strong> halaman <strong>{pages.find((p) => p.key === roleConfirm.section)?.label}</strong>. Ini memberi kemampuan menulis ke banyak orang sekaligus — pastikan memang diinginkan. Lanjutkan?</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
