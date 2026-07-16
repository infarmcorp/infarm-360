'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { UserPlus, Pencil, KeyRound, Power, X, ShieldCheck, ScanEye, Users, ListChecks } from 'lucide-react';
import { createEmployee, updateEmployee, setEmployeeActive, resetPassword, setHrdAdmin, setCrossReviewer, setCoordinator, setCoordinatorTeam } from './actions';
import { isHrdDept } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/confirm-dialog';

export type Role = 'employee' | 'spv' | 'hrd' | 'direksi';
export type EmpRow = {
  id: string; empCode: string; name: string; dept: string; role: Role;
  isHrdAdmin: boolean; isExternal: boolean; isCrossReviewer: boolean; isCoordinator: boolean; active: boolean; email: string; spvId: string | null; spvName: string | null;
  joinedOn: string | null; leftOn: string | null; // tgl masuk/aktif & tgl nonaktif (YYYY-MM-DD)
};
export type SpvOpt = { id: string; name: string; dept: string; role: Role };

const ROLE_LABEL: Record<Role, string> = { employee: 'Pegawai', spv: 'Supervisor', hrd: 'HRD Admin', direksi: 'Direksi' };
const ROLE_OPTS: Role[] = ['employee', 'spv', 'hrd', 'direksi'];

/**
 * Saran kode pegawai berikutnya: lanjutkan SKEMA yang sudah dipakai (apa pun bentuknya,
 * mis. EMP010 → EMP011, FT2026-100 → FT2026-101) dengan menaikkan gugus angka terakhir
 * sambil mempertahankan awalan & lebar nol. Kosong bila belum ada data → HRD isi sendiri.
 */
function nextCode(codes: string[]): string {
  const list = codes.filter(Boolean);
  if (!list.length) return '';
  const latest = list.slice().sort().at(-1)!;
  const m = latest.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return '';
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') + m[3];
}

