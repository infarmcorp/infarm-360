'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CheckCircle2, X, Send, Save, XCircle, Trash2, ClipboardList, ChevronDown, Loader2 } from 'lucide-react';
import { submitAssessment, discardAssessment } from '../actions';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Indicator = { id: string; text: string; description?: string | null; ratingGuide?: Record<string, string> | null };
type Group = { id: string; name: string; indicators: Indicator[] };
type Question = { id: string; text: string };

const RATING_LABELS: Record<number, string> = {
  1: 'Hampir Tidak Pernah', 2: 'Jarang', 3: 'Kadang', 4: 'Sering', 5: 'Selalu',
};
const QUAL = '__qual__';

// Status auto-simpan draf.
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

// Panduan Penilaian Umum (statis, paritas legacy) — berlaku untuk semua pertanyaan.
const GENERAL_GUIDE = [
  'Penilaian berbasis perilaku nyata sehari-hari, bukan kedekatan atau sentimen pribadi.',
  'Skala 1 (Hampir Tidak Pernah) hingga 5 (Selalu) — sesuaikan dengan konsistensi tindakan target.',
  'Wajib mengisi komentar/bukti perilaku (min. 4 karakter) sebagai dasar skor.',
  'Gunakan rail aspek & navigasi Sebelumnya/Selanjutnya agar pengisian terstruktur.',
];

/**
 * Form Pengisian 360° — paritas legacy: rail aspek (kiri) + editor SATU indikator
 * (kanan) dengan navigasi Sebelumnya/Selanjutnya, label rating, bar progres, dan
 * komentar/bukti perilaku WAJIB (min. 4 karakter) sebelum kirim. Umpan balik
 * kualitatif jadi item terakhir di rail (opsional).
 *
 * UX tambahan:
 *  - AUTO-SIMPAN draf (debounce 5s) tiap ada perubahan → kerja tak hilang bila HP
 *    ter-lock/refresh. TIDAK aktif untuk penilaian yang sudah 'submitted' (agar tak
 *    menurunkan status), dan dikunci selama proses Kirim agar tak menimpa status.
 *  - Konfirmasi sebelum Kirim + layar sukses sesudahnya (kepastian terkirim).
 */
