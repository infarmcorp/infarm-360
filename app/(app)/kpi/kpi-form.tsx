'use client';

import { fmt2 } from '@/lib/scoring';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveKpiScores, deleteKpiScore } from './actions';
import { parseKpiRows, isValidKpiRow, type KpiMember, type KpiParsedRow } from '@/lib/import/parse';
import { formatDateWib } from '@/lib/datetime';

/** `leftOn` = tanggal keluar (`employees.left_on`), diisi HANYA untuk pegawai nonaktif. */
type Member = KpiMember & { leftOn?: string | null };

/**
 * Pegawai NONAKTIF hanya boleh diinput untuk bulan yang masih ia kerjakan (ym ≤ bulan keluar).
 * Perbandingan string aman karena kedua sisi berformat 'YYYY-MM' (urutan leksikal = kronologis).
 * Yang resign sebelum kuartal dimulai otomatis tak pernah muncul.
 */
function eligibleForMonth(m: Member, ym: string): boolean {
  if (!m.leftOn) return true;
  return ym <= m.leftOn.slice(0, 7);
}

/**
 * Penanda pegawai yang sudah keluar tapi bulan ini masih sah diinput. WAJIB terlihat: tanpa ini
 * penilai bisa mengira daftarnya keliru, atau justru mengisi capaian untuk orang yang sudah tak
 * bekerja di bulan itu. Nada `warn` = obligasi/perhatian (bukan error), sesuai pemetaan token.
 */
function InactiveChip({ leftOn }: { leftOn?: string | null }) {
  if (!leftOn) return null;
  return (
    <span
      title="Pegawai nonaktif — hanya bulan sampai tanggal keluar yang dapat diisi"
      className="ml-2 inline-block rounded-full bg-warn-tint border border-warn-ink/25 px-2 py-0.5 text-[10px] font-semibold text-warn-ink align-middle"
    >
      Nonaktif sejak {formatDateWib(leftOn)}
    </span>
  );
}
type ParsedRow = KpiParsedRow;

/**
 * Keterangan kecil status draf lokal. Sengaja menyebut "di perangkat ini" agar tak disalahartikan
 * sebagai sudah masuk database — angka baru resmi tersimpan setelah tombol Simpan ditekan.
 */
function DraftHint({ state, count, onDiscard }: { state: 'idle' | 'restored' | 'saved'; count: number; onDiscard: () => void }) {
  if (state === 'idle' || count === 0) {
    return <span className="text-[10px] text-ink-faint">Isian tersimpan otomatis di perangkat ini sampai Anda menekan Simpan.</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-[10px]">
      <span className={state === 'restored' ? 'font-bold text-warn-ink' : 'font-semibold text-ink-soft'}>
        {state === 'restored'
          ? <>Draf sesi sebelumnya dipulihkan (<span className="data-value">{count}</span> isian) — belum tersimpan ke sistem.</>
          : <>Draf diamankan di perangkat ini (<span className="data-value">{count}</span> isian) — belum tersimpan ke sistem.</>}
      </span>
      <button type="button" onClick={onDiscard} className="font-bold text-danger-ink hover:underline">Buang draf</button>
    </span>
  );
}

/**
 * SIMPAN OTOMATIS (draf lokal) — kunci penyimpanan di browser.
 * Sengaja draf LOKAL, bukan tulis-otomatis ke database: menulis tiap ketikan ke `kpi_scores`
 * akan menghasilkan jejak `kpi_audit` untuk nilai setengah jadi (ketik "8" lalu "85" → 2 entri)
 * dan bertabrakan dengan aturan terkunci "edit skor wajib komentar audit". Jadi ketikan diamankan
 * di perangkat (tahan refresh/HP ter-lock), lalu masuk database HANYA saat tombol Simpan ditekan.
 */
const DRAFT_KEY = 'infarm.kpi-input-draft';
type Draft = { scores: Record<string, string>; notes: Record<string, string> };