type FormState = {
  id: string | null; name: string; empCode: string; dept: string; role: Role;
  email: string; password: string; spvId: string; isExternal: boolean;
  joinedOn: string; leftOn: string; // '' = tak diisi
};
const EMPTY: FormState = { id: null, name: '', empCode: '', dept: '', role: 'employee', email: '', password: '', spvId: '', isExternal: false, joinedOn: '', leftOn: '' };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '.');
const randPass = () => 'Inf' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89);
const todayStr = () => new Date().toISOString().slice(0, 10);
/** Format 'YYYY-MM-DD' → 'DD/MM/YYYY' tanpa konversi zona waktu (aman utk date-only). */
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export function PegawaiClient({ rows, spvs, depts, coordTeams }: { rows: EmpRow[]; spvs: SpvOpt[]; depts: string[]; coordTeams: Record<string, string[]> }) {
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState<'all' | Role>('all');
  const [fStatus, setFStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [fDept, setFDept] = useState('all');
  const [form, setForm] = useState<FormState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [reset, setReset] = useState<{ r: EmpRow; pw: string } | null>(null); // dialog reset sandi
  const [coordTeam, setCoordTeam] = useState<{ r: EmpRow; selected: Set<string>; q: string } | null>(null); // dialog tim koordinator
  const [pending, start] = useTransition();
  // Gulir ke form saat dibuka (tambah/edit) — form dirender di atas, jadi tanpa ini
  // edit baris bawah membuat form muncul di luar layar. openTick memicu efek tiap buka.
  const formRef = useRef<HTMLFormElement>(null);
  const [openTick, setOpenTick] = useState(0);
  useEffect(() => {
    if (openTick) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openTick]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.active).length,
    spv: rows.filter((r) => r.role === 'spv').length,
  }), [rows]);

  const allCodes = useMemo(() => rows.map((r) => r.empCode), [rows]);

  // Deteksi duplikat di UI (server tetap penegak akhir): kode/email yang sudah dipakai
  // pegawai LAIN (kecuali baris yang sedang diedit).
  const dupCode = useMemo(() => {
    if (!form) return null;
    const code = form.empCode.trim().toUpperCase();
    if (!code) return null;
    return rows.find((r) => r.id !== form.id && r.empCode.toUpperCase() === code) ?? null;
  }, [form, rows]);
  const dupEmail = useMemo(() => {
    if (!form) return null;
    const email = form.email.trim().toLowerCase();
    if (!email) return null;
    return rows.find((r) => r.id !== form.id && r.email.toLowerCase() === email) ?? null;
  }, [form, rows]);

  const shown = rows.filter((r) => {
    if (q.trim() && !`${r.name} ${r.empCode} ${r.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fRole !== 'all' && r.role !== fRole) return false;
    if (fDept !== 'all' && r.dept !== fDept) return false;
    if (fStatus === 'active' && !r.active) return false;
    if (fStatus === 'inactive' && r.active) return false;
    return true;
  });

  function openAdd() {
    setToast(null);
    setForm({ ...EMPTY, empCode: nextCode(allCodes), joinedOn: todayStr() });
    setOpenTick((n) => n + 1);
  }
  function openEdit(r: EmpRow) {
    setToast(null);
    setForm({ id: r.id, name: r.name, empCode: r.empCode, dept: r.dept, role: r.role, email: r.email, password: '', spvId: r.spvId ?? '', isExternal: r.isExternal, joinedOn: r.joinedOn ?? '', leftOn: r.leftOn ?? '' });
    setOpenTick((n) => n + 1);
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [k]: v };
      // Saat menambah (belum ada id): auto-isi email dari nama (kode tak bergantung peran).
      if (k === 'name' && !f.id && (!f.email || f.email.endsWith('@infarm.test'))) {
        const s = slug(v as string);
        next.email = s ? `${s}@infarm.test` : '';
      }
      return next;
    });
  }

  function act(fn: () => Promise<{ ok: boolean; msg?: string; error?: string }>, closeForm = false) {
    setToast(null);
    start(async () => {
      const res = await fn();
      setToast(res.ok ? { ok: true, text: res.msg ?? 'Berhasil.' } : { ok: false, text: res.error ?? 'Gagal.' });
      if (res.ok && closeForm) setForm(null);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (dupCode) { setToast({ ok: false, text: `Kode ${form.empCode.toUpperCase()} sudah dipakai oleh ${dupCode.name}.` }); return; }
    if (dupEmail) { setToast({ ok: false, text: `Email ${form.email} sudah dipakai oleh ${dupEmail.name}.` }); return; }
    const spvId = form.spvId || null;
    if (form.id) {
      act(() => updateEmployee({ id: form.id, name: form.name, empCode: form.empCode, dept: form.dept, role: form.role, email: form.email, spvId, isExternal: form.isExternal, joinedOn: form.joinedOn, leftOn: form.leftOn }), true);
    } else {
      act(() => createEmployee({ name: form.name, empCode: form.empCode, dept: form.dept, role: form.role, email: form.email, password: form.password, spvId, isExternal: form.isExternal, joinedOn: form.joinedOn }), true);
    }
  }

  function doReset(r: EmpRow) {
    setToast(null);
    setReset({ r, pw: randPass() });
  }
  function openCoordTeam(r: EmpRow) {
    setToast(null);
    setCoordTeam({ r, selected: new Set(coordTeams[r.id] ?? []), q: '' });
  }
  function toggleMember(id: string) {
    setCoordTeam((c) => {
      if (!c) return c;
      const s = new Set(c.selected);
      if (s.has(id)) s.delete(id); else s.add(id);
      return { ...c, selected: s };
    });
  }
  function submitCoordTeam() {
    if (!coordTeam) return;
    const { r, selected } = coordTeam;
    setCoordTeam(null);
    act(() => setCoordinatorTeam(r.id, [...selected]));
  }
  function submitReset() {
    if (!reset) return;
    if (reset.pw.trim().length < 6) { setToast({ ok: false, text: 'Sandi minimal 6 karakter.' }); return; }
    const { r, pw } = reset;
    setReset(null);
    act(() => resetPassword(r.id, pw.trim()));
  }

  return (
    <div className="space-y-4">
      {/* Stats + tambah */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Stat label="Total" value={stats.total} c="text-slate-800" />
          <Stat label="Aktif" value={stats.active} c="text-emerald-700" />
          <Stat label="Supervisor" value={stats.spv} c="text-indigo-700" />
        </div>
        {!form && (
          <button type="button" onClick={openAdd}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white">
            <UserPlus className="w-4 h-4" /> Tambah Pegawai
          </button>
        )}
      </div>

      {/* Form tambah/edit */}
      {form && (
        <form ref={formRef} onSubmit={submit} className="scroll-mt-20 border border-emerald-200 bg-emerald-50/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">{form.id ? 'Ubah Pegawai' : 'Tambah Pegawai Baru'}</h2>
            <button type="button" onClick={() => setForm(null)} className="text-gray-500 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama Lengkap">
              <input value={form.name} onChange={(e) => set('name', e.target.value)} required
                className="inp" placeholder="mis. Andi Pratama" />
            </Field>
            <Field label="Peran">
              <select value={form.role} onChange={(e) => set('role', e.target.value as Role)} className="inp bg-white">
                {ROLE_OPTS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
            <Field label="Divisi">
              <input value={form.dept} onChange={(e) => set('dept', e.target.value)} required list="dept-list"
                className="inp" placeholder="mis. Operasional" />
              <datalist id="dept-list">{depts.map((d) => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Kode Pegawai">
              <input value={form.empCode} onChange={(e) => set('empCode', e.target.value.toUpperCase())} required
                className={`inp font-mono ${dupCode ? 'border-rose-400 ring-1 ring-rose-300' : ''}`} placeholder="mis. FT2021-001" />
              {dupCode
                ? <span className="block text-[10px] text-rose-600 font-semibold mt-0.5">⚠ Kode sudah dipakai oleh {dupCode.name} ({dupCode.dept}).</span>
                : <span className="block text-[10px] text-gray-500 mt-0.5">Bebas mengikuti skema perusahaan; saran melanjutkan nomor terakhir.</span>}
            </Field>
            <Field label="Email (boleh placeholder)">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required
                className={`inp ${dupEmail ? 'border-rose-400 ring-1 ring-rose-300' : ''}`} placeholder="nama@infarm.test" />
              {dupEmail && <span className="block text-[10px] text-rose-600 font-semibold mt-0.5">⚠ Email sudah dipakai oleh {dupEmail.name}.</span>}
            </Field>
            {!form.id && (
              <Field label="Sandi Awal">
                <div className="flex gap-1.5">
                  <input value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={6}
                    className="inp flex-1" placeholder="min. 6 karakter" />
                  <button type="button" onClick={() => set('password', randPass())}
                    className="text-[11px] font-bold px-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0">Acak</button>
                </div>
              </Field>
            )}
            <Field label="Atasan / SPV (opsional)">
              <select value={form.spvId} onChange={(e) => set('spvId', e.target.value)} className="inp bg-white">
                <option value="">— Tanpa atasan —</option>
                {spvs.filter((s) => s.id !== form.id).map((s) => <option key={s.id} value={s.id}>{s.name} · {ROLE_LABEL[s.role]} · {s.dept}</option>)}
              </select>
            </Field>
            <Field label="Tanggal Masuk / Aktif">
              <input type="date" value={form.joinedOn} onChange={(e) => set('joinedOn', e.target.value)} className="inp" />
              <span className="block text-[10px] text-gray-500 mt-0.5">{form.id ? 'Dapat dikoreksi ke tanggal masuk sebenarnya.' : 'Default hari ini; ubah bila tanggal masuk berbeda.'}</span>
            </Field>
            {form.id && (
              <Field label="Tanggal Nonaktif (opsional)">
                <input type="date" value={form.leftOn} onChange={(e) => set('leftOn', e.target.value)} min={form.joinedOn || undefined} className="inp" />
                <span className="block text-[10px] text-gray-500 mt-0.5">
                  Terisi otomatis saat dinonaktifkan; kosongkan bila masih aktif. {form.leftOn ? 'Koreksi ke tanggal keluar sebenarnya.' : ''}
                </span>
              </Field>
            )}
            <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 cursor-pointer">
              <input type="checkbox" checked={form.isExternal} onChange={(e) => set('isExternal', e.target.checked)} className="mt-0.5 accent-amber-600" />
              <span className="text-[11px] text-amber-900 leading-snug">
                <span className="font-bold">Penilai eksternal</span> (vendor/freelance/mitra) — hanya <strong>menilai</strong> pegawai
                (relasi Cross), <strong>tanpa</strong> KPI/Skor Akhir/laporan & disembunyikan dari dashboard. Bukan untuk pegawai internal Infarm.
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={pending || !!dupCode || !!dupEmail}
              className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
              {pending ? 'Menyimpan…' : form.id ? 'Simpan Perubahan' : 'Buat Pegawai'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="text-xs font-semibold text-gray-500 hover:underline">Batal</button>
          </div>
        </form>
      )}

      {toast && <p className={`text-xs font-semibold ${toast.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{toast.text}</p>}

      {/* Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kode, email…"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg flex-1 min-w-[160px] focus:outline-none focus:ring-1 focus:ring-emerald-600" />
        <select value={fRole} onChange={(e) => setFRole(e.target.value as typeof fRole)} className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white">
          <option value="all">Semua Peran</option>
          {ROLE_OPTS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <select value={fDept} onChange={(e) => setFDept(e.target.value)} className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white">
          <option value="all">Semua Divisi</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white">
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[760px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3">Pegawai</th>
              <th className="py-2 px-3">Divisi</th>
              <th className="py-2 px-3">Peran</th>
              <th className="py-2 px-3">Atasan</th>
              <th className="py-2 px-3">Masa Aktif</th>
              <th className="py-2 px-3 text-center">Status</th>
              <th className="py-2 pl-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-sm text-gray-500">Tidak ada pegawai sesuai filter.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'opacity-55'}>
                <td className="py-3 pr-3">
                  <span className="font-bold text-gray-800 block">{r.name}</span>
                  <span className="text-[11px] text-gray-500 font-mono">{r.empCode}{r.email ? ` · ${r.email}` : ''}</span>
                </td>
                <td className="py-3 px-3 text-xs text-gray-600">{r.dept}</td>
                <td className="py-3 px-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{ROLE_LABEL[r.role]}</span>
                  {r.isHrdAdmin && r.role !== 'hrd' && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700" title="Punya izin HRD Admin (grant)"><ShieldCheck className="w-2.5 h-2.5" /> HRD</span>
                  )}
                  {r.isExternal && (
                    <span className="ml-1 inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800" title="Penilai eksternal (vendor/freelance) — hanya menilai, bukan dinilai">Eksternal</span>
                  )}
                  {r.isCrossReviewer && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700" title="Peninjau Hasil Lintas Divisi — boleh meringkas hasil divisi LAIN (bukan divisinya sendiri)"><ScanEye className="w-2.5 h-2.5" /> Peninjau</span>
                  )}
                  {r.isCoordinator && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700" title="Koordinator — lihat Laporan Kinerja Tim untuk pegawai yang dinaunginya"><Users className="w-2.5 h-2.5" /> Koordinator{coordTeams[r.id]?.length ? ` (${coordTeams[r.id].length})` : ''}</span>
                  )}
                </td>
                <td className="py-3 px-3 text-xs text-gray-500">{r.spvName ?? '—'}</td>
                <td className="py-3 px-3 text-[11px] text-gray-600 whitespace-nowrap">
                  <span title="Tanggal masuk / aktif">↳ {fmtDate(r.joinedOn)}</span>
                  {r.leftOn && <span className="block text-rose-600" title="Tanggal nonaktif">⇥ {fmtDate(r.leftOn)}</span>}
                </td>
                <td className="py-3 px-3 text-center">
                  {r.active
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Aktif</span>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Nonaktif</span>}
                </td>
                <td className="py-3 pl-3 text-right whitespace-nowrap">
                  <button type="button" onClick={() => openEdit(r)} disabled={pending} title="Ubah"
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-60"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => doReset(r)} disabled={pending} title="Reset sandi"
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"><KeyRound className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => act(() => setEmployeeActive(r.id, !r.active))} disabled={pending}
                    title={r.active ? 'Nonaktifkan' : 'Aktifkan'}
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-60 ${r.active ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}><Power className="w-3.5 h-3.5" /></button>
                  {/* Grant HRD Admin & Peninjau HANYA untuk pegawai divisi HRD (kebijakan). Tetap
                      tampil bila terlanjur ter-grant di divisi lain, agar bisa DICABUT. */}
                  {r.role !== 'direksi' && r.role !== 'hrd' && (isHrdDept(r.dept) || r.isHrdAdmin) && (
                    <button type="button" onClick={() => act(() => setHrdAdmin(r.id, !r.isHrdAdmin))} disabled={pending}
                      title={r.isHrdAdmin ? 'Cabut izin HRD Admin' : 'Beri izin HRD Admin'}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-60 ${r.isHrdAdmin ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100' : 'text-gray-500 hover:bg-gray-100'}`}><ShieldCheck className="w-3.5 h-3.5" /></button>
                  )}
                  {r.role !== 'direksi' && r.role !== 'hrd' && (isHrdDept(r.dept) || r.isCrossReviewer) && (
                    <button type="button" onClick={() => act(() => setCrossReviewer(r.id, !r.isCrossReviewer))} disabled={pending}
                      title={r.isCrossReviewer ? 'Cabut izin Peninjau Lintas Divisi' : 'Beri izin Peninjau Hasil Lintas Divisi (meringkas hasil divisi lain)'}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-60 ${r.isCrossReviewer ? 'text-violet-700 bg-violet-50 hover:bg-violet-100' : 'text-gray-500 hover:bg-gray-100'}`}><ScanEye className="w-3.5 h-3.5" /></button>
                  )}
                  {r.role === 'employee' && (
                    <button type="button" onClick={() => act(() => setCoordinator(r.id, !r.isCoordinator))} disabled={pending}
                      title={r.isCoordinator ? 'Cabut peran Koordinator' : 'Jadikan Koordinator (lihat Laporan Kinerja Tim pegawai yang dinaunginya)'}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-60 ${r.isCoordinator ? 'text-teal-700 bg-teal-50 hover:bg-teal-100' : 'text-gray-500 hover:bg-gray-100'}`}><Users className="w-3.5 h-3.5" /></button>
                  )}
                  {r.isCoordinator && (
                    <button type="button" onClick={() => openCoordTeam(r)} disabled={pending}
                      title="Kelola pegawai yang dinaungi koordinator ini"
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg text-teal-700 hover:bg-teal-50 disabled:opacity-60"><ListChecks className="w-3.5 h-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-500 italic">
        Nonaktif mengunci akun (tak bisa login) tanpa menghapus riwayat penilaian/KPI. Email boleh placeholder dan diganti kapan saja lewat “Ubah”.
      </p>

      <ConfirmDialog
        open={!!reset}
        icon="🔑"
        title={reset ? `Reset sandi — ${reset.r.name}` : ''}
        tone="primary"
        confirmLabel="Setel Sandi"
        busy={pending}
        onConfirm={submitReset}
        onCancel={() => { if (!pending) setReset(null); }}
      >
        <p>Setel sandi baru untuk pegawai ini. Disarankan pegawai menggantinya sendiri setelah login lewat <strong>Akun Saya</strong>.</p>
        <div className="flex gap-1.5">
          <input
            value={reset?.pw ?? ''}
            onChange={(e) => setReset((s) => (s ? { ...s, pw: e.target.value } : s))}
            minLength={6}
            placeholder="min. 6 karakter"
            className="flex-1 text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          <button type="button" onClick={() => setReset((s) => (s ? { ...s, pw: randPass() } : s))}
            className="text-[11px] font-bold px-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0">Acak</button>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!coordTeam}
        icon="👥"
        title={coordTeam ? `Tim Koordinasi — ${coordTeam.r.name}` : ''}
        tone="primary"
        confirmLabel={coordTeam ? `Simpan (${coordTeam.selected.size})` : 'Simpan'}
        busy={pending}
        onConfirm={submitCoordTeam}
        onCancel={() => { if (!pending) setCoordTeam(null); }}
      >
        <p>Pilih pegawai yang dinaungi koordinator ini. Koordinator hanya dapat <strong>melihat</strong> Laporan Kinerja Tim mereka (tanpa input KPI/ACC).</p>
        <input
          value={coordTeam?.q ?? ''}
          onChange={(e) => setCoordTeam((c) => (c ? { ...c, q: e.target.value } : c))}
          placeholder="Cari nama / kode / divisi…"
          className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {coordTeam && (() => {
            const term = coordTeam.q.trim().toLowerCase();
            const cands = rows.filter((r) =>
              r.id !== coordTeam.r.id && !r.isExternal && r.role !== 'direksi' &&
              (!term || `${r.name} ${r.empCode} ${r.dept}`.toLowerCase().includes(term)));
            if (cands.length === 0) return <p className="text-xs text-gray-500 italic p-3">Tidak ada pegawai cocok.</p>;
            return cands.map((r) => {
              const checked = coordTeam.selected.has(r.id);
              return (
                <label key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-teal-50/60' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleMember(r.id)} className="accent-teal-600" />
                  <span className="text-xs text-gray-800 font-semibold">{r.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{r.empCode} · {r.dept}</span>
                  {!r.active && <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">nonaktif</span>}
                </label>
              );
            });
          })()}
        </div>
      </ConfirmDialog>

      <style>{`.inp{width:100%;font-size:.8rem;padding:.5rem .65rem;border:1px solid #d1d5db;border-radius:.5rem;outline:none}.inp:focus{box-shadow:0 0 0 2px #047857}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, c }: { label: string; value: number; c: string }) {
  return (
    <div className="border border-gray-200 rounded-xl px-3 py-2 text-center min-w-[72px]">
      <div className={`text-lg font-black font-mono ${c}`}>{value}</div>
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