export function AssessForm({
  targetId, targetName, groups, questions, initialScores, initialAnswers, hasDraft = false, initialStatus = null,
  mandatoryTotal = 0, mandatoryDoneOthers = 0, thisMandatory = false,
}: {
  targetId: string;
  targetName: string;
  groups: Group[];
  questions: Question[];
  initialScores: Record<string, { rating: number | null; comment: string }>;
  initialAnswers: Record<string, string>;
  hasDraft?: boolean;
  initialStatus?: 'draft' | 'submitted' | null;
  mandatoryTotal?: number;
  mandatoryDoneOthers?: number;
  thisMandatory?: boolean;
}) {
  const router = useRouter();
  const aspectGroups = useMemo(() => groups.filter((g) => g.indicators.length > 0), [groups]);

  // Daftar indikator rata dengan nomor Q global + aspek induk.
  const flat = useMemo(() => {
    const arr: { gid: string; gname: string; id: string; text: string; qNum: number; description?: string | null; ratingGuide?: Record<string, string> | null }[] = [];
    let n = 0;
    aspectGroups.forEach((g) => g.indicators.forEach((ind) => {
      n += 1; arr.push({ gid: g.id, gname: g.name, id: ind.id, text: ind.text, qNum: n, description: ind.description, ratingGuide: ind.ratingGuide });
    }));
    return arr;
  }, [aspectGroups]);

  const [ratings, setRatings] = useState<Record<string, number | null>>(() => {
    const o: Record<string, number | null> = {};
    flat.forEach((f) => { o[f.id] = initialScores[f.id]?.rating ?? null; });
    return o;
  });
  const [comments, setComments] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    flat.forEach((f) => { o[f.id] = initialScores[f.id]?.comment ?? ''; });
    return o;
  });
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    questions.forEach((q) => { o[q.id] = initialAnswers[q.id] ?? ''; });
    return o;
  });

  const hasQual = questions.length > 0;
  const [activeGroup, setActiveGroup] = useState<string>(flat[0]?.gid ?? (hasQual ? QUAL : ''));
  const [activeId, setActiveId] = useState<string>(flat[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sentDone, setSentDone] = useState(false);

  // Pengaman auto-save: lockRef = jangan autosave (sedang konfirmasi/kirim/selesai);
  // savingRef = ada autosave berjalan; hydratedRef = lewati render awal.
  const lockRef = useRef(false);
  const savingRef = useRef(false);
  const hydratedRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const navedRef = useRef(false);

  const indDone = (id: string) => ratings[id] != null && (comments[id] ?? '').trim().length >= 4;
  const indDoneCount = flat.filter((f) => indDone(f.id)).length;
  const total = flat.length;                                  // jumlah indikator (dipakai navigasi)
  const qualDone = questions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length;
  // Progres mencakup indikator + esai kualitatif (kini WAJIB semua).
  const progTotal = total + (hasQual ? questions.length : 0);
  const progDone = indDoneCount + (hasQual ? qualDone : 0);
  const pct = progTotal ? Math.round((progDone / progTotal) * 100) : 0;
  // Kelengkapan total → tombol Kirim adaptif (lengkapi vs kirim).
  const allComplete = total > 0 && progDone >= progTotal;
  const remaining = Math.max(0, progTotal - progDone);

  const curList = flat.filter((f) => f.gid === activeGroup);
  const cur = flat.find((f) => f.id === activeId) ?? curList[0] ?? null;
  const curPos = cur ? flat.findIndex((f) => f.id === cur.id) : -1;

  const buildPayload = (status: 'draft' | 'submitted') => ({
    targetId, status,
    scores: flat.map((f) => ({ indicatorId: f.id, rating: ratings[f.id] ?? null, comment: comments[f.id] ?? '' })),
    answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' })),
  });

  // AUTO-SIMPAN draf: debounce 5s setelah perubahan terakhir.
  useEffect(() => {
    if (!hydratedRef.current) { hydratedRef.current = true; return; }      // lewati mount awal
    if (initialStatus === 'submitted' || lockRef.current || busy || sentDone) return; // jangan turunkan status / balapan kirim
    const hasContent =
      flat.some((f) => ratings[f.id] != null || (comments[f.id] ?? '').trim().length > 0) ||
      questions.some((q) => (answers[q.id] ?? '').trim().length > 0);
    if (!hasContent) return;                                               // jangan buat draf kosong

    setSaveState('pending');
    const t = setTimeout(async () => {
      if (lockRef.current || savingRef.current) return;
      savingRef.current = true; setSaveState('saving');
      const res = await submitAssessment(buildPayload('draft'));
      savingRef.current = false;
      setSaveState(res.ok ? 'saved' : 'error');
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratings, comments, answers]);

  // Saat BERPINDAH indikator/aspek/kualitatif (bukan saat mengetik): lepas fokus
  // (iOS → zoom-out, Android → tutup keyboard) lalu gulir ke pertanyaan di HP.
  useEffect(() => {
    if (!navedRef.current) { navedRef.current = true; return; }   // lewati mount awal
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeId, activeGroup]);

  function selectGroup(gid: string) {
    setActiveGroup(gid);
    if (gid === QUAL) return;
    if (!flat.some((f) => f.gid === gid && f.id === activeId)) {
      setActiveId(flat.find((f) => f.gid === gid)?.id ?? '');
    }
  }
  function goTo(idx: number) {
    const f = flat[idx];
    if (f) { setActiveGroup(f.gid); setActiveId(f.id); }
  }
  // "Selanjutnya": antar-indikator; dari indikator TERAKHIR → lompat ke Umpan Balik Kualitatif.
  function goNext() {
    if (curPos < total - 1) goTo(curPos + 1);
    else if (hasQual) setActiveGroup(QUAL);
  }
  const atLastQuant = curPos >= total - 1;

  // Simpan Draf manual.
  async function saveDraft() {
    setBusy(true); setError(null);
    const res = await submitAssessment(buildPayload('draft'));
    setBusy(false);
    if (!res.ok) { setError(res.error); setSaveState('error'); return; }
    setSaveState('saved'); router.refresh();
  }

  // Tahap 1 Kirim: validasi → tampilkan konfirmasi (kunci autosave).
  function submit() {
    for (const f of flat) {
      if (ratings[f.id] == null) {
        setActiveGroup(f.gid); setActiveId(f.id);
        setError(`Beri rating untuk Q${f.qNum}: ${f.text}`);
        return;
      }
      if ((comments[f.id] ?? '').trim().length < 4) {
        setActiveGroup(f.gid); setActiveId(f.id);
        setError(`Isi komentar/bukti perilaku Q${f.qNum} (min. 4 karakter).`);
        return;
      }
    }
    // Semua pertanyaan kualitatif (esai) wajib diisi.
    if (hasQual) {
      const empty = questions.find((q) => (answers[q.id] ?? '').trim().length === 0);
      if (empty) {
        setActiveGroup(QUAL);
        setError('Semua pertanyaan Umpan Balik Kualitatif wajib diisi sebelum mengirim.');
        return;
      }
    }
    setError(null);
    lockRef.current = true;     // hentikan autosave selama proses kirim
    setConfirmSend(true);
  }

  function cancelSend() {
    setConfirmSend(false);
    lockRef.current = false;    // izinkan autosave lagi
  }

  // Tahap 2 Kirim: tunggu autosave yang sedang jalan agar tak menimpa status, lalu kirim.
  async function doSend() {
    setConfirmSend(false); setBusy(true); setError(null);
    for (let i = 0; i < 60 && savingRef.current; i++) await new Promise((r) => setTimeout(r, 50));
    const res = await submitAssessment(buildPayload('submitted'));
    setBusy(false);
    if (!res.ok) { setError(res.error); lockRef.current = false; return; }
    setSentDone(true);
  }

  function discard() { setConfirmDiscard(true); }
  async function doDiscard() {
    setBusy(true); setError(null);
    const res = await discardAssessment(targetId);
    setBusy(false);
    setConfirmDiscard(false);
    if (!res.ok) { setError(res.error); return; }
    router.push('/penilaian'); router.refresh();
  }

  // Layar sukses setelah Kirim — kepastian "terkirim" + ingatkan sisa penilaian WAJIB.
  if (sentDone) {
    const doneNow = mandatoryDoneOthers + (thisMandatory ? 1 : 0);
    const remaining = Math.max(0, mandatoryTotal - doneNow);
    return (
      <div className="flex flex-col items-center text-center py-10 px-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-9 h-9 text-emerald-700" />
        </div>
        <h2 className="text-lg font-extrabold text-gray-900">Penilaian Terkirim ✓</h2>
        <p className="text-sm text-gray-600 mt-1.5 max-w-md">
          Penilaian untuk <span className="font-bold text-gray-800">{targetName}</span> berhasil dikirim.
          Anda masih bisa <span className="font-semibold">mengeditnya kapan saja</span> dari Daftar Penilaian.
        </p>
        {mandatoryTotal > 0 && (
          <div className={`mt-4 px-4 py-2.5 rounded-xl border text-sm font-bold ${remaining > 0 ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>
            {remaining > 0
              ? <>Penilaian wajib: {doneNow}/{mandatoryTotal} selesai · <span className="font-extrabold">masih ada {remaining} lagi</span> untuk dikerjakan.</>
              : <>🎉 Semua {mandatoryTotal} penilaian wajib Anda sudah selesai!</>}
          </div>
        )}
        <button type="button" onClick={() => { router.push('/penilaian'); router.refresh(); }}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white">
          <ChevronLeft className="w-4 h-4" /> {remaining > 0 ? 'Lanjut ke Penilaian Berikutnya' : 'Kembali ke Daftar Penilaian'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bar progres + indikator auto-simpan */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-2.5 bg-gray-100 flex-1 rounded-full overflow-hidden">
            <div style={{ width: `${pct}%` }} className="h-full bg-emerald-600 rounded-full transition-all" />
          </div>
          <span className="text-xs font-bold text-emerald-800 font-mono shrink-0">{progDone}/{progTotal} · {pct}%</span>
        </div>
        <AutoSaveHint state={saveState} disabled={initialStatus === 'submitted'} />
      </div>

      {/* Panduan Penilaian Umum (statis, berlaku semua pertanyaan) */}
      <div className="bg-stone-50/70 border border-stone-200 rounded-xl">
        <button type="button" onClick={() => setGuideOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
          <ClipboardList className="w-4 h-4 text-emerald-800 shrink-0" />
          <span className="text-xs font-extrabold text-gray-800 flex-1">Panduan Penilaian Umum</span>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <ul className="list-disc list-inside space-y-1.5 px-4 pb-3 text-[11px] text-gray-600 leading-relaxed">
            {GENERAL_GUIDE.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* RAIL aspek — HP: strip horizontal yang bisa di-geser; layar lebar (lg): vertikal. */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Aspek Budaya</label>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {aspectGroups.map((g) => {
            const items = flat.filter((f) => f.gid === g.id);
            const done = items.filter((f) => indDone(f.id)).length;
            const all = done === items.length;
            const active = activeGroup === g.id;
            return (
              <button key={g.id} type="button" onClick={() => selectGroup(g.id)}
                className={`shrink-0 w-[150px] lg:w-full p-3 rounded-xl border text-left transition-all ${active ? 'border-emerald-700 bg-emerald-50/60 ring-1 ring-emerald-700' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <span className={`text-xs leading-tight block ${active ? 'font-extrabold text-emerald-950' : 'font-semibold text-gray-700'}`}>{g.name}</span>
                <span className="flex items-center justify-between mt-1.5 text-[10px] font-bold text-gray-500">
                  <span>{items.length} indikator</span>
                  {all
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    : <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">{done}/{items.length}</span>}
                </span>
              </button>
            );
          })}
          {hasQual && (
            <button type="button" onClick={() => selectGroup(QUAL)}
              className={`shrink-0 w-[150px] lg:w-full p-3 rounded-xl border text-left transition-all ${activeGroup === QUAL ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <span className={`text-xs leading-tight block ${activeGroup === QUAL ? 'font-extrabold text-indigo-950' : 'font-semibold text-gray-700'}`}>Umpan Balik Kualitatif</span>
              <span className="flex items-center justify-between mt-1.5 text-[10px] font-bold text-gray-500">
                <span>{questions.length} pertanyaan</span>
                <span className={`px-1.5 py-0.5 rounded font-mono ${qualDone >= questions.length ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{qualDone}/{questions.length}</span>
              </span>
            </button>
          )}
          </div>
        </div>

        {/* EDITOR */}
        <div ref={editorRef} className="min-w-0 scroll-mt-24">
          {activeGroup === QUAL ? (
            <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-extrabold text-indigo-800">Umpan Balik Kualitatif <span className="text-[10px] font-bold text-rose-500">(wajib diisi semua)</span></h3>
              {questions.map((q) => {
                const filled = (answers[q.id] ?? '').trim().length > 0;
                return (
                  <div key={q.id}>
                    <p className="text-sm text-gray-700 mb-1.5">{q.text} <span className="text-rose-500">*</span></p>
                    <textarea rows={2} value={answers[q.id]} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                      placeholder="Tulis jawaban Anda…"
                      className={`w-full text-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 ${filled ? 'border-gray-200' : 'border-rose-200'}`} />
                    {!filled && <p className="text-[10px] text-rose-500 font-semibold mt-0.5">Wajib diisi</p>}
                  </div>
                );
              })}
              {/* Navigasi: kembali ke indikator kuantitatif terakhir (simetri dgn "Selanjutnya"). */}
              {total > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs font-bold text-gray-600">
                  <button type="button" onClick={() => goTo(total - 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg">
                    <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
                  </button>
                  <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Langkah terakhir</span>
                </div>
              )}
            </div>
          ) : cur ? (
            <div className="space-y-3">
              {/* Chip indikator dalam aspek aktif */}
              <div className="flex flex-wrap gap-2">
                {curList.map((f) => {
                  const isActive = f.id === cur.id;
                  const filled = indDone(f.id);
                  return (
                    <button key={f.id} type="button" onClick={() => setActiveId(f.id)}
                      className={`px-3 py-2 rounded-xl border text-left min-w-[110px] max-w-[180px] flex-1 transition-all ${isActive ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500' : filled ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-gray-50/60 hover:bg-gray-100'}`}>
                      <span className="text-[10px] text-gray-500 font-bold block">Q{f.qNum}{filled ? ' ✓' : ''}</span>
                      <span className="text-[11px] leading-tight line-clamp-1 text-gray-700">{f.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Editor satu indikator */}
              <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-extrabold text-sm text-gray-900">Q{cur.qNum}: {cur.text}</h3>
                  {(ratings[cur.id] != null || (comments[cur.id] ?? '') !== '') && (
                    <button type="button" title="Bersihkan jawaban indikator ini"
                      onClick={() => { setRatings((p) => ({ ...p, [cur.id]: null })); setComments((p) => ({ ...p, [cur.id]: '' })); }}
                      className="p-1 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"><X className="w-4 h-4" /></button>
                  )}
                </div>

                {/* Deskripsi indikator (opsional, dari Kelola Pertanyaan) */}
                {cur.description && (
                  <div className="border border-sky-200 border-l-4 border-l-sky-500 bg-sky-100/80 p-3.5 rounded-lg shadow-sm text-[13px] text-sky-950 leading-relaxed font-semibold">
                    {cur.description}
                  </div>
                )}

                {/* Panduan rating per level (opsional) */}
                {cur.ratingGuide && Object.keys(cur.ratingGuide).length > 0 && (
                  <div className="bg-stone-50/70 border border-stone-200 rounded-xl p-3 space-y-1.5">
                    <span className="text-[10px] font-extrabold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-emerald-800" /> Panduan Rating
                    </span>
                    {[5, 4, 3, 2, 1].map((n) => cur.ratingGuide?.[String(n)] ? (
                      <div key={n} className="flex gap-2 items-start text-[11px]">
                        <span className="font-black text-emerald-800 font-mono w-4 text-center shrink-0 rounded bg-emerald-50 border border-emerald-100">{n}</span>
                        <span className="text-gray-700 leading-snug"><strong className="text-gray-900">{RATING_LABELS[n]}</strong> · {cur.ratingGuide![String(n)]}</span>
                      </div>
                    ) : null)}
                  </div>
                )}

                {/* Rating berlabel */}
                <div className="bg-gray-50/60 border border-gray-200 rounded-xl p-3">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Rating (klik untuk pilih)</span>
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const sel = ratings[cur.id] === n;
                      return (
                        <button key={n} type="button" onClick={() => setRatings((p) => ({ ...p, [cur.id]: n }))}
                          className={`flex flex-col items-center gap-0.5 py-2.5 rounded-lg border font-extrabold transition-all ${sel ? 'bg-emerald-700 text-white border-emerald-700 shadow' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                          <span className="text-lg leading-none">{n}</span>
                          {/* Label mungil hanya di layar lebar; di HP digantikan baris "Pilihan Anda" di bawah. */}
                          <span className={`hidden sm:block text-[9px] text-center font-bold leading-tight ${sel ? 'text-emerald-50' : 'text-gray-500'}`}>{RATING_LABELS[n]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Label terbaca untuk rating terpilih — terutama berguna di HP (label tombol disembunyikan). */}
                  <div className="mt-2 text-center sm:hidden">
                    {ratings[cur.id] != null ? (
                      <span className="text-xs font-bold text-emerald-800">Pilihan Anda: {ratings[cur.id]} · {RATING_LABELS[ratings[cur.id]!]}</span>
                    ) : (
                      <span className="text-xs font-semibold text-gray-400">Pilih rating 1 (Hampir Tidak Pernah) – 5 (Selalu)</span>
                    )}
                  </div>
                </div>

                {/* Komentar WAJIB */}
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                    Komentar / Bukti Perilaku <span className="text-rose-500">*</span>
                  </label>
                  <textarea rows={3} value={comments[cur.id] ?? ''} onChange={(e) => setComments((p) => ({ ...p, [cur.id]: e.target.value }))}
                    placeholder="Jelaskan rating dengan contoh konkret (situasi nyata, perilaku yang terlihat, frekuensi)."
                    className="w-full text-xs p-3 border border-gray-250 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-700 resize-y" />
                  <div className="flex justify-end text-[10px]">
                    <span className={(comments[cur.id] ?? '').trim().length >= 4 ? 'text-emerald-700 font-extrabold' : 'text-rose-500 font-extrabold font-mono'}>
                      {(comments[cur.id] ?? '').trim().length >= 4 ? `${(comments[cur.id] ?? '').trim().length} karakter` : 'Wajib · min. 4 karakter'}
                    </span>
                  </div>
                </div>

                {/* Navigasi Sebelumnya / Selanjutnya */}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-xs font-bold text-gray-600">
                  <button type="button" disabled={curPos <= 0} onClick={() => goTo(curPos - 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
                    <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
                  </button>
                  <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Q{cur.qNum}/{total}</span>
                  <button type="button" disabled={atLastQuant && !hasQual} onClick={goNext}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
                    {atLastQuant && hasQual ? 'Ke Umpan Balik Kualitatif' : 'Selanjutnya'} <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Belum ada indikator pada periode ini.</p>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}

      {/* Konfirmasi Kirim */}
      {confirmSend && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-emerald-950 font-semibold">
            Kirim penilaian untuk <span className="font-extrabold">{targetName}</span>?
            <span className="block text-[11px] font-normal text-emerald-800 mt-0.5">Setelah dikirim, Anda tetap bisa mengeditnya kapan saja.</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <button type="button" disabled={busy} onClick={cancelSend}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60">
              Batal
            </button>
            <button type="button" disabled={busy} onClick={doSend}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
              <Send className="w-4 h-4 text-emerald-100" /> {busy ? 'Mengirim…' : 'Ya, Kirim Sekarang'}
            </button>
          </div>
        </div>
      )}

      {/* Kontrol bawah */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 flex flex-col sm:flex-row justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => router.push('/penilaian')}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60">
            <XCircle className="w-4 h-4 text-gray-500" /> Batal
          </button>
          {hasDraft && (
            <button type="button" disabled={busy} onClick={discard}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-rose-600 bg-white border border-rose-300 hover:bg-rose-50 disabled:opacity-60">
              <Trash2 className="w-4 h-4" /> Buang Draf
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={saveDraft}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-indigo-900 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-60">
            <Save className="w-4 h-4 text-indigo-700" /> Simpan Draf
          </button>
          {/* Tombol adaptif: belum lengkap → "Lengkapi" (kuning, tetap bisa diklik untuk
              memandu ke yang kurang); lengkap → "Kirim" (hijau). */}
          <button type="button" disabled={busy || total === 0 || saveState === 'saving' || confirmSend} onClick={submit}
            className={`inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-lg disabled:opacity-50 ${
              allComplete
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                : 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
            }`}>
            <Send className={`w-4 h-4 ${allComplete ? 'text-emerald-100' : 'text-amber-700'}`} />
            {busy ? 'Memproses…' : allComplete ? 'Kirim Penilaian 360°' : `Lengkapi Penilaian (${remaining} tersisa)`}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDiscard}
        title="Buang draf penilaian?"
        tone="danger"
        confirmLabel="Buang Draf"
        busy={busy}
        onConfirm={doDiscard}
        onCancel={() => { if (!busy) setConfirmDiscard(false); }}
      >
        <p>Semua rating &amp; komentar yang tersimpan sebagai draf akan <strong>dihapus</strong>. Tindakan ini tak bisa dibatalkan.</p>
      </ConfirmDialog>
    </div>
  );
}

/** Indikator kecil status auto-simpan draf. */
function AutoSaveHint({ state, disabled }: { state: SaveState; disabled: boolean }) {
  if (disabled) {
    return <p className="text-[11px] text-gray-400">Penilaian sudah terkirim — perubahan disimpan saat Anda menekan Kirim.</p>;
  }
  if (state === 'saving') return <p className="text-[11px] text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Menyimpan otomatis…</p>;
  if (state === 'pending') return <p className="text-[11px] text-amber-600 font-semibold">Perubahan belum disimpan…</p>;
  if (state === 'saved') return <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Tersimpan otomatis</p>;
  if (state === 'error') return <p className="text-[11px] text-rose-600 font-semibold">Gagal menyimpan otomatis — tekan “Simpan Draf”.</p>;
  return <p className="text-[11px] text-gray-400">Draf tersimpan otomatis saat Anda mengisi.</p>;
}
