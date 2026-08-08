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
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">
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
    <div className="rounded-panel border border-line bg-surface p-4 space-y-3 w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.07em]">Impor Pegawai Massal</h3>
        <button type="button" onClick={() => { setOpen(false); setParsed(null); setMsg(null); }} className="text-ink-faint hover:text-ink-soft text-xs">Tutup ✕</button>
      </div>
      <p className="text-[12px] text-ink-soft leading-relaxed">
        Kolom: <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">nama</code>, <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">kode</code>, <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">divisi</code>, <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">peran</code> (employee/spv/hrd/direksi),
        <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded"> email</code> (opsional → otomatis dari nama), <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">sandi</code> (opsional → Sandi Default), <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">atasan</code> (kode pegawai, opsional).
        {' '}<button type="button" onClick={template} className="text-brand-ink font-semibold hover:underline">Unduh template</button>.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Sandi Default (untuk baris tanpa kolom sandi)</span>
          <input value={defPass} onChange={(e) => reapplyDefault(e.target.value)} placeholder="min. 6 karakter"
            className="text-xs px-3 py-2 border border-line rounded-control bg-surface focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        </label>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
          className="block text-xs file:mr-3 file:rounded-control file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white file:font-semibold" />
      </div>
      {parseErr && <p className="text-xs text-danger-ink font-semibold">{parseErr}</p>}

      {parsed && counts && (
        <>
          <div className="flex gap-3 text-[11px] font-semibold">
            <span className="text-brand-ink">✓ {counts.ok} valid</span>
            <span className="text-warn-ink">↷ {counts.dup} dilewati</span>
            <span className="text-danger-ink">✗ {counts.bad} tidak valid</span>
          </div>
          <div className="overflow-x-auto border border-line rounded-control max-h-72 overflow-y-auto bg-surface">
            <table className="w-full text-left text-[11px]">
              <thead><tr className="bg-neutral-tint text-[10px] uppercase text-ink-faint border-b border-line sticky top-0">
                <th className="py-1.5 px-2 font-semibold">Nama</th><th className="py-1.5 px-2 font-semibold">Kode</th><th className="py-1.5 px-2 font-semibold">Divisi</th>
                <th className="py-1.5 px-2 font-semibold">Peran</th><th className="py-1.5 px-2 font-semibold">Email</th><th className="py-1.5 px-2 font-semibold">Atasan</th><th className="py-1.5 px-2 font-semibold">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-line-soft">
                {parsed.map((r, i) => (
                  <tr key={i} className={r.status === 'ok' ? '' : r.status === 'dup' ? 'bg-warn-tint/40' : 'bg-danger-tint/40'}>
                    <td className="py-1.5 px-2 text-ink">{r.name || <span className="text-danger-ink">?</span>}</td>
                    <td className="py-1.5 px-2 data-value text-ink">{r.empCode || <span className="text-danger-ink">?</span>}</td>
                    <td className="py-1.5 px-2 text-ink-soft">{r.dept || '—'}</td>
                    <td className="py-1.5 px-2 text-ink-soft">{r.role}</td>
                    <td className="py-1.5 px-2 text-ink-faint">{r.email || '—'}</td>
                    <td className="py-1.5 px-2 data-value text-ink-faint">{r.spvCode || '—'}</td>
                    <td className="py-1.5 px-2">
                      {r.status === 'ok'
                        ? <span className="text-brand-ink font-semibold">✓{r.reason ? <span className="text-warn-ink font-normal"> · {r.reason}</span> : ''}</span>
                        : <span className={`font-semibold ${r.status === 'dup' ? 'text-warn-ink' : 'text-danger-ink'}`}>{r.status === 'dup' ? '↷' : '✗'} {r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={apply} disabled={pending || valids.length === 0}
              className="rounded-control bg-brand hover:bg-brand-ink px-4 py-2 text-white text-xs font-semibold disabled:opacity-50">
              {pending ? 'Mengimpor…' : `Impor ${valids.length} pegawai`}
            </button>
            <button onClick={() => setParsed(null)} disabled={pending} className="text-xs font-semibold text-ink-faint hover:text-ink-soft">Batal</button>
          </div>
        </>
      )}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
