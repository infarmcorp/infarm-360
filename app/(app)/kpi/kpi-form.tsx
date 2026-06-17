'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { saveKpiScores } from './actions';

type Member = { id: string; code: string; name: string; dept: string };
type ParsedRow = { code: string; score: number; note: string; member: Member | null };

/**
 * Form input KPI — dua mode (ala legacy): Manual & Impor Excel.
 * Excel/CSV di-parse di klien (xlsx, dynamic import) → dicocokkan emp_code → pratinjau →
 * disimpan lewat Server Action yang sama (validasi Zod + audit di server).
 */
export function KpiForm({ members, months }: { members: Member[]; months: string[] }) {
  const [ym, setYm] = useState(months[0]);
  const [dept, setDept] = useState('all');
  const [mode, setMode] = useState<'manual' | 'excel'>('manual');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const depts = useMemo(() => [...new Set(members.map((m) => m.dept))].sort(), [members]);
  const shown = useMemo(() => (dept === 'all' ? members : members.filter((m) => m.dept === dept)), [members, dept]);
  const byCode = useMemo(() => new Map(members.map((m) => [m.code.toUpperCase(), m])), [members]);

  function submitManual() {
    setMsg(null);
    const rows = shown
      .filter((m) => scores[m.id]?.trim())
      .map((m) => ({ employeeId: m.id, score: scores[m.id], note: notes[m.id] }));
    if (rows.length === 0) { setMsg({ ok: false, text: 'Isi minimal satu skor sebelum menyimpan.' }); return; }
    startTransition(async () => {
      const res = await saveKpiScores({ ym, rows });
      setMsg(res.ok ? { ok: true, text: `Tersimpan: ${res.saved} skor.` } : { ok: false, text: res.error });
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseErr(null); setParsed(null); setMsg(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (raw.length === 0) { setParseErr('File kosong atau tanpa baris data.'); return; }

      const pick = (row: Record<string, unknown>, keys: string[]) => {
        const found = Object.keys(row).find((k) => keys.includes(k.trim().toLowerCase()));
        return found ? String(row[found]).trim() : '';
      };
      const rows: ParsedRow[] = raw.map((r) => {
        const code = pick(r, ['emp_code', 'kode', 'kode pegawai', 'id']).toUpperCase();
        const scoreStr = pick(r, ['score', 'skor', 'nilai', 'kpi']);
        const note = pick(r, ['note', 'catatan', 'komentar']);
        const score = Number(scoreStr);
        return { code, score, note, member: byCode.get(code) ?? null };
      }).filter((r) => r.code);
      if (rows.length === 0) { setParseErr('Tidak menemukan kolom kode pegawai (emp_code/kode).'); return; }
      setParsed(rows);
    } catch {
      setParseErr('Gagal membaca file. Pastikan format .xlsx/.xls/.csv yang valid.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function applyExcel() {
    if (!parsed) return;
    setMsg(null);
    const valid = parsed.filter((r) => r.member && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100);
    if (valid.length === 0) { setMsg({ ok: false, text: 'Tidak ada baris valid (kode cocok & skor 0–100).' }); return; }
    const rows = valid.map((r) => ({ employeeId: r.member!.id, score: String(r.score), note: r.note || 'Impor Excel' }));
    startTransition(async () => {
      const res = await saveKpiScores({ ym, rows });
      setMsg(res.ok ? { ok: true, text: `Tersimpan: ${res.saved} skor dari Excel.` } : { ok: false, text: res.error });
      if (res.ok) setParsed(null);
    });
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx');
    const data = shown.map((m) => ({ emp_code: m.code, nama: m.name, score: '', note: '' }));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ emp_code: '', nama: '', score: '', note: '' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI');
    XLSX.writeFile(wb, `template-kpi-${ym}.xlsx`);
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['manual', 'excel'] as const).map((mo) => (
          <button key={mo} type="button" onClick={() => { setMode(mo); setMsg(null); }}
            className={`px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all ${mode === mo ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {mo === 'manual' ? 'Input Manual' : 'Impor Excel'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="block text-sm">
          Bulan & Tahun Evaluasi
          <select value={ym} onChange={(e) => setYm(e.target.value)} className="mt-1 block rounded border px-3 py-2">
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {depts.length > 1 && (
          <label className="block text-sm">
            Divisi
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="mt-1 block rounded border px-3 py-2">
              <option value="all">Semua Divisi</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        )}
      </div>

      {mode === 'manual' ? (
        <>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[520px]">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Pegawai</th>
                <th className="py-2">Skor (0–100)</th>
                <th className="py-2">Komentar Audit (jika edit)</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-2">{m.name} <span className="text-gray-400">· {m.dept}</span></td>
                  <td className="py-2">
                    <input type="number" min={0} max={100} inputMode="decimal" value={scores[m.id] ?? ''}
                      onChange={(e) => setScores((s) => ({ ...s, [m.id]: e.target.value }))} className="w-24 rounded border px-2 py-1" />
                  </td>
                  <td className="py-2">
                    <input type="text" placeholder="opsional" value={notes[m.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))} className="w-full rounded border px-2 py-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={submitManual} disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-white text-sm font-bold disabled:opacity-50">
              {pending ? 'Menyimpan…' : 'Simpan Semua Skor'}
            </button>
            {msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="bg-emerald-50/40 border border-emerald-600/20 rounded-xl p-3 text-xs text-emerald-900">
            Unggah file <strong>.xlsx/.xls/.csv</strong> berkolom <code>emp_code</code> &amp; <code>score</code> (opsional <code>note</code>).
            Skor disimpan untuk bulan <strong>{ym}</strong>. <button type="button" onClick={downloadTemplate} className="underline font-bold">Unduh template</button>.
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
            className="block text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-white file:font-bold" />
          {parseErr && <p className="text-sm text-rose-600 font-semibold">{parseErr}</p>}

          {parsed && (
            <>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                      <th className="py-2 px-3">Kode</th><th className="py-2 px-3">Pegawai</th>
                      <th className="py-2 px-3 text-center">Skor</th><th className="py-2 px-3">Catatan</th><th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.map((r, i) => {
                      const valid = !!r.member && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100;
                      return (
                        <tr key={i} className={valid ? '' : 'bg-rose-50/40'}>
                          <td className="py-2 px-3 font-mono">{r.code}</td>
                          <td className="py-2 px-3">{r.member?.name ?? <span className="text-rose-600">tidak cocok</span>}</td>
                          <td className="py-2 px-3 text-center font-mono">{Number.isFinite(r.score) ? r.score : '—'}</td>
                          <td className="py-2 px-3 text-gray-500">{r.note || '—'}</td>
                          <td className="py-2 px-3">{valid ? <span className="text-emerald-700 font-bold">✓ Siap</span> : <span className="text-rose-600 font-bold">✗ Dilewati</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={applyExcel} disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-white text-sm font-bold disabled:opacity-50">
                  {pending ? 'Menyimpan…' : `Terapkan & Simpan (${parsed.filter((r) => r.member && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100).length} baris)`}
                </button>
                <button onClick={() => setParsed(null)} disabled={pending} className="text-sm font-semibold text-gray-500 hover:underline">Batal</button>
                {msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}
              </div>
            </>
          )}
          {!parsed && msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
