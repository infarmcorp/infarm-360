'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CheckCircle2, X, Send, Save, XCircle, Trash2, ClipboardList, ChevronDown, Loader2, Pencil, ListChecks } from 'lucide-react';
import { submitAssessment, discardAssessment } from '../actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CARD } from '@/components/infarm-ui';
import { BTN_DANGER_GHOST, BTN_GHOST, BTN_PRIMARY, FIELD_AREA, FIELD_AREA_MISSING } from '../penilaian-ui';

// Tombol "Lengkapi" — oranye solid (sengaja mencolok); ukuran sama dengan BTN_* (skala rapat).
const BTN_WARN = 'inline-flex items-center justify-center gap-1.5 rounded-xl font-bold text-[13px] min-h-9 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-warn text-ink hover:brightness-95';
const KBD = 'data-value font-bold text-ink-soft bg-neutral-tint border border-line rounded-control px-1';

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
  mandatoryTotal = 0, mandatoryDoneOthers = 0, thisMandatory = false, deadlinePassed = false, evidencePeriod,
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
  /** Rentang periode berjalan (mis. "01 Okt 2026 – 31 Des 2026") — evidence wajib dari kejadian dalam rentang ini. */
  evidencePeriod?: { label: string; range: string };
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

    // Disengaja: status "menunggu simpan" menyertai timer simpan otomatis draf (jalur kritis — jangan diubah
    // demi lint).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className={`${CARD} flex flex-col items-center text-center py-10 px-4`}>
        <div className="w-16 h-16 rounded-full bg-brand-tint flex items-center justify-center mb-4">
          <CheckCircle2 className="w-9 h-9 text-brand" aria-hidden />
        </div>
        <h2 className="text-lg font-bold text-ink">Penilaian Terkirim</h2>
        <p className="text-[13px] text-ink-soft mt-1.5 max-w-md leading-relaxed">
          Penilaian untuk <span className="font-bold text-ink">{targetName}</span> berhasil dikirim.
          {deadlinePassed
            ? <>Deadline sudah lewat, sehingga penilaian ini <span className="font-semibold">tidak dapat diubah lagi</span>.</>
            : <>Anda masih bisa <span className="font-semibold">mengeditnya sampai deadline</span> dari Daftar Penilaian.</>}
        </p>
        {mandatoryTotal > 0 && (
          <div className={`mt-4 px-4 py-2.5 rounded-xl text-[13px] font-semibold ${remaining > 0 ? 'bg-warn-tint text-warn-ink' : 'bg-brand-tint text-brand-ink'}`}>
            {remaining > 0
              ? <>Penilaian wajib: <span className="data-value">{doneNow}/{mandatoryTotal}</span> selesai · <span className="font-bold">masih ada <span className="data-value">{remaining}</span> lagi</span> untuk dikerjakan.</>
              : <>Semua <span className="data-value">{mandatoryTotal}</span> penilaian wajib Anda sudah selesai!</>}
          </div>
        )}
        <button type="button" onClick={() => { router.push('/penilaian'); router.refresh(); }}
          className={`${BTN_PRIMARY} mt-5`}>
          <ChevronLeft className="w-4 h-4" /> {remaining > 0 ? 'Lanjut ke Penilaian Berikutnya' : 'Kembali ke Daftar Penilaian'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bar progres + indikator auto-simpan */}
      <div className={`${CARD} space-y-2`}>
        <div className="flex items-center gap-3">
          <div className="h-2 bg-neutral-tint flex-1 rounded-full overflow-hidden">
            <div style={{ width: `${pct}%` }} className="h-full bg-brand rounded-full transition-all" />
          </div>
          <span className="text-xs font-bold text-brand-ink data-value shrink-0">{progDone}/{progTotal} · {pct}%</span>
        </div>
        <AutoSaveHint state={saveState} disabled={initialStatus === 'submitted'} />
      </div>

      {/* Panduan Penilaian Umum (statis, berlaku semua pertanyaan) — disembunyikan di halaman Review. */}
      {!reviewing && (
      <div className="bg-neutral-tint rounded-xl">
        <button type="button" onClick={() => setGuideOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-4 min-h-9 py-2 text-left">
          <ClipboardList className="w-4 h-4 text-brand shrink-0" />
          <span className="text-[13px] font-bold text-ink flex-1">Panduan Penilaian Umum</span>
          <ChevronDown className={`w-4 h-4 text-ink-faint transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <ul className="list-disc list-inside space-y-1.5 px-4 pb-3 text-xs text-ink-soft leading-relaxed">
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
          <label className="block text-xs font-bold uppercase tracking-[0.08em] text-ink-soft mb-1.5">Aspek Budaya</label>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {aspectGroups.map((g) => {
            const items = flat.filter((f) => f.gid === g.id);
            const done = items.filter((f) => indDone(f.id)).length;
            const all = done === items.length;
            const active = activeGroup === g.id;
            return (
              <button key={g.id} type="button" onClick={() => selectGroup(g.id)}
                className={`shrink-0 w-[150px] lg:w-full p-3 rounded-xl border text-left transition-colors ${active ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:border-infarm-light'}`}>
                <span className={`text-[13px] leading-tight block ${active ? 'font-bold text-brand-ink' : 'font-semibold text-ink'}`}>{g.name}</span>
                <span className="flex items-center justify-between mt-1.5 text-[11px] font-semibold text-ink-soft">
                  <span><span className="data-value">{items.length}</span> indikator</span>
                  {all
                    ? <CheckCircle2 className="w-4 h-4 text-brand" />
                    : <span className="px-1.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft data-value">{done}/{items.length}</span>}
                </span>
              </button>
            );
          })}
          {hasQual && (
            <button type="button" onClick={() => selectGroup(QUAL)}
              className={`shrink-0 w-[150px] lg:w-full p-3 rounded-xl border text-left transition-colors ${activeGroup === QUAL ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:border-infarm-light'}`}>
              <span className={`text-[13px] leading-tight block ${activeGroup === QUAL ? 'font-bold text-brand-ink' : 'font-semibold text-ink'}`}>Umpan Balik Kualitatif</span>
              <span className="flex items-center justify-between mt-1.5 text-[11px] font-semibold text-ink-soft">
                <span><span className="data-value">{questions.length}</span> pertanyaan</span>
                <span className={`px-1.5 py-0.5 rounded-full data-value ${qualDone >= questions.length ? 'bg-brand-tint text-brand-ink' : 'bg-neutral-tint text-ink-soft'}`}>{qualDone}/{questions.length}</span>
              </span>
            </button>
          )}
          </div>
        </div>

        {/* EDITOR */}
        <div ref={editorRef} className="min-w-0 scroll-mt-24">
          {activeGroup === QUAL ? (
            <div className={`${CARD} space-y-4`}>
              <h3 className="text-base font-bold text-ink">Umpan Balik Kualitatif <span className="text-xs font-semibold text-danger-ink">(wajib diisi semua)</span></h3>
              <p className="text-xs text-ink-soft -mt-2">
                Tekan <kbd className={KBD}>Enter</kbd> untuk pindah ke pertanyaan berikutnya
                · <kbd className={KBD}>Shift+Enter</kbd> baris baru.
              </p>
              {questions.map((q, qi) => {
                const filled = (answers[q.id] ?? '').trim().length > 0;
                return (
                  <div key={q.id}>
                    <p className="text-[13px] font-semibold text-ink mb-1.5">{q.text} <span className="text-danger-ink">*</span></p>
                    <textarea rows={2} value={answers[q.id]} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                      ref={(el) => { qualRefs.current[qi] = el; }}
                      onKeyDown={(e) => onQualKeyDown(e, qi)}
                      placeholder="Tulis jawaban Anda…"
                      className={filled ? FIELD_AREA : FIELD_AREA_MISSING} />
                    {!filled && <p className="text-xs text-danger-ink font-semibold mt-1">Wajib diisi</p>}
                  </div>
                );
              })}
              {/* Navigasi: kembali ke indikator kuantitatif terakhir (simetri dgn "Selanjutnya"). */}
              {total > 0 && (
                <div className="flex justify-between items-center gap-2 pt-3 border-t border-line-soft">
                  <button type="button" onClick={() => goTo(total - 1)} className={BTN_GHOST}>
                    <ChevronLeft className="w-4 h-4" /> Sebelumnya
                  </button>
                  <span className="text-[11px] font-semibold text-ink-soft bg-neutral-tint px-2.5 py-0.5 rounded-full">Langkah terakhir</span>
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
                      className={`px-3 py-2 rounded-xl border text-left min-w-[110px] max-w-[180px] flex-1 transition-colors ${isActive ? 'border-brand bg-brand-tint ring-1 ring-brand' : filled ? 'border-brand-ink/25 bg-brand-tint/50' : 'border-line bg-surface hover:border-infarm-light'}`}>
                      <span className="flex items-center gap-1 text-[11px] text-ink-soft font-bold data-value">Q{f.qNum}{filled && <CheckCircle2 className="w-3.5 h-3.5 text-brand" aria-hidden />}</span>
                      <span className="text-xs leading-tight line-clamp-1 text-ink-soft">{f.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Editor satu indikator */}
              <div className={`${CARD} space-y-4`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base text-ink leading-snug"><span className="data-value text-brand-ink">Q{cur.qNum}</span>: {cur.text}</h3>
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
                  <div className="border-l-4 border-l-brand bg-brand-tint/50 px-3.5 py-3 rounded-control text-[13px] text-ink leading-relaxed font-semibold">
                    {cur.description}
                  </div>
                )}

                {/* Panduan BARS untuk indikator ini — key point (khusus indikator ini) + deskripsi. */}
                {(cur.ratingGuide && Object.keys(cur.ratingGuide).length > 0) && (
                  <div className="bg-infarm-surface border border-line rounded-xl p-3 space-y-2">
                    <span className="text-xs font-bold text-ink uppercase tracking-[0.08em] flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-brand" /> Panduan BARS untuk indikator ini
                    </span>
                    <p className="text-xs text-ink-soft -mt-1">Pilih skor berdasarkan perilaku yang paling sesuai dengan pengamatan Anda selama periode penilaian.</p>
                    {[5, 4, 3, 2, 1].map((n) => {
                      const desc = cur.ratingGuide?.[String(n)];
                      if (!desc) return null;
                      const keyPoint = cur.ratingKeyPoints?.[String(n)] || FALLBACK_KEY_POINTS[n];
                      return (
                        <div key={n} className="flex gap-2 items-start text-[13px]">
                          <span className="font-bold text-brand-ink data-value w-6 h-6 flex items-center justify-center shrink-0 rounded-control bg-brand-tint">{n}</span>
                          <span className="text-ink-soft leading-snug"><strong className="text-ink">{keyPoint}</strong> — {desc}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Rating 1–5 (fitur N/A dicabut 2026-09-29 — semua indikator wajib diberi rating). */}
                <div>
                  <span className="text-xs font-bold text-ink-soft uppercase tracking-[0.08em] block mb-2">Rating (klik untuk pilih)</span>
                  <div className="grid gap-1.5 sm:gap-2 grid-cols-5">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const sel = ratings[cur.id] === n;
                      return (
                        <button key={n} type="button"
                          onClick={() => setRatings((p) => ({ ...p, [cur.id]: n }))}
                          className={`flex items-center justify-center min-h-11 py-2.5 rounded-xl border font-bold transition-colors ${sel ? 'bg-brand text-white border-brand' : 'bg-surface text-ink border-line hover:border-brand hover:text-brand-ink'}`}>
                          <span className="text-xl leading-none data-value">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-center sm:hidden">
                    {ratings[cur.id] != null ? (
                      <span className="text-[13px] font-bold text-brand-ink">Pilihan Anda: <span className="data-value">{ratings[cur.id]}</span></span>
                    ) : (
                      <span className="text-[13px] font-semibold text-ink-soft">Pilih rating 1–5.</span>
                    )}
                  </div>
                </div>

                {/* Komentar — WAJIB (BR-06, evidence). */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-ink-soft uppercase tracking-[0.08em] flex items-center gap-1">
                    Komentar / Bukti Perilaku (Evidence) <span className="text-danger-ink">*</span>
                  </label>
                  {evidencePeriod && (
                    <p className="inline-block text-xs text-warn-ink bg-warn-tint rounded-control px-2.5 py-1">
                      Tulis kejadian selama periode <strong>{evidencePeriod.label}</strong> saja:{' '}
                      <strong className="data-value">{evidencePeriod.range}</strong>.
                    </p>
                  )}
                  <textarea rows={3} value={comments[cur.id] ?? ''} onChange={(e) => setComments((p) => ({ ...p, [cur.id]: e.target.value }))}
                    onKeyDown={onCommentKeyDown}
                    placeholder={evidencePeriod
                      ? `Jelaskan rating dengan contoh konkret selama ${evidencePeriod.range} (situasi nyata, perilaku yang terlihat, frekuensi).`
                      : 'Jelaskan rating dengan contoh konkret (situasi nyata, perilaku yang terlihat, frekuensi).'}
                    className={`${FIELD_AREA} resize-y`} />
                  <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                    <span className="text-ink-soft">
                      Tekan <kbd className={KBD}>Enter</kbd> untuk lanjut ke pertanyaan berikutnya
                      · <kbd className={KBD}>Shift+Enter</kbd> baris baru
                    </span>
                    <span className={`data-value font-bold ${(comments[cur.id] ?? '').trim().length >= EVIDENCE_MIN ? 'text-brand-ink' : 'text-danger-ink'}`}>
                      {(comments[cur.id] ?? '').trim().length >= EVIDENCE_MIN ? `${(comments[cur.id] ?? '').trim().length} karakter` : `${(comments[cur.id] ?? '').trim().length}/${EVIDENCE_MIN} karakter · wajib min. ${EVIDENCE_MIN}`}
                    </span>
                  </div>
                </div>

                {/* Navigasi Sebelumnya / Selanjutnya */}
                <div className="flex justify-between items-center gap-2 pt-3 border-t border-line-soft">
                  <button type="button" disabled={curPos <= 0} onClick={() => goTo(curPos - 1)} className={BTN_GHOST}>
                    <ChevronLeft className="w-4 h-4" /> Sebelumnya
                  </button>
                  <span className="data-value text-[11px] font-semibold text-ink-soft bg-neutral-tint px-2.5 py-0.5 rounded-full">Q{cur.qNum}/{total}</span>
                  <button type="button" disabled={atLastQuant && !hasQual} onClick={goNext} className={BTN_GHOST}>
                    {atLastQuant && hasQual ? 'Ke Umpan Balik Kualitatif' : 'Selanjutnya'} <ChevronLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-soft">Belum ada indikator pada periode ini.</p>
          )}
        </div>
      </div>
      )}

      {error && <p className="text-[13px] text-danger-ink font-semibold">{error}</p>}

      {/* Konfirmasi Kirim */}
      {confirmSend && (
        <div className="bg-brand-tint border border-brand/30 rounded-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[13px] text-brand-ink font-semibold">
            Kirim penilaian untuk <span className="font-bold">{targetName}</span>?
            <span className="block text-xs font-normal text-brand-ink mt-0.5">{deadlinePassed
              ? 'Deadline sudah lewat — setelah dikirim, penilaian ini tidak dapat diubah lagi dan tercatat Terlambat.'
              : 'Setelah dikirim, Anda masih bisa mengeditnya sampai deadline. Sesudah deadline, penilaian terkunci.'}</span>
          </p>
          <div className="flex gap-2 shrink-0">
            <button type="button" disabled={busy} onClick={cancelSend} className={BTN_GHOST}>
              Batal
            </button>
            <button type="button" disabled={busy} onClick={doSend} className={BTN_PRIMARY}>
              <Send className="w-4 h-4 text-white/85" /> {busy ? 'Mengirim…' : 'Ya, Kirim Sekarang'}
            </button>
          </div>
        </div>
      )}

      {/* Kontrol bawah — lengket di dasar layar agar Simpan/Kirim selalu terjangkau. */}
      <div className="sticky bottom-0 z-10 bg-surface border border-line rounded-card shadow-card p-3 flex flex-col sm:flex-row justify-between gap-2">
        <div className="flex gap-2">
          {reviewing ? (
            <button type="button" disabled={busy} onClick={() => { cancelSend(); setReviewing(false); }} className={BTN_GHOST}>
              <ChevronLeft className="w-4 h-4 text-ink-faint" /> Kembali ke Form
            </button>
          ) : (
          <button type="button" disabled={busy} onClick={() => router.push('/penilaian')} className={BTN_GHOST}>
            <XCircle className="w-4 h-4 text-ink-faint" /> Batal
          </button>
          )}
          {hasDraft && !reviewing && (
            <button type="button" disabled={busy} onClick={discard} className={BTN_DANGER_GHOST}>
              <Trash2 className="w-4 h-4" /> Buang Draf
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {/* Sudah terkirim → tak ada Simpan Draf (akan menurunkan status & mengeluarkan nilai dari
              laporan yang dinilai); perubahan disimpan lewat "Kirim Ulang". Server juga menolaknya. */}
          {initialStatus !== 'submitted' && (
            <button type="button" disabled={busy} onClick={saveDraft} className={BTN_GHOST}>
              <Save className="w-4 h-4 text-ink-faint" /> Simpan Draf
            </button>
          )}
          {/* Tombol adaptif: belum lengkap → "Lengkapi" (ORANYE SOLID — sengaja mencolok agar
              pengguna sadar masih ada yang kurang; teks gelap di atas oranye = kontras tinggi);
              lengkap → "Kirim" (hijau brand). */}
          {reviewing ? (
            <button type="button" disabled={busy || saveState === 'saving' || confirmSend} onClick={askSend} className={BTN_PRIMARY}>
              <Send className="w-4 h-4 text-white/85" />
              {busy ? 'Memproses…' : initialStatus === 'submitted' ? 'Kirim Ulang Penilaian 360°' : 'Kirim Penilaian 360°'}
            </button>
          ) : (
          <button type="button" disabled={busy || total === 0 || saveState === 'saving' || confirmSend} onClick={submit}
            className={allComplete ? BTN_PRIMARY : BTN_WARN}>
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
      className="inline-flex items-center gap-1 text-xs font-bold px-2.5 min-h-7 rounded-xl border border-line text-brand-ink bg-surface hover:border-brand shrink-0">
      <Pencil className="w-3 h-3" /> Edit
    </button>
  );
  return (
    <div className="space-y-3">
      <div className={CARD}>
        <h3 className="text-base font-bold text-ink">Review Penilaian</h3>
        <p className="text-[13px] text-ink-soft mt-0.5">Periksa kembali seluruh jawaban sebelum dikirim. Klik baris untuk melihat bukti perilaku, atau <strong>Edit</strong> untuk memperbaiki.</p>
        <p className="mt-2 text-xs font-bold text-brand-ink">
          <CheckCircle2 className="w-4 h-4 inline -mt-0.5 mr-1" />
          <span className="data-value">{doneN}/{flat.length}</span> indikator lengkap
          {questions.length > 0 && <> · <span className="data-value">{questions.length}</span> pertanyaan esai terjawab</>}
        </p>
      </div>
      {groups.map((g, gi) => (
        <section key={g.gid} className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
          <h4 className="px-4 py-2.5 bg-infarm-surface border-b border-line text-[13px] font-bold text-ink">
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
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-brand-tint text-brand-ink whitespace-nowrap">
                        Skor <span className="data-value">{r ?? '—'}</span>
                      </span>
                      <ChevronDown className="w-4 h-4 text-ink-faint transition-transform group-open:rotate-180 shrink-0" />
                      {editBtn(f.id)}
                    </summary>
                    <div className="mt-2 ml-9 text-[13px] text-ink-soft leading-relaxed">
                      {kp && <p className="text-xs font-semibold text-ink mb-1">{kp}</p>}
                      <p className="whitespace-pre-wrap"><span className="font-semibold text-ink">Bukti perilaku: </span>{(comments[f.id] ?? '').trim() || '—'}</p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {questions.length > 0 && (
        <section className="bg-surface border border-line rounded-card shadow-card overflow-hidden">
          <div className="px-4 py-2.5 bg-infarm-surface border-b border-line flex items-center justify-between gap-2">
            <h4 className="text-[13px] font-bold text-ink">Umpan Balik Kualitatif</h4>
            {editBtn(QUAL)}
          </div>
          <ul className="divide-y divide-line-soft">
            {questions.map((q) => (
              <li key={q.id} className="px-4 py-2.5">
                <p className="text-[13px] font-semibold text-ink">{q.text}</p>
                <p className="text-[13px] text-ink-soft mt-1 whitespace-pre-wrap">{(answers[q.id] ?? '').trim() || '—'}</p>
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
    return <p className="text-xs text-ink-faint">Penilaian sudah terkirim — perubahan disimpan saat Anda menekan Kirim.</p>;
  }
  if (state === 'saving') return <p className="text-xs text-ink-soft flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Menyimpan otomatis…</p>;
  if (state === 'pending') return (
    <p className="text-xs font-bold text-ink inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-warn animate-pulse" aria-hidden /> Perubahan belum disimpan…
    </p>
  );
  if (state === 'saved') return <p className="text-xs text-brand-ink font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Tersimpan otomatis</p>;
  if (state === 'error') return <p className="text-xs text-danger-ink font-semibold">Gagal menyimpan otomatis — tekan “Simpan Draf”.</p>;
  return <p className="text-xs text-ink-faint">Draf tersimpan otomatis saat Anda mengisi.</p>;
}
