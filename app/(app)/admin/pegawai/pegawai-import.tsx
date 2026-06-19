'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { createEmployeesBulk } from './actions';
import type { EmpRow, Role } from './pegawai-client';

type ParsedRow = {
  name: string; empCode: string; dept: string; role: Role; email: string;
  password: string; spvCode: string;
  status: 'ok' | 'dup' | 'invalid'; reason: string;
};

const ROLE_ALIASES: Record<string, Role> = {
  employee: 'employee', pegawai: 'employee', staff: 'employee', operasional: 'employee',
  spv: 'spv', supervisor: 'spv', atasan: 'spv',
  hrd: 'hrd', 'hrd admin': 'hrd', admin: 'hrd',
  direksi: 'direksi', direktur: 'direksi', direction: 'direksi',
};
const normRole = (s: string): Role | null => ROLE_ALIASES[s.trim().toLowerCase()] ?? null;
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '.');
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Impor pegawai massal dari Excel/CSV (HRD). */
export function PegawaiImport({ rows }: { rows: EmpRow[] }) {
  const [open, setOpen] = useState(false);
  const [defPass, setDefPass] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const existCodes = useMemo(() => new Set(rows.map((r) => r.empCode.toUpperCase())), [rows]);
  const existEmails = useMemo(() => new Set(rows.map((r) => r.email.toLowerCase()).filter(Boolean)), [rows]);
  const knownCodes = useMemo(
    () => new Set([...existCodes, ...rows.map((r) => r.empCode.toUpperCase())]),
    [existCodes, rows],
  );

  function validate(list: Omit<ParsedRow, 'status' | 'reason'>[]): ParsedRow[] {
    const batchCodes = new Set<string>();
    const batchEmails = new Set<string>();
    return list.map((r) => {
      const code = r.empCode.toUpperCase();
      const email = r.email.toLowerCase();
      let status: ParsedRow['status'] = 'ok';
      let reason = '';
      if (!r.name || r.name.length < 2) { status = 'invalid'; reason = 'nama kosong'; }
      else if (!code || !CODE_RE.test(code) || code.length < 2) { status = 'invalid'; reason = 'kode tidak valid'; }
      else if (!r.dept) { status = 'invalid'; reason = 'divisi kosong'; }
      else if (!r.role) { status = 'invalid'; reason = 'peran tidak dikenali'; }
      else if (!email || !/^\S+@\S+\.\S+$/.test(email)) { status = 'invalid'; reason = 'email tidak valid'; }
      else if (!r.password || r.password.length < 6) { status = 'invalid'; reason = 'sandi < 6 (isi Sandi Default)'; }
      else if (existCodes.has(code) || batchCodes.has(code)) { status = 'dup'; reason = 'kode sudah ada'; }
      else if (existEmails.has(email) || batchEmails.has(email)) { status = 'dup'; reason = 'email sudah ada'; }
      // Atasan tak dikenal → bukan error; tautan diabaikan saat impor.
      else if (r.spvCode && !knownCodes.has(r.spvCode.toUpperCase()) && !batchCodes.has(r.spvCode.toUpperCase())) {
        reason = 'atasan tak dikenal (diabaikan)';
      }
      if (status === 'ok') { batchCodes.add(code); batchEmails.add(email); }
      return { ...r, status, reason };
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setParseErr(null); setParsed(null); setMsg(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const pick = (row: Record<string, unknown>, keys: string[]) => {
        const f = Object.keys(row).find((k) => keys.includes(k.trim().toLowerCase()));
        return f ? String(row[f]).trim() : '';
      };
      const base = raw.map((r) => {
        const name = pick(r, ['nama', 'name', 'nama lengkap']);
        const empCode = pick(r, ['kode', 'kode pegawai', 'emp_code', 'code']).toUpperCase();
        const dept = pick(r, ['divisi', 'dept', 'department', 'departemen']);
        const role = normRole(pick(r, ['peran', 'role', 'jabatan'])) ?? ('employee' as Role);
        const roleRaw = pick(r, ['peran', 'role', 'jabatan']);
        let email = pick(r, ['email', 'surel']).toLowerCase();
        if (!email && name) email = `${slug(name)}@infarm.test`;
        const password = pick(r, ['sandi', 'password', 'kata sandi']) || defPass;
        const spvCode = pick(r, ['atasan', 'spv', 'atasan_kode', 'kode atasan']).toUpperCase();
        return {
          name, empCode, dept,
          role: normRole(roleRaw) ?? role,
          email, password, spvCode,
        };
      }).filter((r) => r.name || r.empCode || r.email);
      if (base.length === 0) { setParseErr('Tidak menemukan kolom nama/kode. Periksa header file.'); return; }
      setParsed(validate(base));
    } catch {
      setParseErr('Gagal membaca file. Pastikan .xlsx/.xls/.csv valid.');
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  // Re-validasi ulang preview saat Sandi Default berubah (mengisi baris tanpa sandi).
  function reapplyDefault(v: string) {
    setDefPass(v);
    setParsed((prev) => prev && validate(prev.map((r) => ({
      name: r.name, empCode: r.empCode, dept: r.dept, role: r.role, email: r.email,
      password: r.password && r.password.length >= 6 ? r.password : v, spvCode: r.spvCode,
    }))));
  }

  const valids = (parsed ?? []).filter((r) => r.status === 'ok');

  function apply() {
    if (valids.length === 0) { setMsg({ ok: false, text: 'Tidak ada baris valid untuk diimpor.' }); return; }
    setMsg(null);
    const payload = valids.map((r) => ({
      name: r.name, empCode: r.empCode, dept: r.dept, role: r.role,
      email: r.email, password: r.password, spvCode: r.spvCode || undefined,
    }));
    start(async () => {
      const res = await createEmployeesBulk(payload);
      if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
      const tail = res.failed.length ? ` · ${res.failed.length} gagal (${res.failed.slice(0, 3).map((f) => f.code).join(', ')}…)` : '';
      setMsg({ ok: true, text: `${res.created} pegawai dibuat, ${res.skipped} dilewati${tail}.` });
      setParsed(null);
    });
  }

  async function template() {
    const XLSX = await import('xlsx');
    const data = [
      { nama: 'Andi Pratama', kode: 'FT2021-001', divisi: 'Operasional', peran: 'employee', email: '', sandi: '', atasan: 'SPV001' },
      { nama: 'Gunawan Wibowo', kode: 'SPV001', divisi: 'Operasional', peran: 'spv', email: '', sandi: '', atasan: '' },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Pegawai');
    XLSX.writeFile(wb, 'template-pegawai.xlsx');
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">
        <Upload className="w-4 h-4" /> Impor dari Excel
      </button>
    );
  }

  const counts = parsed ? {
    ok: parsed.filter((r) => r.status === 'ok').length,
    dup: parsed.filter((r) => r.status === 'dup').length,
    bad: parsed.filter((r) => r.status === 'invalid').length,
  } : null;

  return (
    <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Impor Pegawai Massal</h3>
        <button type="button" onClick={() => { setOpen(false); setParsed(null); setMsg(null); }} className="text-gray-400 hover:text-gray-600 text-xs">Tutup ✕</button>
      </div>
      <p className="text-[11px] text-emerald-900">
        Kolom: <code>nama</code>, <code>kode</code>, <code>divisi</code>, <code>peran</code> (employee/spv/hrd/direksi),
        <code> email</code> (opsional → otomatis dari nama), <code>sandi</code> (opsional → Sandi Default), <code>atasan</code> (kode pegawai, opsional).
        {' '}<button type="button" onClick={template} className="underline font-bold">Unduh template</button>.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="block text-[10px] font-semibold text-gray-600 mb-1">Sandi Default (untuk baris tanpa kolom sandi)</span>
          <input value={defPass} onChange={(e) => reapplyDefault(e.target.value)} placeholder="min. 6 karakter"
            className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600" />
        </label>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
          aria-label="Berkas Excel data pegawai"
          className="block text-xs file:mr-3 file:rounded file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-white file:font-bold" />
      </div>
      {parseErr && <p className="text-xs text-rose-600 font-semibold" role="alert">{parseErr}</p>}

      {parsed && counts && (
        <>
          <div className="flex gap-3 text-[11px] font-bold">
            <span className="text-emerald-700">✓ {counts.ok} valid</span>
            <span className="text-amber-600">↷ {counts.dup} dilewati</span>
            <span className="text-rose-600">✗ {counts.bad} tidak valid</span>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-72 overflow-y-auto bg-white">
            <table className="w-full text-left text-[11px]">
              <thead><tr className="bg-gray-50 text-[9px] uppercase text-gray-400 border-b border-gray-200 sticky top-0">
                <th className="py-1.5 px-2">Nama</th><th className="py-1.5 px-2">Kode</th><th className="py-1.5 px-2">Divisi</th>
                <th className="py-1.5 px-2">Peran</th><th className="py-1.5 px-2">Email</th><th className="py-1.5 px-2">Atasan</th><th className="py-1.5 px-2">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {parsed.map((r, i) => (
                  <tr key={i} className={r.status === 'ok' ? '' : r.status === 'dup' ? 'bg-amber-50/40' : 'bg-rose-50/40'}>
                    <td className="py-1.5 px-2">{r.name || <span className="text-rose-600">?</span>}</td>
                    <td className="py-1.5 px-2 font-mono">{r.empCode || <span className="text-rose-600">?</span>}</td>
                    <td className="py-1.5 px-2">{r.dept || '—'}</td>
                    <td className="py-1.5 px-2">{r.role}</td>
                    <td className="py-1.5 px-2 text-gray-500">{r.email || '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-gray-500">{r.spvCode || '—'}</td>
                    <td className="py-1.5 px-2">
                      {r.status === 'ok'
                        ? <span className="text-emerald-700 font-bold">✓{r.reason ? <span className="text-amber-600 font-normal"> · {r.reason}</span> : ''}</span>
                        : <span className={`font-bold ${r.status === 'dup' ? 'text-amber-600' : 'text-rose-600'}`}>{r.status === 'dup' ? '↷' : '✗'} {r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={apply} disabled={pending || valids.length === 0}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-white text-xs font-bold disabled:opacity-50">
              {pending ? 'Mengimpor…' : `Impor ${valids.length} pegawai`}
            </button>
            <button onClick={() => setParsed(null)} disabled={pending} className="text-xs font-semibold text-gray-500 hover:underline">Batal</button>
          </div>
        </>
      )}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}
