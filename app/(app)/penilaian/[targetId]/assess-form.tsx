'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CheckCircle2, X, Send, Save, XCircle, Trash2, ClipboardList, ChevronDown, Loader2, Pencil, ListChecks } from 'lucide-react';
import { submitAssessment, discardAssessment } from '../actions';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Indicator = { id: string; text: string; description?: string | null; ratingGuide?: Record<string, string> | null; ratingKeyPoints?: Record<string, string> | null };
type Group = { id: string; name: string; indicators: Indicator[] };
type Question = { id: string; text: string };

// Label BARS generik — CADANGAN saja bila indikator belum diisi key point-nya sendiri
// (Kelola Pertanyaan). Key point sesungguhnya khusus per indikator, lihat mockup Screen 03.
const FALLBACK_KEY_POINTS: Record<number, string> = {
  1: 'Evidence Paling Rendah', 2: 'Di Bawah Ekspektasi', 3: 'Sesuai Ekspektasi', 4: 'Di Atas Ekspektasi', 5: 'Evidence Paling Kuat',
};
const EVIDENCE_MIN = 20;
const QUAL = '__qual__';

// Status auto-simpan draf.
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

// Panduan Penilaian Umum (statis, paritas legacy) — berlaku untuk semua pertanyaan.
const GENERAL_GUIDE = [
  'Penilaian berbasis perilaku nyata sehari-hari, bukan kedekatan atau sentimen pribadi.',
  'Skala BARS 1 (evidence paling rendah) hingga 5 (evidence paling kuat) — sesuaikan panduan perilaku tiap level.',
  'Wajib mengisi komentar/bukti perilaku (evidence, min. 20 karakter) sebagai dasar skor.',
  'Gunakan rail aspek & navigasi Sebelumnya/Selanjutnya agar pengisian terstruktur.',
];

/**
 * Form Pengisian 360° — paritas legacy: rail aspek (kiri) + editor SATU indikator
 * (kanan) dengan navigasi Sebelumnya/Selanjutnya, label rating, bar progres, dan
 * komentar/bukti perilaku WAJIB (min. 20 karakter, BR-06) sebelum kirim. Umpan balik
 * kualitatif jadi item terakhir di rail (opsional).
 *
 * UX tambahan:
 *  - AUTO-SIMPAN draf (debounce 5s) tiap ada perubahan → kerja tak hilang bila HP
 *    ter-lock/refresh. TIDAK aktif untuk penilaian yang sudah 'submitted' (agar tak
 *    menurunkan status), dan dikunci selama proses Kirim agar tak menimpa status.
 *  - Konfirmasi sebelum Kirim + layar sukses sesudahnya (kepastian terkirim).
 *  - Screen 04 (Review & Submit): bila semua lengkap, tombol utama = "Review Penilaian" → ringkasan
 *    seluruh indikator (skor + evidence) & esai, tombol Edit kembali ke indikator terkait, baru Kirim.
 */
