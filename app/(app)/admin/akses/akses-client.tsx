'use client';

import { useMemo, useState, useTransition } from 'react';
import { ShieldCheck, ScanEye, Users, ListChecks, SlidersHorizontal } from 'lucide-react';
import { setPageGrant, removePageGrant } from './actions';
import { setHrdAdmin, setCrossReviewer, setCoordinator, setCoordinatorTeam, setHrdSections } from '../pegawai/actions';
import { isHrdDept, HRD_SECTIONS, HRD_SECTION_LABELS, type HrdSection } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SearchableSelect } from '@/components/searchable-select';

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
  grants: Record<string, { scopes: string[]; canEdit: boolean }>; // section halaman → { daftar lingkup, boleh-edit }
};
type PageOpt = { key: string; label: string; kind: string }; // kind: 'pemantauan' | 'administrator'
type ScopeOpt = { key: string; label: string };

const ROLE_LABEL: Record<string, string> = { employee: 'Pegawai', spv: 'SPV', hrd: 'HRD', direksi: 'Direksi' };
const PAGE_SIZE = 12;

/**
 * Konsol Manajemen Akses — SATU tempat mengatur seluruh akses/izin pegawai (dipindah dari Kelola
 * Pegawai): (1) grant HALAMAN ber-lingkup (mis. Monitor: semua/satu/selain divisi); (2) izin peran —
 * HRD Admin (+ Atur Akses per-bagian), Peninjau Lintas Divisi, Koordinator (+ Tim). Perubahan
 * optimistis di state lokal + pesan status per baris; pencarian & paginasi sisi-klien.
 */
