'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveKpiScores, deleteKpiScore } from './actions';
import { parseKpiRows, isValidKpiRow, type KpiMember, type KpiParsedRow } from '@/lib/import/parse';

type Member = KpiMember;
type ParsedRow = KpiParsedRow;

/**
 * Form input KPI — dua mode (ala legacy): Manual & Impor Excel.
 * Excel/CSV di-parse di klien (xlsx, dynamic import) → dicocokkan emp_code → pratinjau →
 * disimpan lewat Server Action yang sama (validasi Zod + audit di server).
 */
export function KpiForm({ members, months, existing = {} }: { members: Member[]; months: string[]; existing?: Record<string, number> }) {
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
  const router = useRouter();
  // Penghapusan skor (manual): pegawai yang sedang dikonfirmasi + alasan wajib.
  const [delId, setDelId] = useState<string | null>(null);
  const [delNote, setDelNote] = useState('');

  const depts = useMemo(() => [...new Set(members.map((m) => m.dept))].sort(), [members]);
  const shown = useMemo(() => (dept === 'all' ? members : members.filter((m) => m.dept === dept)), [members, dept]);
  const filledCount = useMemo(() => shown.filter((m) => existing[`${m.id}|${ym}`] !== undefined).length, [shown, existing, ym]);

  function submitManual() {
    setMsg(null);
    const rows = shown
      .filter((m) => scores[`${m.id}|${ym}`]?.trim())
      .map((m) => ({ employeeId: m.id, score: scores[`${m.id}|${ym}`], note: notes[`${m.id}|${ym}`] }));
    if (rows.length === 0) { setMsg({ ok: false, text: 'Isi minimal satu skor sebelum menyimpan.' }); return; }
    // Cermin aturan server: edit (skor bulan ini SUDAH ada) wajib disertai Komentar Audit.
    // Dicegat di klien agar SPV tahu SEBELUM gagal simpan (bukan setelah error server).
    const missingNote = rows.filter((r) => existing[`${r.employeeId}|${ym}`] !== undefined && !(r.note && r.note.trim()));
    if (missingNote.length > 0) {
      const names = missingNote.map((r) => shown.find((m) => m.id === r.employeeId)?.name ?? r.employeeId);
      setMsg({ ok: false, text: `Perubahan capaian (edit) bulan ${ym} wajib disertai Komentar Audit: ${names.join(', ')}.` });
      return;
    }
    startTransition(async () => {
      const res = await saveKpiScores({ ym, rows });
      if (res.ok) {
        setMsg({ ok: true, text: `Tersimpan: ${res.saved} skor.` });
        // Bersihkan draf bulan ini + segarkan "existing" (kolom Tersimpan langsung memperbarui).
        setScores((s) => { const c = { ...s }; for (const m of shown) delete c[`${m.id}|${ym}`]; return c; });
        setNotes((n) => { const c = { ...n }; for (const m of shown) delete c[`${m.id}|${ym}`]; return c; });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  function doDelete() {
    if (!delId) return;
    if (!delNote.trim()) { setMsg({ ok: false, text: 'Alasan penghapusan wajib diisi.' }); return; }
    setMsg(null);
    const id = delId, note = delNote.trim();
    startTransition(async () => {
      const res = await deleteKpiScore({ employeeId: id, ym, note });
      if (res.ok) {
        setMsg({ ok: true, text: `Skor KPI bulan ${ym} dihapus (tercatat di audit).` });
        setDelId(null); setDelNote('');
        router.refresh(); // segarkan map "existing" dari server
      } else {
        setMsg({ ok: false, text: res.error });
      }
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

      const rows = parseKpiRows(raw, members);
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
    const valid = parsed.filter(isValidKpiRow);
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
          {/* Ringkasan cakupan (#5): berapa anggota yang sudah punya skor bulan ini. */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">
              Terisi <strong className="text-emerald-700">{filledCount}</strong> / {shown.length} anggota untuk <strong>{ym}</strong>
            </span>
            {filledCount < shown.length && (
              <span className="text-amber-700 font-semibold">{shown.length - filledCount} belum diisi</span>
            )}
          </div>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[520px]">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Pegawai</th>
                <th className="py-2">Skor (0–100)</th>
                <th className="py-2">Komentar Audit (jika edit)</th>
                <th className="py-2 text-right whitespace-nowrap pr-1">Tersimpan</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const key = `${m.id}|${ym}`;
                const saved = existing[key];
                const typed = scores[key]?.trim() ?? '';
                const isEditing = saved !== undefined && typed !== '';   // menimpa nilai lama → wajib komentar
                const noteMissing = isEditing && !(notes[key]?.trim());
                return (
                <tr key={m.id} className={`border-b ${noteMissing ? 'bg-amber-50/60' : ''}`}>
                  <td className="py-2">
                    {m.name} <span className="text-gray-500">· {m.dept}</span>
                    {saved === undefined && (
                      <span className="ml-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 align-middle">belum diisi</span>
                    )}
                  </td>
                  <td className="py-2">
                    <input type="number" min={0} max={100} inputMode="decimal" value={scores[key] ?? ''}
                      placeholder={saved !== undefined ? saved.toFixed(2) : ''}
                      onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
                      className={`w-24 rounded border px-2 py-1 ${isEditing ? 'border-amber-400 bg-amber-50/40' : ''}`} />
                    {isEditing && (
                      <div className="mt-0.5 text-[10px] font-bold text-amber-700">↻ ubah dari {saved.toFixed(2)}</div>
                    )}
                  </td>
                  <td className="py-2">
                    <input type="text" value={notes[key] ?? ''}
                      placeholder={isEditing ? 'Wajib: alasan perubahan' : 'opsional'}
                      onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                      className={`w-full rounded border px-2 py-1 ${noteMissing ? 'border-amber-400 bg-amber-50/40 placeholder:text-amber-700' : ''}`} />
                  </td>
                  <td className="py-2 text-right whitespace-nowrap pr-1">
                    {saved === undefined ? (
                      <span className="text-gray-400 text-xs">—</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="font-mono font-bold text-emerald-700">{saved.toFixed(2)}</span>
                        <button type="button" disabled={pending}
                          onClick={() => { setDelId(m.id); setDelNote(''); setMsg(null); }}
                          className="text-[11px] font-bold px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                          Hapus
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Konfirmasi penghapusan skor KPI — alasan WAJIB, tercatat di audit. */}
          {delId && (() => {
            const m = shown.find((x) => x.id === delId);
            const saved = existing[`${delId}|${ym}`];
            return (
              <div className="flex flex-col gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
                <p className="text-[12px] text-rose-900">
                  Hapus skor KPI <strong>{m?.name ?? 'pegawai'}</strong> bulan <strong>{ym}</strong>
                  {saved !== undefined && <> (nilai <strong>{saved.toFixed(2)}</strong>)</>}? Penghapusan
                  <strong> tercatat di Riwayat &amp; Audit</strong> dan mengurangi rerata KPI.
                </p>
                <input type="text" value={delNote} autoFocus
                  onChange={(e) => setDelNote(e.target.value)}
                  placeholder="Alasan penghapusan (wajib)…"
                  className="w-full rounded border border-rose-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={doDelete} disabled={pending || !delNote.trim()}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50">
                    {pending ? 'Menghapus…' : 'Ya, hapus skor'}
                  </button>
                  <button type="button" onClick={() => { setDelId(null); setDelNote(''); }} disabled={pending}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    Batal
                  </button>
                </div>
              </div>
            );
          })()}
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
                    <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                      <th className="py-2 px-3">Kode</th><th className="py-2 px-3">Pegawai</th>
                      <th className="py-2 px-3 text-center">Skor</th><th className="py-2 px-3">Catatan</th><th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.map((r, i) => {
                      const valid = isValidKpiRow(r);
                      const old = valid && r.member ? existing[`${r.member.id}|${ym}`] : undefined;
                      const overwrite = old !== undefined;
                      return (
                        <tr key={i} className={valid ? '' : 'bg-rose-50/40'}>
                          <td className="py-2 px-3 font-mono">{r.code}</td>
                          <td className="py-2 px-3">{r.member?.name ?? <span className="text-rose-600">tidak cocok</span>}</td>
                          <td className="py-2 px-3 text-center font-mono">
                            {Number.isFinite(r.score) ? r.score : '—'}
                            {overwrite && <span className="text-amber-700"> (dari {old})</span>}
                          </td>
                          <td className="py-2 px-3 text-gray-500">{r.note || '—'}</td>
                          <td className="py-2 px-3">
                            {!valid ? <span className="text-rose-600 font-bold">✗ Dilewati</span>
                              : overwrite ? <span className="text-amber-700 font-bold">↻ Menimpa</span>
                              : <span className="text-emerald-700 font-bold">✓ Siap</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(() => {
                const overwriteN = parsed.filter((r) => isValidKpiRow(r) && r.member && existing[`${r.member.id}|${ym}`] !== undefined).length;
                return overwriteN > 0 ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <strong>{overwriteN} baris akan menimpa</strong> skor bulan {ym} yang sudah ada (lihat tanda <span className="font-bold">↻ Menimpa</span>). Nilai lama tetap tersimpan di Riwayat &amp; Audit.
                  </p>
                ) : null;
              })()}
              <div className="flex items-center gap-3">
                <button onClick={applyExcel} disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-white text-sm font-bold disabled:opacity-50">
                  {pending ? 'Menyimpan…' : `Terapkan & Simpan (${parsed.filter(isValidKpiRow).length} baris)`}
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
