'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createMappingsBulk } from './actions';
import { parseMappingRows, classifyMappingRows, type MapEmp, type MapParsedRow } from '@/lib/import/parse';

type Emp = MapEmp;
type Row = MapParsedRow;

/** Impor mapping massal dari Excel/CSV (HRD). */
export function MappingImport({ employees }: { employees: Emp[] }) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Row[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setParseErr(null); setParsed(null); setMsg(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const rows = parseMappingRows(raw, employees);
      if (rows.length === 0) { setParseErr('Tidak menemukan kolom penilai/dinilai.'); return; }
      setParsed(rows);
    } catch {
      setParseErr('Gagal membaca file. Pastikan .xlsx/.xls/.csv valid.');
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  // Klasifikasi tiap baris + alasan bila dilewati (logika murni di lib/import/parse.ts).
  const classified = useMemo(() => classifyMappingRows(parsed ?? []), [parsed]);

  const oks = classified.filter((c) => c.status === 'ok');
  const skips = classified.filter((c) => c.status !== 'ok');

  function apply() {
    if (oks.length === 0) { setMsg({ ok: false, text: 'Tidak ada baris valid untuk diimpor.' }); return; }
    setMsg(null);
    const payload = oks.map((c) => ({ assessorId: c.r.assessor!.id, targetId: c.r.target!.id, relation: c.r.relation, mandatory: c.r.mandatory }));
    start(async () => {
      const res = await createMappingsBulk(payload);
      setMsg(res.ok
        ? { ok: true, text: `${res.saved} pemetaan diimpor${skips.length ? ` · ${skips.length} dilewati (lihat keterangan di pratinjau)` : ''}.` }
        : { ok: false, text: res.error });
      if (res.ok) setParsed(null);
    });
  }

  async function template() {
    const XLSX = await import('xlsx');
    const sample = employees.slice(0, 2);
    const data = [{ penilai: sample[0]?.code ?? 'SPV001', dinilai: sample[1]?.code ?? 'EMP001', relasi: 'Atasan', wajib: 'wajib' }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Mapping');
    XLSX.writeFile(wb, 'template-mapping.xlsx');
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-emerald-700 hover:underline">+ Impor dari Excel</button>;
  }

  return (
    <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Impor Mapping Massal</h3>
        <button type="button" onClick={() => { setOpen(false); setParsed(null); setMsg(null); }} className="text-gray-500 hover:text-gray-600 text-xs">Tutup ✕</button>
      </div>
      <p className="text-[11px] text-emerald-900">Kolom: <code>penilai</code>, <code>dinilai</code> (kode pegawai), <code>relasi</code> (Atasan/Peer/Cross/Self/Bawahan), <code>wajib</code> (wajib/opsional). <button type="button" onClick={template} className="underline font-bold">Unduh template</button>.</p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
        className="block text-xs file:mr-3 file:rounded file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-white file:font-bold" />
      {parseErr && <p className="text-xs text-rose-600 font-semibold">{parseErr}</p>}

      {parsed && (
        <>
          {skips.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
              <strong>{skips.length} baris akan dilewati</strong> ({oks.length} akan diimpor). Pasangan yang dilewati:
              <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                {skips.map((c) => (
                  <li key={c.line} className="flex gap-1.5">
                    <span className="text-amber-500 shrink-0">baris {c.line}:</span>
                    <span className="font-semibold">{(c.r.assessor?.name ?? c.r.aCode) || '?'} → {(c.r.target?.name ?? c.r.tCode) || '?'}</span>
                    <span className="text-amber-700">— {c.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-64 overflow-y-auto bg-white">
            <table className="w-full text-left text-[11px]">
              <thead><tr className="bg-gray-50 text-[10px] uppercase text-gray-500 border-b border-gray-200">
                <th className="py-1.5 px-2">#</th><th className="py-1.5 px-2">Penilai</th><th className="py-1.5 px-2">Dinilai</th><th className="py-1.5 px-2">Relasi</th><th className="py-1.5 px-2">Sifat</th><th className="py-1.5 px-2">Keterangan</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {classified.map((c) => {
                  const r = c.r;
                  return (
                    <tr key={c.line} className={c.status === 'ok' ? '' : c.status === 'invalid' ? 'bg-rose-50/50' : 'bg-amber-50/60'}>
                      <td className="py-1.5 px-2 text-gray-500 font-mono">{c.line}</td>
                      <td className="py-1.5 px-2">{r.assessor?.name ?? <span className="text-rose-600 font-mono">{r.aCode || '?'}</span>}</td>
                      <td className="py-1.5 px-2">{r.target?.name ?? <span className="text-rose-600 font-mono">{r.tCode || '?'}</span>}</td>
                      <td className="py-1.5 px-2">{r.relation || <span className="text-rose-600">?</span>}</td>
                      <td className="py-1.5 px-2">{r.mandatory ? 'Wajib' : 'Opsional'}</td>
                      <td className="py-1.5 px-2">
                        {c.status === 'ok'
                          ? <span className="text-emerald-700 font-bold">✓ Akan diimpor</span>
                          : <span className="text-amber-800">✗ {c.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={apply} disabled={pending} className="rounded bg-emerald-700 px-3 py-1.5 text-white text-xs font-bold disabled:opacity-50">
              {pending ? 'Mengimpor…' : `Impor ${oks.length} baris${skips.length ? ` (${skips.length} dilewati)` : ''}`}
            </button>
            <button onClick={() => setParsed(null)} disabled={pending} className="text-xs font-semibold text-gray-500 hover:underline">Batal</button>
          </div>
        </>
      )}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}
