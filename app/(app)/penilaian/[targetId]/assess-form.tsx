'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, CheckCircle2, X, Send, Save, XCircle, Trash2 } from 'lucide-react';
import { submitAssessment, discardAssessment } from '../actions';

type Group = { id: string; name: string; indicators: { id: string; text: string }[] };
type Question = { id: string; text: string };

const RATING_LABELS: Record<number, string> = {
  1: 'Hampir Tidak Pernah', 2: 'Jarang', 3: 'Kadang', 4: 'Sering', 5: 'Selalu',
};
const QUAL = '__qual__';

/**
 * Form Pengisian 360° — paritas legacy: rail aspek (kiri) + editor SATU indikator
 * (kanan) dengan navigasi Sebelumnya/Selanjutnya, label rating, bar progres, dan
 * komentar/bukti perilaku WAJIB (min. 4 karakter) sebelum kirim. Umpan balik
 * kualitatif jadi item terakhir di rail (opsional).
 */
export function AssessForm({
  targetId, groups, questions, initialScores, initialAnswers, hasDraft = false,
}: {
  targetId: string;
  groups: Group[];
  questions: Question[];
  initialScores: Record<string, { rating: number | null; comment: string }>;
  initialAnswers: Record<string, string>;
  hasDraft?: boolean;
}) {
  const router = useRouter();
  const aspectGroups = useMemo(() => groups.filter((g) => g.indicators.length > 0), [groups]);

  // Daftar indikator rata dengan nomor Q global + aspek induk.
  const flat = useMemo(() => {
    const arr: { gid: string; gname: string; id: string; text: string; qNum: number }[] = [];
    let n = 0;
    aspectGroups.forEach((g) => g.indicators.forEach((ind) => {
      n += 1; arr.push({ gid: g.id, gname: g.name, id: ind.id, text: ind.text, qNum: n });
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

  const indDone = (id: string) => ratings[id] != null && (comments[id] ?? '').trim().length >= 4;
  const doneCount = flat.filter((f) => indDone(f.id)).length;
  const total = flat.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const curList = flat.filter((f) => f.gid === activeGroup);
  const cur = flat.find((f) => f.id === activeId) ?? curList[0] ?? null;
  const curPos = cur ? flat.findIndex((f) => f.id === cur.id) : -1;

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

  async function save(status: 'draft' | 'submitted') {
    setBusy(true); setError(null);
    const payload = {
      targetId, status,
      scores: flat.map((f) => ({ indicatorId: f.id, rating: ratings[f.id] ?? null, comment: comments[f.id] ?? '' })),
      answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' })),
    };
    const res = await submitAssessment(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    if (status === 'submitted') { router.push('/penilaian'); router.refresh(); }
    else router.refresh();
  }

  function submit() {
    // Validasi: tiap indikator wajib rating + komentar ≥ 4. Lompat ke yang kurang.
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
    save('submitted');
  }

  async function discard() {
    if (!window.confirm('Buang draf penilaian ini? Semua rating & komentar yang tersimpan akan dihapus.')) return;
    setBusy(true); setError(null);
    const res = await discardAssessment(targetId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push('/penilaian'); router.refresh();
  }

  const qualAnswered = questions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length;

  return (
    <div className="space-y-4">
      {/* Bar progres */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
        <div className="h-2.5 bg-gray-100 flex-1 rounded-full overflow-hidden">
          <div style={{ width: `${pct}%` }} className="h-full bg-emerald-600 rounded-full transition-all" />
        </div>
        <span className="text-xs font-bold text-emerald-800 font-mono shrink-0">{doneCount}/{total} · {pct}%</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* RAIL aspek */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">Aspek Budaya</label>
          {aspectGroups.map((g) => {
            const items = flat.filter((f) => f.gid === g.id);
            const done = items.filter((f) => indDone(f.id)).length;
            const all = done === items.length;
            const active = activeGroup === g.id;
            return (
              <button key={g.id} type="button" onClick={() => selectGroup(g.id)}
                className={`w-full p-3 rounded-xl border text-left transition-all ${active ? 'border-emerald-700 bg-emerald-50/60 ring-1 ring-emerald-700' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
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
              className={`w-full p-3 rounded-xl border text-left transition-all ${activeGroup === QUAL ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <span className={`text-xs leading-tight block ${activeGroup === QUAL ? 'font-extrabold text-indigo-950' : 'font-semibold text-gray-700'}`}>Umpan Balik Kualitatif</span>
              <span className="flex items-center justify-between mt-1.5 text-[10px] font-bold text-gray-500">
                <span>{questions.length} pertanyaan</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">{qualAnswered}/{questions.length}</span>
              </span>
            </button>
          )}
        </div>

        {/* EDITOR */}
        <div className="min-w-0">
          {activeGroup === QUAL ? (
            <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-extrabold text-indigo-800">Umpan Balik Kualitatif <span className="text-[10px] font-medium text-gray-400">(opsional)</span></h3>
              {questions.map((q) => (
                <div key={q.id}>
                  <p className="text-sm text-gray-700 mb-1.5">{q.text}</p>
                  <textarea rows={2} value={answers[q.id]} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                    placeholder="Jawaban (opsional)"
                    className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              ))}
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
                      <span className="text-[9px] text-gray-400 font-bold block">Q{f.qNum}{filled ? ' ✓' : ''}</span>
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
                      className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"><X className="w-4 h-4" /></button>
                  )}
                </div>

                {/* Rating berlabel */}
                <div className="bg-gray-50/60 border border-gray-200 rounded-xl p-3">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Rating (klik untuk pilih)</span>
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const sel = ratings[cur.id] === n;
                      return (
                        <button key={n} type="button" onClick={() => setRatings((p) => ({ ...p, [cur.id]: n }))}
                          className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-extrabold transition-all ${sel ? 'bg-emerald-700 text-white border-emerald-700 shadow' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                          <span className="text-sm">{n}</span>
                          <span className={`text-[8.5px] text-center font-bold leading-tight ${sel ? 'text-emerald-50' : 'text-gray-400'}`}>{RATING_LABELS[n]}</span>
                        </button>
                      );
                    })}
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
                  <span className="font-mono text-[9px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Q{cur.qNum}/{total}</span>
                  <button type="button" disabled={curPos >= total - 1} onClick={() => goTo(curPos + 1)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
                    Selanjutnya <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
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

      {/* Kontrol bawah */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 flex flex-col sm:flex-row justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => router.push('/penilaian')}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60">
            <XCircle className="w-4 h-4 text-gray-400" /> Batal
          </button>
          {hasDraft && (
            <button type="button" disabled={busy} onClick={discard}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-rose-600 bg-white border border-rose-300 hover:bg-rose-50 disabled:opacity-60">
              <Trash2 className="w-4 h-4" /> Buang Draf
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => save('draft')}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-indigo-900 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-60">
            <Save className="w-4 h-4 text-indigo-700" /> Simpan Draf
          </button>
          <button type="button" disabled={busy || total === 0} onClick={submit}
            className="inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            <Send className="w-4 h-4 text-emerald-100" /> {busy ? 'Memproses…' : 'Kirim Penilaian 360°'}
          </button>
        </div>
      </div>
    </div>
  );
}
