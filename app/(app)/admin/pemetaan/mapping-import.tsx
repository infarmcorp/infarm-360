'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { FileSpreadsheet, Plus, X, Check, ArrowRight } from 'lucide-react';
import { createMappingsBulk } from './actions';
import { CARD, CardTitle, TABLE_HEAD } from '@/components/infarm-ui';
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
    return <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 min-h-9 text-[13px] font-semibold px-3 rounded-xl border border-line bg-surface text-ink-soft hover:text-brand hover:border-infarm-light"><Plus className="w-4 h-4" /> Impor dari Excel</button>;
  }

  return (
    <div className={`${CARD} space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <CardTitle icon={FileSpreadsheet}>Impor Mapping Massal</CardTitle>
        <button type="button" onClick={() => { setOpen(false); setParsed(null); setMsg(null); }} className="inline-flex items-center gap-1 text-ink-soft hover:text-ink text-xs font-semibold shrink-0">Tutup <X className="w-3.5 h-3.5" aria-hidden /></button>
      </div>
      <p className="text-xs text-ink-soft leading-relaxed">Kolom: <code className="font-mono text-ink-soft bg-neutral-tint px-1 rounded">penilai</code>, <code className="font-mono text-ink-soft bg-neutral-tint px-1 rounded">dinilai</code> (kode pegawai), <code className="font-mono text-ink-soft bg-neutral-tint px-1 rounded">relasi</code> (Atasan/Peer/Cross/Bawahan — Self dinonaktifkan), <code className="font-mono text-ink-soft bg-neutral-tint px-1 rounded">wajib</code> (wajib/opsional). <button type="button" onClick={template} className="text-brand-ink font-semibold hover:underline">Unduh template</button>.</p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
        className="block text-xs text-ink-soft file:mr-3 file:min-h-9 file:rounded-xl file:border-0 file:bg-brand file:px-4 file:text-white file:text-[13px] file:font-bold file:cursor-pointer" />
      {parseErr && <p className="text-[13px] text-danger-ink font-semibold">{parseErr}</p>}

      {parsed && (
        <>
          {skips.length > 0 && (
            <div className="rounded-xl bg-warn-tint px-3 py-2 text-xs text-warn-ink">
              <strong>{skips.length} baris akan dilewati</strong> ({oks.length} akan diimpor). Pasangan yang dilewati:
              <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                {skips.map((c) => (
                  <li key={c.line} className="flex gap-1.5">
                    <span className="shrink-0 opacity-70">baris <span className="font-mono">{c.line}</span>:</span>
                    <span className="font-semibold inline-flex items-center gap-1">{(c.r.assessor?.name ?? c.r.aCode) || '?'} <ArrowRight className="w-3 h-3 shrink-0" aria-hidden /> {(c.r.target?.name ?? c.r.tCode) || '?'}</span>
                    <span className="opacity-80">— {c.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto border border-line rounded-xl max-h-64 overflow-y-auto bg-surface">
            <table className="w-full text-left text-xs">
              <thead><tr className={`${TABLE_HEAD} border-b border-line`}>
                <th className="py-1.5 px-2 font-semibold">#</th><th className="py-1.5 px-2 font-semibold">Penilai</th><th className="py-1.5 px-2 font-semibold">Dinilai</th><th className="py-1.5 px-2 font-semibold">Relasi</th><th className="py-1.5 px-2 font-semibold">Sifat</th><th className="py-1.5 px-2 font-semibold">Keterangan</th>
              </tr></thead>
              <tbody className="divide-y divide-line-soft">
                {classified.map((c) => {
                  const r = c.r;
                  return (
                    <tr key={c.line} className={c.status === 'ok' ? '' : c.status === 'invalid' ? 'bg-danger-tint/50' : 'bg-warn-tint/60'}>
                      <td className="py-1.5 px-2 text-ink-soft font-mono">{c.line}</td>
                      <td className="py-1.5 px-2 text-ink">{r.assessor?.name ?? <span className="text-danger-ink font-mono">{r.aCode || '?'}</span>}</td>
                      <td className="py-1.5 px-2 text-ink">{r.target?.name ?? <span className="text-danger-ink font-mono">{r.tCode || '?'}</span>}</td>
                      <td className="py-1.5 px-2 text-ink-soft">{r.relation || <span className="text-danger-ink">?</span>}</td>
                      <td className="py-1.5 px-2 text-ink-soft">{r.mandatory ? 'Wajib' : 'Opsional'}</td>
                      <td className="py-1.5 px-2">
                        {c.status === 'ok'
                          ? <span className="inline-flex items-center gap-1 text-brand-ink font-semibold"><Check className="w-3.5 h-3.5" aria-hidden /> Akan diimpor</span>
                          : <span className="inline-flex items-center gap-1 text-warn-ink"><X className="w-3.5 h-3.5 shrink-0" aria-hidden /> {c.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={apply} disabled={pending} className="min-h-9 rounded-xl bg-brand hover:bg-brand-ink px-4 text-white text-[13px] font-bold disabled:opacity-50">
              {pending ? 'Mengimpor…' : `Impor ${oks.length} baris${skips.length ? ` (${skips.length} dilewati)` : ''}`}
            </button>
            <button onClick={() => setParsed(null)} disabled={pending} className="min-h-9 px-2 text-[13px] font-semibold text-ink-soft hover:text-ink">Batal</button>
          </div>
        </>
      )}
      {msg && <p className={`text-[13px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </div>
  );
}
