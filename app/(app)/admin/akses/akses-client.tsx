'use client';

import { useMemo, useState, useTransition } from 'react';
import { setPageGrant, removePageGrant } from './actions';

export type AksesEmployee = {
  id: string;
  name: string;
  dept: string;
  role: string;
  isHrdAdmin: boolean;
  grants: Record<string, string>; // section → scope
};
type PageOpt = { key: string; label: string };
type ScopeOpt = { key: string; label: string };

const ROLE_LABEL: Record<string, string> = { employee: 'Pegawai', spv: 'SPV', hrd: 'HRD', direksi: 'Direksi' };
const PAGE_SIZE = 12;

/**
 * Klien Manajemen Akses: daftar pegawai + pemilih lingkup per halaman yang bisa diberikan.
 * Mengubah pemilih memanggil setPageGrant (bila lingkup dipilih) atau removePageGrant (bila "—").
 * Perubahan optimistis di state lokal + pesan status per baris; pencarian & paginasi sisi-klien.
 */
export function AksesClient({ employees, pages, scopes }: { employees: AksesEmployee[]; pages: PageOpt[]; scopes: ScopeOpt[] }) {
  const [rows, setRows] = useState(employees);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((e) => e.name.toLowerCase().includes(s) || e.dept.toLowerCase().includes(s) || (ROLE_LABEL[e.role] ?? e.role).toLowerCase().includes(s));
  }, [rows, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pageCount - 1);
  const shown = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);

  function change(emp: AksesEmployee, section: string, scope: string) {
    startTransition(async () => {
      const res = scope
        ? await setPageGrant(emp.id, section, scope)
        : await removePageGrant(emp.id, section);
      if (res.ok) {
        setRows((prev) => prev.map((r) => {
          if (r.id !== emp.id) return r;
          const grants = { ...r.grants };
          if (scope) grants[section] = scope; else delete grants[section];
          return { ...r, grants };
        }));
        setMsg({ id: emp.id, text: res.msg ?? 'Tersimpan.', ok: true });
      } else {
        setMsg({ id: emp.id, text: res.error, ok: false });
      }
    });
  }

  return (
    <div className="mt-4">
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
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-semibold">Pegawai</th>
              <th className="px-3 py-2 font-semibold">Divisi</th>
              <th className="px-3 py-2 font-semibold">Peran</th>
              {pages.map((p) => (
                <th key={p.key} className="px-3 py-2 font-semibold">{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((emp) => (
              <tr key={emp.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800">{emp.name}</div>
                  {emp.isHrdAdmin && <span className="text-[10px] text-indigo-600 font-semibold">HRD Admin</span>}
                  {msg && msg.id === emp.id && (
                    <div className={`text-[11px] mt-0.5 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-600">{emp.dept}</td>
                <td className="px-3 py-2 text-gray-600">{ROLE_LABEL[emp.role] ?? emp.role}</td>
                {pages.map((p) => (
                  <td key={p.key} className="px-3 py-2">
                    <select
                      value={emp.grants[p.key] ?? ''}
                      disabled={pending}
                      onChange={(e) => change(emp, p.key, e.target.value)}
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                    >
                      <option value="">— Tanpa akses</option>
                      {scopes.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={3 + pages.length} className="px-3 py-6 text-center text-gray-500">Tak ada pegawai cocok.</td></tr>
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
        Lingkup ditegakkan di server (data disaring sesuai pilihan), bukan sekadar menyembunyikan menu.
        Perubahan tercatat di <span className="font-semibold text-gray-500">Log Aktivitas HRD</span>.
      </p>
    </div>
  );
}
