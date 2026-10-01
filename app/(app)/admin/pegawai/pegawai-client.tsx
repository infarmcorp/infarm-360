'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { colPercents } from '@/lib/table-cols';
import { UserPlus, Pencil, KeyRound, Power, X } from 'lucide-react';
import { createEmployee, updateEmployee, setEmployeeActive, resetPassword } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { usePager, Pager } from '@/components/table-controls';
import { Panel } from '@/components/panel';
import { Button } from '@/components/button';
import { DatePicker } from '@/components/date-picker';

export type Role = 'employee' | 'spv' | 'hrd' | 'direksi';
export type EmpRow = {
  id: string; empCode: string; name: string; nickname: string | null; dept: string; role: Role;
  isHrdAdmin: boolean; isExternal: boolean; isCoordinator: boolean; hrdSections: string[] | null; active: boolean; email: string; spvId: string | null; spvName: string | null;
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
  id: string | null; name: string; nickname: string; empCode: string; dept: string; role: Role;
  email: string; password: string; spvId: string; isExternal: boolean;
  joinedOn: string; leftOn: string; // '' = tak diisi
};
const EMPTY: FormState = { id: null, name: '', nickname: '', empCode: '', dept: '', role: 'employee', email: '', password: '', spvId: '', isExternal: false, joinedOn: '', leftOn: '' };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '.');
const randPass = () => 'Inf' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89);
const todayStr = () => new Date().toISOString().slice(0, 10);
/** Format 'YYYY-MM-DD' → 'DD/MM/YYYY' tanpa konversi zona waktu (aman utk date-only). */
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export function PegawaiClient({ rows, spvs, depts }: { rows: EmpRow[]; spvs: SpvOpt[]; depts: string[] }) {
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState<'all' | Role>('all');
  // Default AKTIF: daftar kerja sehari-hari adalah pegawai yang masih bekerja. Pegawai nonaktif
  // tak pernah dihapus (riwayat penilaian/KPI-nya dipertahankan) sehingga daftarnya terus
  // bertambah — menampilkannya secara default hanya memanjangkan halaman. Pilihan "Semua Status"
  // / "Nonaktif" tetap tersedia di filter.
  const [fStatus, setFStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [fDept, setFDept] = useState('all');
  const [form, setForm] = useState<FormState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [reset, setReset] = useState<{ r: EmpRow; pw: string } | null>(null); // dialog reset sandi
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
  // Paginasi 5-baris (komponen bersama) → daftar pegawai bisa 100+.
  const { page, setPage, pageCount, shown: paged, total, rangeFrom, rangeTo } = usePager(shown);

  function openAdd() {
    setToast(null);
    setForm({ ...EMPTY, empCode: nextCode(allCodes), joinedOn: todayStr() });
    setOpenTick((n) => n + 1);
  }
  function openEdit(r: EmpRow) {
    setToast(null);
    setForm({ id: r.id, name: r.name, nickname: r.nickname ?? '', empCode: r.empCode, dept: r.dept, role: r.role, email: r.email, password: '', spvId: r.spvId ?? '', isExternal: r.isExternal, joinedOn: r.joinedOn ?? '', leftOn: r.leftOn ?? '' });
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
      act(() => updateEmployee({ id: form.id, name: form.name, nickname: form.nickname, empCode: form.empCode, dept: form.dept, role: form.role, email: form.email, spvId, isExternal: form.isExternal, joinedOn: form.joinedOn, leftOn: form.leftOn }), true);
    } else {
      act(() => createEmployee({ name: form.name, nickname: form.nickname, empCode: form.empCode, dept: form.dept, role: form.role, email: form.email, password: form.password, spvId, isExternal: form.isExternal, joinedOn: form.joinedOn }), true);
    }
  }

  function doReset(r: EmpRow) {
    setToast(null);
    setReset({ r, pw: randPass() });
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
          <Stat label="Total" value={stats.total} c="text-ink" />
          <Stat label="Aktif" value={stats.active} c="text-brand-ink" />
          <Stat label="Supervisor" value={stats.spv} c="text-ink" />
        </div>
        {!form && (
          <Button type="button" size="sm" onClick={openAdd}>
            <UserPlus className="w-4 h-4" /> Tambah Pegawai
          </Button>
        )}
      </div>

      {/* Form tambah/edit */}
      {form && (
        <form ref={formRef} onSubmit={submit} className="scroll-mt-20 rounded-panel border border-brand/25 bg-brand-tint/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">{form.id ? 'Ubah Pegawai' : 'Tambah Pegawai Baru'}</h2>
            <button type="button" onClick={() => setForm(null)} className="text-ink-faint hover:text-ink-soft"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama Lengkap">
              <input value={form.name} onChange={(e) => set('name', e.target.value)} required
                className="inp" placeholder="mis. Andi Pratama" />
            </Field>
            <Field label="Nama Panggilan (opsional)">
              <input value={form.nickname} onChange={(e) => set('nickname', e.target.value)} maxLength={30}
                className="inp" placeholder="mis. Andi — untuk tampilan ringkas" />
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
                className={`inp data-value ${dupCode ? 'border-danger-ink ring-2 ring-danger-tint' : ''}`} placeholder="mis. FT2021-001" />
              {dupCode
                ? <span className="block text-[10px] text-danger-ink font-semibold mt-0.5">⚠ Kode sudah dipakai oleh {dupCode.name} ({dupCode.dept}).</span>
                : <span className="block text-[10px] text-ink-faint mt-0.5">Bebas mengikuti skema perusahaan; saran melanjutkan nomor terakhir.</span>}
            </Field>
            <Field label="Email (boleh placeholder)">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required
                className={`inp ${dupEmail ? 'border-danger-ink ring-2 ring-danger-tint' : ''}`} placeholder="nama@infarm.test" />
              {dupEmail && <span className="block text-[10px] text-danger-ink font-semibold mt-0.5">⚠ Email sudah dipakai oleh {dupEmail.name}.</span>}
            </Field>
            {!form.id && (
              <Field label="Sandi Awal">
                <div className="flex gap-1.5">
                  <input value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={6}
                    className="inp flex-1" placeholder="min. 6 karakter" />
                  <button type="button" onClick={() => set('password', randPass())}
                    className="text-[11px] font-semibold px-2 rounded-control bg-surface border border-line text-ink-soft hover:text-ink hover:border-line-strong shrink-0">Acak</button>
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
              <DatePicker value={form.joinedOn} onChange={(v) => set('joinedOn', v)} allowClear ariaLabel="Pilih tanggal masuk" />
              <span className="block text-[10px] text-ink-faint mt-0.5">{form.id ? 'Dapat dikoreksi ke tanggal masuk sebenarnya.' : 'Default hari ini; ubah bila tanggal masuk berbeda.'}</span>
            </Field>
            {form.id && (
              <Field label="Tanggal Nonaktif (opsional)">
                <DatePicker value={form.leftOn} onChange={(v) => set('leftOn', v)} min={form.joinedOn || undefined}
                  allowClear placeholder="— Masih aktif —" ariaLabel="Pilih tanggal nonaktif" />
                <span className="block text-[10px] text-ink-faint mt-0.5">
                  Terisi otomatis saat dinonaktifkan; kosongkan bila masih aktif. {form.leftOn ? 'Koreksi ke tanggal keluar sebenarnya.' : ''}
                </span>
              </Field>
            )}
            <label className="sm:col-span-2 flex items-start gap-2 rounded-control border border-warn-ink/25 bg-warn-tint/60 p-2.5 cursor-pointer">
              <input type="checkbox" checked={form.isExternal} onChange={(e) => set('isExternal', e.target.checked)} className="mt-0.5 accent-warn-ink" />
              <span className="text-[11px] text-warn-ink leading-snug">
                <span className="font-bold">Penilai eksternal</span> (vendor/freelance/mitra) — hanya <strong>menilai</strong> pegawai
                (relasi Cross), <strong>tanpa</strong> KPI/Skor Akhir/laporan & disembunyikan dari dashboard. Bukan untuk pegawai internal Infarm.
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={pending || !!dupCode || !!dupEmail}>
              {pending ? 'Menyimpan…' : form.id ? 'Simpan Perubahan' : 'Buat Pegawai'}
            </Button>
            <button type="button" onClick={() => setForm(null)} className="text-xs font-semibold text-ink-faint hover:text-ink-soft">Batal</button>
          </div>
        </form>
      )}

      {toast && <p className={`text-xs font-semibold ${toast.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{toast.text}</p>}

      {/* Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nama, kode, email…"
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface flex-1 min-w-[160px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <select value={fRole} onChange={(e) => { setFRole(e.target.value as typeof fRole); setPage(0); }} className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink">
          <option value="all">Semua Peran</option>
          {ROLE_OPTS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <select value={fDept} onChange={(e) => { setFDept(e.target.value); setPage(0); }} className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink">
          <option value="all">Semua Divisi</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => { setFStatus(e.target.value as typeof fStatus); setPage(0); }} className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink">
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </div>

      {/* Tabel */}
      <Panel padded={false} className="p-4">
      <div className="overflow-x-auto">
        {/* table-fixed + colgroup: lebar kolom TETAP antar halaman/filter (tak bergeser saat paging). */}
        <table className="w-full table-fixed text-left text-sm min-w-[780px]">
          <colgroup>
            {colPercents([
              190, // Pegawai (+ kode · email)
              115, // Divisi
              140, // Peran (+ chip Eksternal)
              135, // Atasan
              136, // Masa Aktif (dd/mm/yyyy, tak dibungkus)
              104, // Status ("Nonaktif")
              130, // Aksi (3 ikon, tak dibungkus)
            ]).map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
              <th className="py-2 pr-3 font-semibold">Pegawai</th>
              <th className="py-2 px-3 font-semibold">Divisi</th>
              <th className="py-2 px-3 font-semibold">Peran</th>
              <th className="py-2 px-3 font-semibold">Atasan</th>
              <th className="py-2 px-3 font-semibold">Masa Aktif</th>
              <th className="py-2 px-3 text-center font-semibold">Status</th>
              <th className="py-2 pl-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {shown.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-sm text-ink-soft">Tidak ada pegawai sesuai filter.</td></tr>}
            {paged.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'opacity-55'}>
                <td className="py-3 pr-3 break-words">
                  <span className="font-bold text-ink block">{r.name}</span>
                  <span className="text-[11px] text-ink-faint data-value [overflow-wrap:anywhere]">{r.empCode}{r.email ? ` · ${r.email}` : ''}</span>
                </td>
                <td className="py-3 px-3 text-xs text-ink-soft break-words">{r.dept}</td>
                <td className="py-3 px-3">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-tint text-ink-soft">{ROLE_LABEL[r.role]}</span>
                  {r.isExternal && (
                    <span className="ml-1 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warn-tint text-warn-ink" title="Penilai eksternal (vendor/freelance) — hanya menilai, bukan dinilai">Eksternal</span>
                  )}
                </td>
                <td className="py-3 px-3 text-xs text-ink-faint break-words">{r.spvName ?? '—'}</td>
                <td className="py-3 px-3 text-[11px] text-ink-soft whitespace-nowrap">
                  <span title="Tanggal masuk / aktif" className="data-value">↳ {fmtDate(r.joinedOn)}</span>
                  {r.leftOn && <span className="block text-danger-ink data-value" title="Tanggal nonaktif">⇥ {fmtDate(r.leftOn)}</span>}
                </td>
                <td className="py-3 px-3 text-center">
                  {r.active
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-tint text-brand-ink">Aktif</span>
                    : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-danger-tint text-danger-ink">Nonaktif</span>}
                </td>
                <td className="py-3 pl-3 text-right whitespace-nowrap">
                  <button type="button" onClick={() => openEdit(r)} disabled={pending} title="Ubah"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-control text-ink-soft hover:bg-neutral-tint disabled:opacity-60"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => doReset(r)} disabled={pending} title="Reset sandi"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-control text-brand-ink hover:bg-brand-tint disabled:opacity-60"><KeyRound className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => act(() => setEmployeeActive(r.id, !r.active))} disabled={pending}
                    title={r.active ? 'Nonaktifkan' : 'Aktifkan'}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-control disabled:opacity-60 ${r.active ? 'text-danger-ink hover:bg-danger-tint' : 'text-brand-ink hover:bg-brand-tint'}`}><Power className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} setPage={setPage} total={total} rangeFrom={rangeFrom} rangeTo={rangeTo} unit="pegawai" />
      </Panel>

      <p className="text-[11px] text-ink-faint italic">
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
            className="flex-1 text-sm px-2.5 py-1.5 border border-line rounded-control data-value focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
          />
          <button type="button" onClick={() => setReset((s) => (s ? { ...s, pw: randPass() } : s))}
            className="text-[11px] font-semibold px-2 rounded-control bg-surface border border-line text-ink-soft hover:text-ink hover:border-line-strong shrink-0">Acak</button>
        </div>
      </ConfirmDialog>

      <style>{`.inp{width:100%;font-size:.8rem;padding:.5rem .65rem;border:1px solid var(--color-line);border-radius:var(--radius-control);background:var(--color-surface);color:var(--color-ink);outline:none}.inp:focus{border-color:var(--color-brand);box-shadow:0 0 0 2px var(--color-brand-tint)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-ink-soft mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, c }: { label: string; value: number; c: string }) {
  return (
    <div className="border border-line rounded-panel bg-surface px-3 py-2 text-center min-w-[72px]">
      <div className={`text-lg font-bold data-value ${c}`}>{value}</div>
      <div className="text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em]">{label}</div>
    </div>
  );
}