const readDraft = (): Draft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d !== 'object') return null;
    return { scores: d.scores ?? {}, notes: d.notes ?? {} };
  } catch { return null; }
};

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
  // Status draf lokal: 'restored' = isian sesi sebelumnya dipulihkan; 'saved' = baru diamankan.
  const [draftState, setDraftState] = useState<'idle' | 'restored' | 'saved'>('idle');
  const draftHydrated = useRef(false);

  // Pulihkan draf lokal saat halaman dibuka (sekali). Dijalankan di efek — localStorage tak
  // tersedia saat render server, dan membacanya di render awal memicu ketidakcocokan hidrasi.
  useEffect(() => {
    // SEKALI saja. `members` bisa berganti referensi tiap router.refresh() (mis. setelah Simpan);
    // tanpa penjaga ini draf yang baru saja dibersihkan bisa "hidup lagi" dari localStorage.
    if (draftHydrated.current) return;
    draftHydrated.current = true;
    const d = readDraft();
    if (!d) return;
    // Saring ke pegawai yang memang ada di lingkup pengguna INI. Di komputer bersama, draf milik
    // penginput lain (lingkup pegawai berbeda) jadi tak ikut terbawa & tak terhitung.
    const mine = new Set(members.map((m) => m.id));
    const keep = (o: Record<string, string>) =>
      Object.fromEntries(Object.entries(o).filter(([k, v]) => v?.trim() && mine.has(k.split('|')[0])));
    const s = keep(d.scores), n = keep(d.notes);
    if (Object.keys(s).length === 0 && Object.keys(n).length === 0) return;
    setScores(s); setNotes(n); setDraftState('restored');
  }, [members]);

  // Simpan otomatis (debounce 800ms) tiap isian berubah. Hanya menulis ke perangkat.
  useEffect(() => {
    if (!draftHydrated.current) return;                       // jangan timpa sebelum pemulihan
    const t = setTimeout(() => {
      const hasContent = Object.values(scores).some((v) => v?.trim()) || Object.values(notes).some((v) => v?.trim());
      try {
        if (hasContent) { localStorage.setItem(DRAFT_KEY, JSON.stringify({ scores, notes })); setDraftState('saved'); }
        else { localStorage.removeItem(DRAFT_KEY); setDraftState('idle'); }
      } catch { /* penyimpanan penuh/diblokir → abaikan, isian tetap ada di layar */ }
    }, 800);
    return () => clearTimeout(t);
  }, [scores, notes]);

  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* abaikan */ }
    setScores({}); setNotes({}); setDraftState('idle'); setMsg(null);
  };
  const draftCount = useMemo(
    () => Object.values(scores).filter((v) => v?.trim()).length,
    [scores],
  );

  const depts = useMemo(() => [...new Set(members.map((m) => m.dept))].sort(), [members]);
  // Daftar pegawai yang SAH untuk bulan terpilih — dihitung ulang tiap ganti bulan.
  const eligible = useMemo(() => members.filter((m) => eligibleForMonth(m, ym)), [members, ym]);
  const shown = useMemo(() => (dept === 'all' ? eligible : eligible.filter((m) => m.dept === dept)), [eligible, dept]);
  const filledCount = useMemo(() => shown.filter((m) => existing[`${m.id}|${ym}`] !== undefined).length, [shown, existing, ym]);

  // Nilai turunan per baris (dipakai tabel desktop & kartu mobile) — hindari duplikasi logika.
  const fieldsFor = (m: Member) => {
    const key = `${m.id}|${ym}`;
    const saved = existing[key];
    const typed = scores[key]?.trim() ?? '';
    const isEditing = saved !== undefined && typed !== '';   // menimpa nilai lama → wajib komentar
    const noteMissing = isEditing && !(notes[key]?.trim());
    return { key, saved, typed, isEditing, noteMissing };
  };
  // Enter di kolom skor → fokus ke skor baris berikutnya (input cepat).
  const scoreRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusNextScore = (i: number) => scoreRefs.current[i + 1]?.focus();

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

      // `eligible`, bukan `members`: baris Excel untuk pegawai yang sudah keluar sebelum bulan
      // ini jadi "kode tak dikenal" → ditandai tak valid di pratinjau, bukan diam-diam tersimpan.
      const rows = parseKpiRows(raw, eligible);
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
    <div className="space-y-4">
      {/* TOOLBAR (di kanvas, tanpa bingkai): kiri = mode + filter, kanan = keterangan "Terisi".
          Toggle mode sengaja tetap segmented pill (bukan tab garis-bawah) karena ia berada DI
          DALAM satu tab — hierarki: tab halaman = garis bawah, toggle isi = pill. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-1 bg-neutral-tint p-1 rounded-control w-fit">
            {(['manual', 'excel'] as const).map((mo) => (
              <button key={mo} type="button" onClick={() => { setMode(mo); setMsg(null); }}
                className={`px-4 py-1.5 text-[12.5px] font-bold rounded-control transition-colors ${mode === mo ? 'bg-surface text-brand-ink shadow-2xs' : 'text-ink-soft hover:text-ink'}`}>
                {mo === 'manual' ? 'Input Manual' : 'Impor Excel'}
              </button>
            ))}
          </div>
          <label className="block text-sm text-ink-soft">
            Bulan &amp; Tahun Evaluasi
            <select value={ym} onChange={(e) => setYm(e.target.value)} className="mt-1 block rounded-control border border-line bg-surface text-ink data-value px-3 py-2 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {depts.length > 1 && (
            <label className="block text-sm text-ink-soft">
              Divisi
              <select value={dept} onChange={(e) => setDept(e.target.value)} className="mt-1 block rounded-control border border-line bg-surface text-ink px-3 py-2 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
                <option value="all">Semua Divisi</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
        </div>

        {/* Ringkasan cakupan (#5): berapa anggota yang sudah punya skor bulan ini — RATA KANAN. */}
        {mode === 'manual' && (
          <div className="flex flex-col items-end gap-1 text-xs ml-auto">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-tint px-3 py-1 font-semibold text-ink-soft">
                Terisi <strong className="text-brand-ink data-value">{filledCount}</strong> / <span className="data-value">{shown.length}</span> anggota untuk <strong>{ym}</strong>
              </span>
              {filledCount < shown.length && (
                <span className="text-warn-ink font-semibold"><span className="data-value">{shown.length - filledCount}</span> belum diisi</span>
              )}
            </div>
            <DraftHint state={draftState} count={draftCount} onDiscard={discardDraft} />
          </div>
        )}
      </div>

      {mode === 'manual' ? (
        <div className="rounded-panel border border-line bg-surface p-5 space-y-4">
          {/* Desktop: tabel */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.05em] text-ink-faint">
                <th className="py-2 font-semibold">Pegawai</th>
                <th className="py-2 font-semibold">Skor (0–100)</th>
                <th className="py-2 font-semibold">Komentar Audit (jika edit)</th>
                <th className="py-2 text-right whitespace-nowrap pr-1 font-semibold">Tersimpan</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => {
                const { key, saved, isEditing, noteMissing } = fieldsFor(m);
                return (
                <tr key={m.id} className={`border-b border-line-soft ${noteMissing ? 'bg-warn-tint/60' : ''}`}>
                  <td className="py-2 text-ink">
                    {m.name} <span className="text-ink-faint">· {m.dept}</span>
                    <InactiveChip leftOn={m.leftOn} />
                    {saved === undefined && (
                      <span className="ml-2 inline-block rounded-full bg-neutral-tint px-2 py-0.5 text-[10px] font-semibold text-ink-faint align-middle">belum diisi</span>
                    )}
                  </td>
                  <td className="py-2">
                    <input type="number" min={0} max={100} inputMode="decimal" value={scores[key] ?? ''}
                      ref={(el) => { scoreRefs.current[i] = el; }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNextScore(i); } }}
                      placeholder={saved !== undefined ? fmt2(saved) : ''}
                      onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
                      className={`w-24 rounded-control border px-2 py-1 data-value bg-surface focus:outline-none focus:ring-2 focus:ring-brand-tint ${isEditing ? 'border-warn-ink/50 bg-warn-tint/40' : 'border-line focus:border-brand'}`} />
                    {isEditing && (
                      <div className="mt-0.5 text-[10px] font-bold text-warn-ink">↻ ubah dari {fmt2(saved)}</div>
                    )}
                  </td>
                  <td className="py-2">
                    <input type="text" value={notes[key] ?? ''}
                      placeholder={isEditing ? 'Wajib: alasan perubahan' : 'opsional'}
                      onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                      className={`w-full rounded-control border px-2 py-1 bg-surface focus:outline-none focus:ring-2 focus:ring-brand-tint ${noteMissing ? 'border-warn-ink/50 bg-warn-tint/40 placeholder:text-warn-ink' : 'border-line focus:border-brand'}`} />
                  </td>
                  <td className="py-2 text-right whitespace-nowrap pr-1">
                    {saved === undefined ? (
                      <span className="text-ink-faint text-xs">—</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="data-value font-bold text-brand-ink">{fmt2(saved)}</span>
                        <button type="button" disabled={pending}
                          onClick={() => { setDelId(m.id); setDelNote(''); setMsg(null); }}
                          className="text-[11px] font-semibold px-2 py-1 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50">
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

          {/* Mobile: kartu (1 per pegawai) — #7 */}
          <div className="md:hidden space-y-3">
            {shown.map((m) => {
              const { key, saved, isEditing, noteMissing } = fieldsFor(m);
              return (
                <div key={m.id} className={`rounded-panel border p-3 space-y-2 ${noteMissing ? 'border-warn-ink/40 bg-warn-tint/40' : 'border-line'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">
                      {m.name} <span className="text-ink-faint font-normal">· {m.dept}</span>
                      <InactiveChip leftOn={m.leftOn} />
                    </div>
                    {saved === undefined ? (
                      <span className="shrink-0 rounded-full bg-neutral-tint px-2 py-0.5 text-[10px] font-semibold text-ink-faint">belum diisi</span>
                    ) : (
                      <span className="shrink-0 data-value text-sm font-bold text-brand-ink">{fmt2(saved)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={100} inputMode="decimal" value={scores[key] ?? ''}
                      placeholder={saved !== undefined ? fmt2(saved) : 'Skor 0–100'}
                      onChange={(e) => setScores((s) => ({ ...s, [key]: e.target.value }))}
                      className={`w-28 rounded-control border px-2 py-1.5 text-sm data-value bg-surface focus:outline-none focus:ring-2 focus:ring-brand-tint ${isEditing ? 'border-warn-ink/50 bg-warn-tint/40' : 'border-line focus:border-brand'}`} />
                    {isEditing && <span className="text-[10px] font-bold text-warn-ink">↻ dari {fmt2(saved)}</span>}
                    {saved !== undefined && (
                      <button type="button" disabled={pending}
                        onClick={() => { setDelId(m.id); setDelNote(''); setMsg(null); }}
                        className="ml-auto shrink-0 text-[11px] font-semibold px-2 py-1 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50">
                        Hapus
                      </button>
                    )}
                  </div>
                  <input type="text" value={notes[key] ?? ''}
                    placeholder={isEditing ? 'Wajib: alasan perubahan' : 'Komentar audit (opsional)'}
                    onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                    className={`w-full rounded-control border px-2 py-1.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-tint ${noteMissing ? 'border-warn-ink/50 bg-warn-tint/40 placeholder:text-warn-ink' : 'border-line focus:border-brand'}`} />
                </div>
              );
            })}
          </div>

          {/* Konfirmasi penghapusan skor KPI — alasan WAJIB, tercatat di audit. */}
          {delId && (() => {
            const m = shown.find((x) => x.id === delId);
            const saved = existing[`${delId}|${ym}`];
            return (
              <div className="flex flex-col gap-2 bg-danger-tint border border-danger-ink/25 rounded-panel p-3">
                <p className="text-[12px] text-danger-ink">
                  Hapus skor KPI <strong>{m?.name ?? 'pegawai'}</strong> bulan <strong>{ym}</strong>
                  {saved !== undefined && <> (nilai <strong>{fmt2(saved)}</strong>)</>}? Penghapusan
                  <strong> tercatat di Riwayat &amp; Audit</strong> dan mengurangi rerata KPI.
                </p>
                <input type="text" value={delNote} autoFocus
                  onChange={(e) => setDelNote(e.target.value)}
                  placeholder="Alasan penghapusan (wajib)…"
                  className="w-full rounded-control border border-danger-ink/30 bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-danger-tint" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={doDelete} disabled={pending || !delNote.trim()}
                    className="text-xs font-semibold px-3 py-1.5 rounded-control bg-danger-ink hover:opacity-90 text-white disabled:opacity-50">
                    {pending ? 'Menghapus…' : 'Ya, hapus skor'}
                  </button>
                  <button type="button" onClick={() => { setDelId(null); setDelNote(''); }} disabled={pending}
                    className="text-xs font-semibold px-3 py-1.5 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-50">
                    Batal
                  </button>
                </div>
              </div>
            );
          })()}
          <div className="flex items-center gap-3">
            <button onClick={submitManual} disabled={pending} className="rounded-control bg-brand hover:bg-brand-ink px-4 py-2 text-white text-sm font-semibold disabled:opacity-50">
              {pending ? 'Menyimpan…' : 'Simpan Semua Skor'}
            </button>
            {msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
          </div>
        </div>
      ) : (
        <div className="rounded-panel border border-line bg-surface p-5 space-y-3">
          <div className="bg-brand-tint/40 border border-brand/20 rounded-panel p-3 text-xs text-ink-soft">
            Unggah file <strong className="text-ink">.xlsx/.xls/.csv</strong> berkolom <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">emp_code</code> &amp; <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">score</code> (opsional <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">note</code>).
            Skor disimpan untuk bulan <strong className="text-ink">{ym}</strong>. <button type="button" onClick={downloadTemplate} className="text-brand-ink font-semibold hover:underline">Unduh template</button>.
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
            className="block text-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-white file:font-semibold" />
          {parseErr && <p className="text-sm text-danger-ink font-semibold">{parseErr}</p>}

          {parsed && (
            <>
              <div className="overflow-x-auto border border-line rounded-panel">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-neutral-tint text-[10px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
                      <th className="py-2 px-3 font-semibold">Kode</th><th className="py-2 px-3 font-semibold">Pegawai</th>
                      <th className="py-2 px-3 text-center font-semibold">Skor</th><th className="py-2 px-3 font-semibold">Catatan</th><th className="py-2 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {parsed.map((r, i) => {
                      const valid = isValidKpiRow(r);
                      const old = valid && r.member ? existing[`${r.member.id}|${ym}`] : undefined;
                      const overwrite = old !== undefined;
                      return (
                        <tr key={i} className={valid ? '' : 'bg-danger-tint/40'}>
                          <td className="py-2 px-3 data-value text-ink">{r.code}</td>
                          <td className="py-2 px-3 text-ink">{r.member?.name ?? <span className="text-danger-ink">tidak cocok</span>}</td>
                          <td className="py-2 px-3 text-center data-value text-ink">
                            {Number.isFinite(r.score) ? r.score : '—'}
                            {overwrite && <span className="text-warn-ink"> (dari {old})</span>}
                          </td>
                          <td className="py-2 px-3 text-ink-faint">{r.note || '—'}</td>
                          <td className="py-2 px-3">
                            {!valid ? <span className="text-danger-ink font-semibold">✗ Dilewati</span>
                              : overwrite ? <span className="text-warn-ink font-semibold">↻ Menimpa</span>
                              : <span className="text-brand-ink font-semibold">✓ Siap</span>}
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
                  <p className="text-xs text-warn-ink bg-warn-tint border border-warn-ink/25 rounded-control px-3 py-2">
                    <strong>{overwriteN} baris akan menimpa</strong> skor bulan {ym} yang sudah ada (lihat tanda <span className="font-bold">↻ Menimpa</span>). Nilai lama tetap tersimpan di Riwayat &amp; Audit.
                  </p>
                ) : null;
              })()}
              <div className="flex items-center gap-3">
                <button onClick={applyExcel} disabled={pending} className="rounded-control bg-brand hover:bg-brand-ink px-4 py-2 text-white text-sm font-semibold disabled:opacity-50">
                  {pending ? 'Menyimpan…' : `Terapkan & Simpan (${parsed.filter(isValidKpiRow).length} baris)`}
                </button>
                <button onClick={() => setParsed(null)} disabled={pending} className="text-sm font-semibold text-ink-faint hover:text-ink-soft">Batal</button>
                {msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
              </div>
            </>
          )}
          {!parsed && msg && <span className={`text-sm font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
