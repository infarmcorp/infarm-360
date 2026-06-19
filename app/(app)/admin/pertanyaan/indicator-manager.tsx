'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trash2, ChevronUp, Pencil, Check, X } from 'lucide-react';
import { updateIndicator, toggleIndicator, deleteIndicator, renameAspect, deleteAspect, moveAspect } from './actions';

type Ind = { id: string; text: string; is_active: boolean; description: string; ratingGuide: Record<string, string> | null };

const RATING_LABELS: Record<string, string> = {
  '1': 'Hampir Tidak Pernah', '2': 'Jarang', '3': 'Kadang', '4': 'Sering', '5': 'Selalu',
};

export function IndicatorManager({
  aspectId, aspectName, indicators, canUp, canDown,
}: {
  aspectId: string; aspectName: string; indicators: Ind[]; canUp: boolean; canDown: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return false; }
    router.refresh(); return true;
  }

  return (
    <section className="border border-gray-200 rounded-xl p-3">
      <AspectHeader aspectId={aspectId} aspectName={aspectName} canUp={canUp} canDown={canDown} run={run} busy={busy} count={indicators.length} />
      <div className="space-y-2">
        {indicators.map((ind) => <IndicatorRow key={ind.id} ind={ind} run={run} busy={busy} />)}
        {indicators.length === 0 && <p className="text-xs text-gray-400 italic">Belum ada indikator.</p>}
      </div>
      {err && <p className="text-[10px] text-rose-600 mt-1">{err}</p>}
    </section>
  );
}

/** Header aspek: nama (edit inline), geser urutan, & hapus (bila kosong). */
function AspectHeader({
  aspectId, aspectName, canUp, canDown, run, busy, count,
}: {
  aspectId: string; aspectName: string; canUp: boolean; canDown: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; busy: boolean; count: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(aspectName);

  async function save() {
    if (!name.trim() || name.trim() === aspectName) { setEditing(false); setName(aspectName); return; }
    const ok = await run(() => renameAspect(aspectId, name.trim()));
    if (ok) setEditing(false);
  }
  async function remove() {
    if (count > 0) { await run(async () => ({ ok: false, error: `Aspek masih punya ${count} indikator — hapus indikatornya dulu.` })); return; }
    if (!window.confirm(`Hapus aspek "${aspectName}"?`)) return;
    await run(() => deleteAspect(aspectId));
  }

  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      {editing ? (
        <div className="flex items-center gap-1 flex-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setName(aspectName); } }}
            className="flex-1 text-sm font-bold p-1 border border-emerald-300 rounded focus:ring-1 focus:ring-emerald-600 outline-none" />
          <button type="button" onClick={save} disabled={busy} title="Simpan" className="text-emerald-700 hover:text-emerald-900 p-0.5"><Check className="w-4 h-4" /></button>
          <button type="button" onClick={() => { setEditing(false); setName(aspectName); }} title="Batal" className="text-gray-400 hover:text-gray-600 p-0.5"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <h3 className="text-sm font-extrabold text-emerald-800 flex items-center gap-1.5">
          {aspectName}
          <span className="text-[10px] font-semibold text-gray-400">· {count} indikator</span>
        </h3>
      )}
      {!editing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => setEditing(true)} disabled={busy} title="Ubah nama" className="text-gray-400 hover:text-emerald-700 p-1"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => run(() => moveAspect(aspectId, 'up'))} disabled={busy || !canUp} title="Naik" className="text-gray-400 hover:text-gray-700 p-1 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
          <button type="button" onClick={() => run(() => moveAspect(aspectId, 'down'))} disabled={busy || !canDown} title="Turun" className="text-gray-400 hover:text-gray-700 p-1 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
          <button type="button" onClick={remove} disabled={busy} title="Hapus aspek" className="text-gray-400 hover:text-rose-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
}

function IndicatorRow({ ind, run, busy }: { ind: Ind; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState(ind.text);
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(ind.description);
  const [guide, setGuide] = useState<Record<string, string>>(() => ({
    '1': ind.ratingGuide?.['1'] ?? '', '2': ind.ratingGuide?.['2'] ?? '', '3': ind.ratingGuide?.['3'] ?? '',
    '4': ind.ratingGuide?.['4'] ?? '', '5': ind.ratingGuide?.['5'] ?? '',
  }));

  const dirtyText = text.trim() !== ind.text;
  const hasGuide = !!ind.description || !!ind.ratingGuide;

  async function saveGuide() {
    const ok = await run(() => updateIndicator(ind.id, text, desc, guide));
    if (ok) setOpen(false);
  }

  return (
    <div className={`rounded-lg ${ind.is_active ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setOpen((o) => !o)} title="Panduan penilaian"
          className="text-gray-400 hover:text-gray-600 shrink-0">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)}
          className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        {hasGuide && !open && <span className="text-[8px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1 py-0.5 rounded shrink-0">panduan</span>}
        {dirtyText && (
          <button type="button" disabled={busy} onClick={() => run(() => updateIndicator(ind.id, text))}
            className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50 shrink-0">Simpan</button>
        )}
        <button type="button" disabled={busy} onClick={() => run(() => toggleIndicator(ind.id, !ind.is_active))}
          className="text-[10px] font-bold px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 shrink-0">
          {ind.is_active ? 'Nonaktif' : 'Aktifkan'}
        </button>
        <button type="button" disabled={busy} title="Hapus indikator (hanya bila belum dipakai penilaian)"
          onClick={() => { if (window.confirm('Hapus indikator ini? Hanya bisa bila belum dipakai penilaian mana pun.')) run(() => deleteIndicator(ind.id)); }}
          className="text-[10px] font-bold px-1.5 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="mt-2 ml-5 p-3 bg-gray-50/70 border border-gray-200 rounded-lg space-y-2.5">
          <div>
            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Deskripsi Perilaku (kotak penjelasan di form)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              placeholder="Penjelasan singkat indikator ini bagi penilai…"
              className="w-full text-[11px] p-2 bg-white border border-gray-250 rounded focus:ring-1 focus:ring-emerald-600 outline-none resize-none" />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Panduan Rating per Level (opsional)</label>
            <div className="space-y-1.5">
              {['1', '2', '3', '4', '5'].map((lv) => (
                <div key={lv} className="flex items-start gap-1.5">
                  <span className="text-[10px] font-black text-emerald-800 font-mono w-4 text-center shrink-0 mt-1.5">{lv}</span>
                  <input value={guide[lv]} onChange={(e) => setGuide((p) => ({ ...p, [lv]: e.target.value }))}
                    placeholder={`${RATING_LABELS[lv]} — contoh/kriteria…`}
                    className="flex-1 text-[11px] px-2 py-1 bg-white border border-gray-250 rounded focus:ring-1 focus:ring-emerald-600 outline-none" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-0.5">
            <button type="button" disabled={busy} onClick={saveGuide}
              className="text-[10px] font-bold px-3 py-1.5 rounded bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">Simpan Panduan</button>
            <button type="button" onClick={() => setOpen(false)} className="text-[10px] font-semibold text-gray-500 hover:underline">Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