export function AssessForm({
  targetId, targetName, groups, questions, initialScores, initialAnswers, hasDraft = false, initialStatus = null,
  mandatoryTotal = 0, mandatoryDoneOthers = 0, thisMandatory = false, deadlinePassed = false,
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
  /** Deadline periode sudah lewat → setelah dikirim penilaian terkunci (Decision 01). */
  deadlinePassed?: boolean;
}) {
  const router = useRouter();
  const aspectGroups = useMemo(() => groups.filter((g) => g.indicators.length > 0), [groups]);

  // Daftar indikator rata dengan nomor Q global + aspek induk.
  const flat = useMemo(() => {
    const arr: { gid: string; gname: string; id: string; text: string; qNum: number; description?: string | null; ratingGuide?: Record<string, string> | null; ratingKeyPoints?: Record<string, string> | null }[] = [];
    let n = 0;
    aspectGroups.forEach((g) => g.indicators.forEach((ind) => {
      n += 1; arr.push({ gid: g.id, gname: g.name, id: ind.id, text: ind.text, qNum: n, description: ind.description, ratingGuide: ind.ratingGuide, ratingKeyPoints: ind.ratingKeyPoints });
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
  // Fitur N/A (BR-05) DICABUT 2026-09-29 (permintaan HRD): semua indikator wajib rating + evidence.
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
  const [reviewing, setReviewing] = useState(false);

  // Pengaman auto-save: lockRef = jangan autosave (sedang konfirmasi/kirim/selesai);
  // savingRef = ada autosave berjalan; hydratedRef = lewati render awal.
  const lockRef = useRef(false);
  const savingRef = useRef(false);
  const hydratedRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const navedRef = useRef(false);

  const indDone = (id: string) =>
    ratings[id] != null && (comments[id] ?? '').trim().length >= EVIDENCE_MIN;
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
    scores: flat.map((f) => ({
      indicatorId: f.id,
      rating: ratings[f.id] ?? null,
      comment: comments[f.id] ?? '',
    })),
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

  /**
   * ENTER = lanjut ke pertanyaan berikutnya (permintaan pengguna — terutama di HP, di mana
   * tombol "Selanjutnya" sering tertutup keyboard sehingga tap-nya tak kena). Shift+Enter tetap
   * membuat baris baru untuk komentar panjang. `blur()` dipanggil lebih dulu agar keyboard HP
   * menutup & efek navigasi (gulir ke pertanyaan) berjalan pada layar yang sudah stabil.
   */
  function onCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    e.currentTarget.blur();
    goNext();
  }

  // Enter pada esai kualitatif → pindah ke kolom esai berikutnya (terakhir → lepas fokus).
  const qualRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  function onQualKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const nextField = qualRefs.current[i + 1];
    if (nextField) nextField.focus();
    else e.currentTarget.blur();
  }

  // Simpan Draf manual.
  async function saveDraft() {
    setBusy(true); setError(null);
    const res = await submitAssessment(buildPayload('draft'));
    setBusy(false);
    if (!res.ok) { setError(res.error); setSaveState('error'); return; }
    setSaveState('saved'); router.refresh();
  }

  // Tahap 1: validasi kelengkapan → buka halaman Review (Screen 04).
  function submit() {
    for (const f of flat) {
      if (ratings[f.id] == null) {
        setActiveGroup(f.gid); setActiveId(f.id);
        setError(`Beri rating untuk Q${f.qNum}: ${f.text}`);
        return;
      }
      if ((comments[f.id] ?? '').trim().length < EVIDENCE_MIN) {
        setActiveGroup(f.gid); setActiveId(f.id);
        setError(`Isi komentar/bukti perilaku (evidence) Q${f.qNum} minimal ${EVIDENCE_MIN} karakter.`);
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
    setReviewing(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Tahap 2 (dari halaman Review): tampilkan konfirmasi kirim (kunci autosave).
  function askSend() {
    setError(null);
    lockRef.current = true;     // hentikan autosave selama proses kirim
    setConfirmSend(true);
  }

  // Edit dari halaman Review → kembali ke indikator/esai terkait.
  function editFrom(target: string) {
    cancelSend();
    setReviewing(false);
    if (target === QUAL) setActiveGroup(QUAL);
    else { const i = flat.findIndex((f) => f.id === target); if (i >= 0) goTo(i); }
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
        <div className="w-16 h-16 rounded-full bg-brand-tint flex items-center justify-center mb-4">
          <CheckCircle2 className="w-9 h-9 text-brand" />
        </div>
        <h2 className="text-lg font-extrabold text-ink">Penilaian Terkirim ✓</h2>
        <p className="text-sm text-ink-soft mt-1.5 max-w-md">
          Penilaian untuk <span className="font-bold text-ink">{targetName}</span> berhasil dikirim.
          {deadlinePassed
            ? <>Deadline sudah lewat, sehingga penilaian ini <span className="font-semibold">tidak dapat diubah lagi</span>.</>
            : <>Anda masih bisa <span className="font-semibold">mengeditnya sampai deadline</span> dari Daftar Penilaian.</>}
        </p>
        {mandatoryTotal > 0 && (
          <div className={`mt-4 px-4 py-2.5 rounded-panel border text-sm font-bold ${remaining > 0 ? 'bg-warn-tint border-warn-ink/30 text-warn-ink' : 'bg-brand-tint border-brand-ink/25 text-brand-ink'}`}>
            {remaining > 0
              ? <>Penilaian wajib: {doneNow}/{mandatoryTotal} selesai · <span className="font-extrabold">masih ada {remaining} lagi</span> untuk dikerjakan.</>
              : <>🎉 Semua {mandatoryTotal} penilaian wajib Anda sudah selesai!</>}
          </div>
        )}
        <button type="button" onClick={() => { router.push('/penilaian'); router.refresh(); }}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-control bg-brand hover:bg-brand-ink text-white">
          <ChevronLeft className="w-4 h-4" /> {remaining > 0 ? 'Lanjut ke Penilaian Berikutnya' : 'Kembali ke Daftar Penilaian'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bar progres + indikator auto-simpan */}
      <div className="bg-surface border border-line rounded-panel p-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-2.5 bg-neutral-tint flex-1 rounded-full overflow-hidden">
            <div style={{ width: `${pct}%` }} className="h-full bg-brand rounded-full transition-all" />
          </div>
          <span className="text-xs font-bold text-brand-ink data-value shrink-0">{progDone}/{progTotal} · {pct}%</span>
        </div>
        <AutoSaveHint state={saveState} disabled={initialStatus === 'submitted'} />
      </div>

      {/* Panduan Penilaian Umum (statis, berlaku semua pertanyaan) — disembunyikan di halaman Review. */}
      {!reviewing && (
      <div className="bg-neutral-tint border border-line rounded-panel">
        <button type="button" onClick={() => setGuideOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
          <ClipboardList className="w-4 h-4 text-brand shrink-0" />
          <span className="text-xs font-extrabold text-ink flex-1">Panduan Penilaian Umum</span>
          <ChevronDown className={`w-4 h-4 text-ink-faint transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <ul className="list-disc list-inside space-y-1.5 px-4 pb-3 text-[11px] text-ink-soft leading-relaxed">
            {GENERAL_GUIDE.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        )}
      </div>
      )}

      {reviewing ? (
        <ReviewPanel
          flat={flat} ratings={ratings} comments={comments}
          questions={questions} answers={answers} onEdit={editFrom}
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* RAIL aspek — HP: strip horizontal yang bisa di-geser; layar lebar (lg): vertikal. */}
        <div>
          <label className="block text-[11px] font-bold text-ink-faint uppercase tracking-wider mb-1.5">Aspek Budaya</label>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {aspectGroups.map((g) => {
            const items = flat.filter((f) => f.gid === g.id);
            const done = items.filter((f) => indDone(f.id)).length;
            const all = done === items.length;
            const active = activeGroup === g.id;
            return (
              <button key={g.id} type="button" onClick={() => selectGroup(g.id)}
                className={`shrink-0 w-[150px] lg:w-full p-3 rounded-control border text-left transition-all ${active ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-neutral-tint'}`}>
                <span className={`text-xs leading-tight block ${active ? 'font-extrabold text-brand-ink' : 'font-semibold text-ink-soft'}`}>{g.name}</span>
                <span className="flex items-center justify-between mt-1.5 text-[10px] font-bold text-ink-faint">
                  <span>{items.length} indikator</span>
                  {all
                    ? <CheckCircle2 className="w-4 h-4 text-brand" />
                    : <span className="px-1.5 py-0.5 rounded-control bg-neutral-tint text-ink-soft data-value">{done}/{items.length}</span>}
                </span>
              </button>
            );
          })}
          {hasQual && (
            <button type="button" onClick={() => selectGroup(QUAL)}
              className={`shrink-0 w-[150px] lg:w-full p-3 rounded-control border text-left transition-all ${activeGroup === QUAL ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-neutral-tint'}`}>
              <span className={`text-xs leading-tight block ${activeGroup === QUAL ? 'font-extrabold text-brand-ink' : 'font-semibold text-ink-soft'}`}>Umpan Balik Kualitatif</span>
              <span className="flex items-center justify-between mt-1.5 text-[10px] font-bold text-ink-faint">
                <span>{questions.length} pertanyaan</span>
                <span className={`px-1.5 py-0.5 rounded-control data-value ${qualDone >= questions.length ? 'bg-brand-tint text-brand-ink' : 'bg-neutral-tint text-ink-soft'}`}>{qualDone}/{questions.length}</span>
              </span>
            </button>
          )}
          </div>
        </div>

        {/* EDITOR */}
        <div ref={editorRef} className="min-w-0 scroll-mt-24">
          {activeGroup === QUAL ? (
            <div className="border border-line rounded-panel p-5 space-y-4">
              <h3 className="text-sm font-extrabold text-ink">Umpan Balik Kualitatif <span className="text-[10px] font-bold text-danger-ink">(wajib diisi semua)</span></h3>
              <p className="text-[10px] text-ink-faint -mt-2">
                Tekan <kbd className="data-value font-bold text-ink-soft bg-neutral-tint border border-line rounded px-1">Enter</kbd> untuk pindah ke pertanyaan berikutnya
                · <kbd className="data-value font-bold text-ink-soft bg-neutral-tint border border-line rounded px-1">Shift+Enter</kbd> baris baru.
              </p>
              {questions.map((q, qi) => {
                const filled = (answers[q.id] ?? '').trim().length > 0;
                return (
                  <div key={q.id}>
                    <p className="text-sm text-ink-soft mb-1.5">{q.text} <span className="text-danger-ink">*</span></p>
                    <textarea rows={2} value={answers[q.id]} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                      ref={(el) => { qualRefs.current[qi] = el; }}
                      onKeyDown={(e) => onQualKeyDown(e, qi)}
                      placeholder="Tulis jawaban Anda…"
                      className={`w-full text-xs px-3 py-2 border rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint ${filled ? 'border-line' : 'border-danger-ink/40'}`} />
                    {!filled && <p className="text-[10px] text-danger-ink font-semibold mt-0.5">Wajib diisi</p>}
                  </div>
                );
              })}
              {/* Navigasi: kembali ke indikator kuantitatif terakhir (simetri dgn "Selanjutnya"). */}
              {total > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-line-soft text-xs font-bold text-ink-soft">
                  <button type="button" onClick={() => goTo(total - 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-line bg-surface hover:bg-neutral-tint rounded-control">
                    <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
                  </button>
                  <span className="data-value text-[10px] text-ink-faint bg-neutral-tint px-2 py-0.5 rounded-control">Langkah terakhir</span>
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
                      className={`px-3 py-2 rounded-control border text-left min-w-[110px] max-w-[180px] flex-1 transition-all ${isActive ? 'border-brand bg-brand-tint ring-1 ring-brand' : filled ? 'border-brand-ink/25 bg-brand-tint/50' : 'border-line bg-neutral-tint hover:bg-neutral-tint/70'}`}>
                      <span className="text-[10px] text-ink-faint font-bold block">Q{f.qNum}{filled ? ' ✓' : ''}</span>
                      <span className="text-[11px] leading-tight line-clamp-1 text-ink-soft">{f.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Editor satu indikator */}
              <div className="border border-line rounded-panel p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-extrabold text-base sm:text-lg text-ink">Q{cur.qNum}: {cur.text}</h3>
                  {(ratings[cur.id] != null || (comments[cur.id] ?? '') !== '') && (
                    <button type="button" title="Bersihkan jawaban indikator ini"
                      onClick={() => {
                        setRatings((p) => ({ ...p, [cur.id]: null })); setComments((p) => ({ ...p, [cur.id]: '' }));
                      }}
                      className="p-1 text-ink-faint hover:text-danger-ink hover:bg-danger-tint rounded-control shrink-0"><X className="w-4 h-4" /></button>
                  )}
                </div>

                {/* Deskripsi indikator (opsional, dari Kelola Pertanyaan) */}
                {cur.description && (
                  <div className="border border-line border-l-4 border-l-brand bg-brand-tint/40 p-3.5 rounded-control text-[15px] text-ink leading-relaxed font-semibold">
                    {cur.description}
                  </div>
                )}

                {/* Panduan BARS untuk indikator ini — key point (khusus indikator ini) + deskripsi. */}
                {(cur.ratingGuide && Object.keys(cur.ratingGuide).length > 0) && (
                  <div className="bg-neutral-tint border border-line rounded-panel p-3 space-y-2">
                    <span className="text-[11px] font-extrabold text-ink uppercase tracking-wide flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-brand" /> Panduan BARS untuk indikator ini
                    </span>
                    <p className="text-[12px] text-ink-faint -mt-1">Pilih skor berdasarkan perilaku yang paling sesuai dengan pengamatan Anda selama periode penilaian.</p>
                    {[5, 4, 3, 2, 1].map((n) => {
                      const desc = cur.ratingGuide?.[String(n)];
                      if (!desc) return null;
                      const keyPoint = cur.ratingKeyPoints?.[String(n)] || FALLBACK_KEY_POINTS[n];
                      return (
                        <div key={n} className="flex gap-2 items-start text-[13px]">
                          <span className="font-black text-brand-ink data-value w-6 h-6 flex items-center justify-center shrink-0 rounded-control bg-brand-tint border border-brand-ink/15">{n}</span>
                          <span className="text-ink-soft leading-snug"><strong className="text-ink">{keyPoint}</strong> — {desc}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Rating 1–5 (fitur N/A dicabut 2026-09-29 — semua indikator wajib diberi rating). */}
                <div className="bg-neutral-tint border border-line rounded-panel p-3">
                  <span className="text-[11px] font-black text-ink-faint uppercase tracking-widest block mb-2">Rating (klik untuk pilih)</span>
                  <div className="grid gap-1.5 sm:gap-2 grid-cols-5">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const sel = ratings[cur.id] === n;
                      return (
                        <button key={n} type="button"
                          onClick={() => setRatings((p) => ({ ...p, [cur.id]: n }))}
                          className={`flex items-center justify-center py-3.5 rounded-control border font-extrabold transition-all ${sel ? 'bg-brand text-white border-brand shadow-2xs' : 'bg-surface text-ink-soft border-line hover:bg-neutral-tint'}`}>
                          <span className="text-2xl leading-none data-value">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-center sm:hidden">
                    {ratings[cur.id] != null ? (
                      <span className="text-sm font-bold text-brand-ink">Pilihan Anda: {ratings[cur.id]}</span>
                    ) : (
                      <span className="text-sm font-semibold text-ink-faint">Pilih rating 1–5.</span>
                    )}
                  </div>
                </div>

                {/* Komentar — WAJIB (BR-06, evidence). */}
                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-brand-ink uppercase tracking-wider flex items-center gap-1">
                    Komentar / Bukti Perilaku (Evidence) <span className="text-danger-ink">*</span>
                  </label>
                  <textarea rows={3} value={comments[cur.id] ?? ''} onChange={(e) => setComments((p) => ({ ...p, [cur.id]: e.target.value }))}
                    onKeyDown={onCommentKeyDown}
                    placeholder="Jelaskan rating dengan contoh konkret (situasi nyata, perilaku yang terlihat, frekuensi)."
                    className="w-full text-sm p-3 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint resize-y" />
                  <div className="flex flex-wrap justify-between items-center gap-2 text-[11px]">
                    <span className="text-ink-faint">
                      Tekan <kbd className="data-value font-bold text-ink-soft bg-neutral-tint border border-line rounded px-1">Enter</kbd> untuk lanjut ke pertanyaan berikutnya
                      · <kbd className="data-value font-bold text-ink-soft bg-neutral-tint border border-line rounded px-1">Shift+Enter</kbd> baris baru
                    </span>
                    <span className={(comments[cur.id] ?? '').trim().length >= EVIDENCE_MIN ? 'text-brand-ink font-extrabold' : 'text-danger-ink font-extrabold data-value'}>
                      {(comments[cur.id] ?? '').trim().length >= EVIDENCE_MIN ? `${(comments[cur.id] ?? '').trim().length} karakter` : `${(comments[cur.id] ?? '').trim().length}/${EVIDENCE_MIN} karakter · wajib min. ${EVIDENCE_MIN}`}
                    </span>
                  </div>
                </div>

                {/* Navigasi Sebelumnya / Selanjutnya */}
                <div className="flex justify-between items-center pt-2 border-t border-line-soft text-xs font-bold text-ink-soft">
                  <button type="button" disabled={curPos <= 0} onClick={() => goTo(curPos - 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-line bg-surface hover:bg-neutral-tint rounded-control disabled:opacity-40 disabled:cursor-not-allowed">
                    <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
                  </button>
                  <span className="data-value text-[10px] text-ink-faint bg-neutral-tint px-2 py-0.5 rounded-control">Q{cur.qNum}/{total}</span>
                  <button type="button" disabled={atLastQuant && !hasQual} onClick={goNext}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-line bg-surface hover:bg-neutral-tint rounded-control disabled:opacity-40 disabled:cursor-not-allowed">
                    {atLastQuant && hasQual ? 'Ke Umpan Balik Kualitatif' : 'Selanjutnya'} <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Belum ada indikator pada periode ini.</p>
          )}
        </div>
      </div>
      )}

      {error && <p className="text-xs text-danger-ink font-semibold">{error}</p>}

      {/* Konfirmasi Kirim */}
      {confirmSend && (
        <div className="bg-brand-tint border border-brand-ink/25 rounded-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-brand-ink font-semibold">
            Kirim penilaian untuk <span className="font-extrabold">{targetName}</span>?
            <span className="block text-[11px] font-normal text-brand-ink/80 mt-0.5">{deadlinePassed
              ? 'Deadline sudah lewat — setelah dikirim, penilaian ini tidak dapat diubah lagi dan tercatat Terlambat.'
              : 'Setelah dikirim, Anda masih bisa mengeditnya sampai deadline. Sesudah deadline, penilaian terkunci.'}</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <button type="button" disabled={busy} onClick={cancelSend}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-control text-ink-soft bg-surface border border-line hover:bg-neutral-tint disabled:opacity-60">
              Batal
            </button>
            <button type="button" disabled={busy} onClick={doSend}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
              <Send className="w-4 h-4 text-white/85" /> {busy ? 'Mengirim…' : 'Ya, Kirim Sekarang'}
            </button>
          </div>
        </div>
      )}

      {/* Kontrol bawah */}
      <div className="bg-neutral-tint border border-line rounded-panel p-3 flex flex-col sm:flex-row justify-between gap-2">
        <div className="flex gap-2">
          {reviewing ? (
            <button type="button" disabled={busy} onClick={() => { cancelSend(); setReviewing(false); }}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-control text-ink-soft bg-surface border border-line hover:bg-neutral-tint disabled:opacity-60">
              <ChevronLeft className="w-4 h-4 text-ink-faint" /> Kembali ke Form
            </button>
          ) : (
          <button type="button" disabled={busy} onClick={() => router.push('/penilaian')}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-control text-ink-soft bg-surface border border-line hover:bg-neutral-tint disabled:opacity-60">
            <XCircle className="w-4 h-4 text-ink-faint" /> Batal
          </button>
          )}
          {hasDraft && !reviewing && (
            <button type="button" disabled={busy} onClick={discard}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-control text-danger-ink bg-surface border border-danger-ink/30 hover:bg-danger-tint disabled:opacity-60">
              <Trash2 className="w-4 h-4" /> Buang Draf
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {/* Sudah terkirim → tak ada Simpan Draf (akan menurunkan status & mengeluarkan nilai dari
              laporan yang dinilai); perubahan disimpan lewat "Kirim Ulang". Server juga menolaknya. */}
          {initialStatus !== 'submitted' && (
            <button type="button" disabled={busy} onClick={saveDraft}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-control text-ink-soft bg-surface border border-line hover:bg-neutral-tint disabled:opacity-60">
              <Save className="w-4 h-4 text-ink-faint" /> Simpan Draf
            </button>
          )}
          {/* Tombol adaptif: belum lengkap → "Lengkapi" (ORANYE SOLID — sengaja mencolok agar
              pengguna sadar masih ada yang kurang; teks gelap di atas oranye = kontras tinggi);
              lengkap → "Kirim" (hijau brand). */}
          {reviewing ? (
            <button type="button" disabled={busy || saveState === 'saving' || confirmSend} onClick={askSend}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
              <Send className="w-4 h-4 text-white/85" />
              {busy ? 'Memproses…' : initialStatus === 'submitted' ? 'Kirim Ulang Penilaian 360°' : 'Kirim Penilaian 360°'}
            </button>
          ) : (
          <button type="button" disabled={busy || total === 0 || saveState === 'saving' || confirmSend} onClick={submit}
            className={`inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-control disabled:opacity-50 ${
              allComplete
                ? 'bg-brand hover:bg-brand-ink text-white'
                : 'bg-warn text-ink border border-warn-ink/40 hover:brightness-95 shadow-2xs'
            }`}>
            {allComplete ? <ListChecks className="w-4 h-4 text-white/85" /> : <Send className="w-4 h-4 text-ink" />}
            {busy ? 'Memproses…' : allComplete ? 'Review Penilaian' : `Lengkapi Penilaian (${remaining} tersisa)`}
          </button>
          )}
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

/**
 * Halaman Review (Screen 04): ringkasan seluruh indikator per aspek (skor + key point + evidence yang
 * bisa dibuka) & jawaban esai, dengan tombol Edit ke item terkait. Tidak menampilkan skor rata-rata.
 */
function ReviewPanel({ flat, ratings, comments, questions, answers, onEdit }: {
  flat: { gid: string; gname: string; id: string; text: string; qNum: number; ratingKeyPoints?: Record<string, string> | null }[];
  ratings: Record<string, number | null>;
  comments: Record<string, string>;
  questions: Question[];
  answers: Record<string, string>;
  onEdit: (target: string) => void;
}) {
  const groups: { gid: string; gname: string; items: typeof flat }[] = [];
  flat.forEach((f) => {
    const g = groups.find((x) => x.gid === f.gid);
    if (g) g.items.push(f); else groups.push({ gid: f.gid, gname: f.gname, items: [f] });
  });
  const doneN = flat.filter((f) => ratings[f.id] != null && (comments[f.id] ?? '').trim().length >= EVIDENCE_MIN).length;
  const editBtn = (target: string) => (
    <button type="button" onClick={(e) => { e.preventDefault(); onEdit(target); }}
      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-control border border-line text-brand-ink bg-surface hover:border-brand shrink-0">
      <Pencil className="w-3 h-3" /> Edit
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="border border-line rounded-panel p-4">
        <h3 className="text-base font-extrabold text-ink">Review Penilaian</h3>
        <p className="text-[12.5px] text-ink-soft mt-0.5">Periksa kembali seluruh jawaban sebelum dikirim. Klik baris untuk melihat bukti perilaku, atau <strong>Edit</strong> untuk memperbaiki.</p>
        <p className="mt-2 text-[12px] font-bold text-brand-ink">
          <CheckCircle2 className="w-4 h-4 inline -mt-0.5 mr-1" />
          <span className="data-value">{doneN}/{flat.length}</span> indikator lengkap
          {questions.length > 0 && <> · <span className="data-value">{questions.length}</span> pertanyaan esai terjawab</>}
        </p>
      </div>
      {groups.map((g, gi) => (
        <section key={g.gid} className="border border-line rounded-panel overflow-hidden">
          <h4 className="px-4 py-2 bg-neutral-tint border-b border-line text-[12.5px] font-extrabold text-ink">
            <span className="data-value text-ink-faint mr-1.5">{gi + 1}</span>{g.gname}
          </h4>
          <ul className="divide-y divide-line-soft">
            {g.items.map((f) => {
              const r = ratings[f.id];
              const kp = r != null ? f.ratingKeyPoints?.[String(r)] || FALLBACK_KEY_POINTS[r] : null;
              return (
                <li key={f.id} className="px-4 py-2.5">
                  <details className="group">
                    <summary className="flex items-center gap-2 cursor-pointer list-none">
                      <span className="data-value text-[11px] text-ink-faint w-7 shrink-0">Q{f.qNum}</span>
                      <span className="text-[13px] font-semibold text-ink flex-1 min-w-0">{f.text}</span>
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-control bg-brand-tint text-brand-ink border border-brand-ink/20 whitespace-nowrap">
                        Skor <span className="data-value">{r ?? '—'}</span>
                      </span>
                      <ChevronDown className="w-4 h-4 text-ink-faint transition-transform group-open:rotate-180 shrink-0" />
                      {editBtn(f.id)}
                    </summary>
                    <div className="mt-2 ml-9 text-[12px] text-ink-soft leading-relaxed">
                      {kp && <p className="text-[11px] font-semibold text-ink mb-1">{kp}</p>}
                      <p className="whitespace-pre-wrap"><span className="font-semibold text-ink-faint">Bukti perilaku: </span>{(comments[f.id] ?? '').trim() || '—'}</p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {questions.length > 0 && (
        <section className="border border-line rounded-panel overflow-hidden">
          <div className="px-4 py-2 bg-neutral-tint border-b border-line flex items-center justify-between gap-2">
            <h4 className="text-[12.5px] font-extrabold text-ink">Umpan Balik Kualitatif</h4>
            {editBtn(QUAL)}
          </div>
          <ul className="divide-y divide-line-soft">
            {questions.map((q) => (
              <li key={q.id} className="px-4 py-2.5">
                <p className="text-[12.5px] font-semibold text-ink">{q.text}</p>
                <p className="text-[12px] text-ink-soft mt-1 whitespace-pre-wrap">{(answers[q.id] ?? '').trim() || '—'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Indikator kecil status auto-simpan draf. */
function AutoSaveHint({ state, disabled }: { state: SaveState; disabled: boolean }) {
  if (disabled) {
    return <p className="text-[11px] text-ink-faint">Penilaian sudah terkirim — perubahan disimpan saat Anda menekan Kirim.</p>;
  }
  if (state === 'saving') return <p className="text-[11px] text-ink-soft flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Menyimpan otomatis…</p>;
  if (state === 'pending') return (
    <p className="text-[11px] font-bold text-ink inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-warn animate-pulse" aria-hidden /> Perubahan belum disimpan…
    </p>
  );
  if (state === 'saved') return <p className="text-[11px] text-brand-ink font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Tersimpan otomatis</p>;
  if (state === 'error') return <p className="text-[11px] text-danger-ink font-semibold">Gagal menyimpan otomatis — tekan “Simpan Draf”.</p>;
  return <p className="text-[11px] text-ink-faint">Draf tersimpan otomatis saat Anda mengisi.</p>;
}
