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
    return <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong">+ Impor dari Excel</button>;
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-ink-faint uppercase tracking-[0.07em]">Impor Mapping Massal</h3>
        <button type="button" onClick={() => { setOpen(false); setParsed(null); setMsg(null); }} className="text-ink-faint hover:text-ink-soft text-xs">Tutup ✕</button>
      </div>
      <p className="text-[12px] text-ink-soft leading-relaxed">Kolom: <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">penilai</code>, <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">dinilai</code> (kode pegawai), <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">relasi</code> (Atasan/Peer/Cross/Bawahan — Self dinonaktifkan), <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">wajib</code> (wajib/opsional). <button type="button" onClick={template} className="text-brand-ink font-semibold hover:underline">Unduh template</button>.</p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
        className="block text-xs file:mr-3 file:rounded-control file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white file:font-semibold" />
      {parseErr && <p className="text-xs text-danger-ink font-semibold">{parseErr}</p>}

      {parsed && (
        <>
          {skips.length > 0 && (
            <div className="rounded-control border border-warn-ink/25 bg-warn-tint p-2 text-[11px] text-warn-ink">
              <strong>{skips.length} baris akan dilewati</strong> ({oks.length} akan diimpor). Pasangan yang dilewati:
              <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                {skips.map((c) => (
                  <li key={c.line} className="flex gap-1.5">
                    <span className="shrink-0 opacity-70">baris <span className="data-value">{c.line}</span>:</span>
                    <span className="font-semibold">{(c.r.assessor?.name ?? c.r.aCode) || '?'} → {(c.r.target?.name ?? c.r.tCode) || '?'}</span>
                    <span className="opacity-80">— {c.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto border border-line rounded-control max-h-64 overflow-y-auto bg-surface">
            <table className="w-full text-left text-[11px]">
              <thead><tr className="bg-neutral-tint text-[10px] uppercase text-ink-faint border-b border-line">
                <th className="py-1.5 px-2 font-semibold">#</th><th className="py-1.5 px-2 font-semibold">Penilai</th><th className="py-1.5 px-2 font-semibold">Dinilai</th><th className="py-1.5 px-2 font-semibold">Relasi</th><th className="py-1.5 px-2 font-semibold">Sifat</th><th className="py-1.5 px-2 font-semibold">Keterangan</th>
              </tr></thead>
              <tbody className="divide-y divide-line-soft">
                {classified.map((c) => {
                  const r = c.r;
                  return (
                    <tr key={c.line} className={c.status === 'ok' ? '' : c.status === 'invalid' ? 'bg-danger-tint/50' : 'bg-warn-tint/60'}>
                      <td className="py-1.5 px-2 text-ink-faint data-value">{c.line}</td>
                      <td className="py-1.5 px-2 text-ink">{r.assessor?.name ?? <span className="text-danger-ink data-value">{r.aCode || '?'}</span>}</td>
                      <td className="py-1.5 px-2 text-ink">{r.target?.name ?? <span className="text-danger-ink data-value">{r.tCode || '?'}</span>}</td>
                      <td className="py-1.5 px-2 text-ink-soft">{r.relation || <span className="text-danger-ink">?</span>}</td>
                      <td className="py-1.5 px-2 text-ink-soft">{r.mandatory ? 'Wajib' : 'Opsional'}</td>
                      <td className="py-1.5 px-2">
                        {c.status === 'ok'
                          ? <span className="text-brand-ink font-semibold">✓ Akan diimpor</span>
                          : <span className="text-warn-ink">✗ {c.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={apply} disabled={pending} className="rounded-control bg-brand hover:bg-brand-ink px-3 py-1.5 text-white text-xs font-semibold disabled:opacity-50">
              {pending ? 'Mengimpor…' : `Impor ${oks.length} baris${skips.length ? ` (${skips.length} dilewati)` : ''}`}
            </button>
            <button onClick={() => setParsed(null)} disabled={pending} className="text-xs font-semibold text-ink-faint hover:text-ink-soft">Batal</button>
          </div>
        </>
      )}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