export function AksesClient({
  employees, pages, scopes, coordTeams: initialTeams, meId,
}: {
  employees: AksesEmployee[]; pages: PageOpt[]; scopes: ScopeOpt[]; coordTeams: Record<string, string[]>; meId: string;
}) {
  const [rows, setRows] = useState(employees);
  const [teams, setTeams] = useState<Record<string, string[]>>(initialTeams);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [coordDlg, setCoordDlg] = useState<{ r: AksesEmployee; selected: Set<string>; q: string } | null>(null);
  const [sectionsDlg, setSectionsDlg] = useState<{ r: AksesEmployee; full: boolean; selected: Set<string> } | null>(null);
  // ── Card "Tambah akses baru" + panel kanan ──
  const [addEmp, setAddEmp] = useState('');   // employee_id terpilih di card
  const [addPage, setAddPage] = useState(''); // section halaman terpilih di card
  // Panel: lingkup = MULTI (Diri sendiri / Divisi sendiri / Divisi lain / Semua pegawai), dari daftar
  // `scopes`. Checkbox boleh >1; "Semua pegawai" menyerap → mengosongkan lingkup lain.
  const [panel, setPanel] = useState<{ empId: string; section: string; scopes: string[]; canEdit: boolean } | null>(null);
  const [panelMsg, setPanelMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((e) => e.name.toLowerCase().includes(s) || e.dept.toLowerCase().includes(s) || (ROLE_LABEL[e.role] ?? e.role).toLowerCase().includes(s));
  }, [rows, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount - 1);
  const shown = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

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

  // ── Card "Tambah akses baru" + panel kanan ──────────────────────────────────
  const empOptions = useMemo(
    () => rows.map((r) => ({ value: r.id, label: `${r.name} — ${r.dept}` })),
    [rows],
  );
  const scopeLabelByKey = useMemo(() => Object.fromEntries(scopes.map((s) => [s.key, s.label])), [scopes]);
  const panelEmp = panel ? rows.find((r) => r.id === panel.empId) ?? null : null;
  const panelPage = panel ? pages.find((p) => p.key === panel.section) ?? null : null;

  /** Buka panel untuk (pegawai, halaman) — dari card (default) atau dari sel tabel. Prefill grant existing. */
  function openPanel(empId: string = addEmp, section: string = addPage) {
    const emp = rows.find((r) => r.id === empId);
    if (!emp || !section) return;
    const g = emp.grants[section];
    setPanel({ empId, section, scopes: g?.scopes ?? [], canEdit: !!g?.canEdit });
    setPanelMsg(null);
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
    const emp = rows.find((r) => r.id === panel.empId);
    if (!emp) return;
    const section = panel.section;
    // Halaman pemantauan selalu lihat-saja → paksa canEdit=false (server juga menormalkan).
    const kind = pages.find((p) => p.key === section)?.kind;
    const canEdit = kind === 'administrator' ? panel.canEdit : false;
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
      {/* ── Tambah akses baru: card (kiri) + panel pengaturan (kanan) ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        {/* Kiri: pilih pegawai + halaman */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-0.5">Tambah akses baru</h3>
          <p className="text-[11px] text-gray-500 mb-3">Pilih pegawai dan halaman, lalu atur lingkup & izinnya di panel kanan.</p>
          <div className="space-y-3">
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
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Halaman/fitur</label>
              <select
                value={addPage}
                onChange={(e) => setAddPage(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">— pilih halaman —</option>
                {pages.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => openPanel()}
              disabled={!addEmp || !addPage || pending}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <SlidersHorizontal className="w-4 h-4" /> Atur akses →
            </button>
          </div>
        </div>

        {/* Kanan: panel pengaturan lingkup + izin */}
        <div className="rounded-2xl border border-gray-200 p-4">
          {!panel || !panelEmp || !panelPage ? (
            <div className="h-full flex items-center justify-center text-center text-[12px] text-gray-400 italic py-8">
              Pilih pegawai &amp; halaman, lalu klik <span className="font-semibold text-gray-500">&nbsp;Atur akses&nbsp;</span> untuk menampilkan pengaturan lingkup &amp; izin di sini.
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">{panelPage.label}</h3>
                  <p className="text-[11px] text-gray-500">{panelEmp.name} · {panelEmp.dept}</p>
                </div>
                <button type="button" onClick={() => { setPanel(null); setPanelMsg(null); }} className="text-[11px] text-gray-400 hover:text-gray-600">Tutup</button>
              </div>

              {/* Lingkup data — MULTI (boleh >1). "Semua pegawai" menyerap → mematikan lingkup lain. */}
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-gray-600 mb-1.5">Lingkup data <span className="font-normal text-gray-400">(boleh lebih dari satu)</span></p>
                <div className="space-y-1.5">
                  {scopes.map((s) => {
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
                {panelEmp.grants[panel.section] && (
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

      <div className="flex items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }}
          placeholder="Cari nama, divisi, atau peran…"
          className="w-full sm:w-80 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <span className="text-xs text-gray-500 whitespace-nowrap">{filtered.length} pegawai</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-semibold">Pegawai</th>
              <th className="px-3 py-2 font-semibold">Divisi</th>
              <th className="px-3 py-2 font-semibold">Peran</th>
              {pages.map((p) => (
                <th key={p.key} className="px-3 py-2 font-semibold">{p.label}</th>
              ))}
              <th className="px-3 py-2 font-semibold">Izin Peran</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((emp) => (
              <tr key={emp.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800">{emp.name}</div>
                  {msg && msg.id === emp.id && (
                    <div className={`text-[11px] mt-0.5 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{emp.dept}</td>
                <td className="px-3 py-2 text-gray-600">{ROLE_LABEL[emp.role] ?? emp.role}</td>
                {pages.map((p) => {
                  const grant = emp.grants[p.key];
                  const hasGrant = !!grant && grant.scopes.length > 0;
                  const summary = hasGrant ? grant!.scopes.map((s) => scopeLabelByKey[s] ?? s).join(' + ') : null;
                  return (
                  <td key={p.key} className="px-3 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <button type="button" onClick={() => openPanel(emp.id, p.key)} disabled={pending}
                        title={hasGrant ? 'Ubah akses' : 'Beri akses'}
                        className={`text-left text-[11px] rounded-lg border px-2 py-1 disabled:opacity-50 ${hasGrant ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                        {hasGrant ? <>{summary} <span aria-hidden>✎</span></> : '— beri akses'}
                      </button>
                      {/* Halaman administrator (mis. Review Hasil Akhir): status + toggle boleh-edit/hanya-lihat. */}
                      {p.kind === 'administrator' && hasGrant && (
                        <button type="button" onClick={() => toggleEdit(emp, p.key)} disabled={pending}
                          title={grant!.canEdit ? 'Sedang: boleh edit — klik untuk jadikan hanya-lihat' : 'Sedang: hanya-lihat — klik untuk izinkan edit/finalisasi'}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border disabled:opacity-50 ${grant!.canEdit ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-gray-50 text-gray-600 border-gray-300'}`}>
                          {grant!.canEdit ? '✎ Boleh edit' : '👁 Hanya lihat'}
                        </button>
                      )}
                    </div>
                  </td>
                  );
                })}
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
                    {/* Tak ada izin yang berlaku untuk baris ini. */}
                    {emp.role === 'hrd' && <span className="text-[11px] text-gray-400 italic">HRD (posisi)</span>}
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={4 + pages.length} className="px-3 py-6 text-center text-gray-500">Tak ada pegawai cocok.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
        <span className="font-semibold text-gray-500">Log Aktivitas HRD</span> & terangkum di tabel Audit Akses di bawah.
      </p>

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
    </div>
  );
}
