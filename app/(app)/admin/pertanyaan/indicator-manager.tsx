'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trash2, ChevronUp, Pencil, Check, X } from 'lucide-react';
import { updateIndicator, toggleIndicator, deleteIndicator, renameAspect, deleteAspect, moveAspect } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Ind = {
  id: string; text: string; is_active: boolean; description: string;
  ratingGuide: Record<string, string> | null; ratingKeyPoints: Record<string, string> | null;
};

// Contoh placeholder saja (BUKAN nilai default tersimpan) — key point sesungguhnya WAJIB
// diisi per indikator dari Instrumen Final Q3 2026, bukan label generik yang sama untuk
// semua indikator (lihat mockup Screen 03 / BR-06 Catatan Developer).
const KEY_POINT_PLACEHOLDER: Record<string, string> = {
  '1': 'mis. Belum terlihat', '2': 'mis. Di bawah ekspektasi', '3': 'mis. Sesuai ekspektasi',
  '4': 'mis. Di atas ekspektasi', '5': 'mis. Sangat konsisten',
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
    <section className="border border-line rounded-panel p-4">
      <AspectHeader aspectId={aspectId} aspectName={aspectName} canUp={canUp} canDown={canDown} run={run} busy={busy} count={indicators.length} />
      <div className="space-y-2">
        {indicators.map((ind) => <IndicatorRow key={ind.id} ind={ind} run={run} busy={busy} />)}
        {indicators.length === 0 && <p className="text-[12px] text-ink-faint italic">Belum ada indikator.</p>}
      </div>
      {err && <p className="text-[11px] text-danger-ink mt-1">{err}</p>}
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
  const [confirmDel, setConfirmDel] = useState(false);

  async function save() {
    if (!name.trim() || name.trim() === aspectName) { setEditing(false); setName(aspectName); return; }
    const ok = await run(() => renameAspect(aspectId, name.trim()));
    if (ok) setEditing(false);
  }
  async function remove() {
    if (count > 0) { await run(async () => ({ ok: false, error: `Aspek masih punya ${count} indikator — hapus indikatornya dulu.` })); return; }
    setConfirmDel(true);
  }

  return (
    <>
    <div className="flex items-center justify-between gap-2 mb-2">
      {editing ? (
        <div className="flex items-center gap-1 flex-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setName(aspectName); } }}
            className="flex-1 text-[13px] font-bold px-2 py-1 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
          <button type="button" onClick={save} disabled={busy} title="Simpan" className="text-brand hover:text-brand-ink p-0.5"><Check className="w-4 h-4" /></button>
          <button type="button" onClick={() => { setEditing(false); setName(aspectName); }} title="Batal" className="text-ink-faint hover:text-ink-soft p-0.5"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <h3 className="text-[13.5px] font-bold text-ink flex items-center gap-1.5">
          {aspectName}
          <span className="text-[11px] font-semibold text-ink-faint">· <span className="data-value">{count}</span> indikator</span>
        </h3>
      )}
      {!editing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => setEditing(true)} disabled={busy} title="Ubah nama" className="text-ink-faint hover:text-brand p-1"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => run(() => moveAspect(aspectId, 'up'))} disabled={busy || !canUp} title="Naik" className="text-ink-faint hover:text-ink p-1 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
          <button type="button" onClick={() => run(() => moveAspect(aspectId, 'down'))} disabled={busy || !canDown} title="Turun" className="text-ink-faint hover:text-ink p-1 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
          <button type="button" onClick={remove} disabled={busy} title="Hapus aspek" className="text-ink-faint hover:text-danger-ink p-1"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
    <ConfirmDialog
      open={confirmDel}
      title="Hapus aspek?"
      tone="danger"
      confirmLabel="Hapus"
      busy={busy}
      onConfirm={async () => { const ok = await run(() => deleteAspect(aspectId)); if (ok) setConfirmDel(false); }}
      onCancel={() => { if (!busy) setConfirmDel(false); }}
    >
      <p>Hapus aspek <strong>“{aspectName}”</strong>? Tindakan ini tak bisa dibatalkan.</p>
    </ConfirmDialog>
    </>
  );
}

function IndicatorRow({ ind, run, busy }: { ind: Ind; run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>; busy: boolean }) {
  const [text, setText] = useState(ind.text);
  const [open, setOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [desc, setDesc] = useState(ind.description);
  const [guide, setGuide] = useState<Record<string, string>>(() => ({
    '1': ind.ratingGuide?.['1'] ?? '', '2': ind.ratingGuide?.['2'] ?? '', '3': ind.ratingGuide?.['3'] ?? '',
    '4': ind.ratingGuide?.['4'] ?? '', '5': ind.ratingGuide?.['5'] ?? '',
  }));
  const [keyPoints, setKeyPoints] = useState<Record<string, string>>(() => ({
    '1': ind.ratingKeyPoints?.['1'] ?? '', '2': ind.ratingKeyPoints?.['2'] ?? '', '3': ind.ratingKeyPoints?.['3'] ?? '',
    '4': ind.ratingKeyPoints?.['4'] ?? '', '5': ind.ratingKeyPoints?.['5'] ?? '',
  }));

  const dirtyText = text.trim() !== ind.text;
  const hasGuide = !!ind.description || !!ind.ratingGuide || !!ind.ratingKeyPoints;

  async function saveGuide() {
    const ok = await run(() => updateIndicator(ind.id, text, desc, guide, keyPoints));
    if (ok) setOpen(false);
  }

  return (
    <>
    <div className={`rounded-control ${ind.is_active ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={() => setOpen((o) => !o)} title="Panduan penilaian"
          className="text-ink-faint hover:text-ink-soft shrink-0">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)}
          className="flex-1 min-w-[140px] text-[12.5px] px-2.5 py-1.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        {hasGuide && !open && <span className="text-[10px] font-semibold text-brand-ink bg-brand-tint border border-brand/20 px-1.5 py-0.5 rounded-full shrink-0">panduan</span>}
        {dirtyText && (
          <button type="button" disabled={busy} onClick={() => run(() => updateIndicator(ind.id, text))}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-control bg-brand text-white hover:bg-brand-ink disabled:opacity-50 shrink-0">Simpan</button>
        )}
        <button type="button" disabled={busy} onClick={() => run(() => toggleIndicator(ind.id, !ind.is_active))}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-50 shrink-0">
          {ind.is_active ? 'Nonaktif' : 'Aktifkan'}
        </button>
        <button type="button" disabled={busy} title="Hapus indikator (hanya bila belum dipakai penilaian)"
          onClick={() => setConfirmDel(true)}
          className="text-[11px] font-semibold px-2 py-1.5 rounded-control border border-line text-danger-ink hover:border-danger-ink disabled:opacity-50 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="mt-2 ml-5 p-3 bg-neutral-tint border border-line rounded-control space-y-2.5">
          <div>
            <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-0.5">Deskripsi Perilaku (kotak penjelasan di form)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              placeholder="Penjelasan singkat indikator ini bagi penilai…"
              className="w-full text-[12px] p-2 bg-surface border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Panduan BARS per Level</label>
            <p className="text-[10px] text-ink-faint mb-1.5 leading-relaxed">
              Key point = label pendek yang tampil besar di form penilaian (khusus indikator ini, dari Instrumen Final Q3 2026 — jangan disamakan antar indikator).
              Deskripsi = penjelasan panjang di bawahnya.
            </p>
            <div className="space-y-1.5">
              {['1', '2', '3', '4', '5'].map((lv) => (
                <div key={lv} className="flex items-start gap-1.5">
                  <span className="text-[11px] font-bold text-brand-ink data-value w-4 text-center shrink-0 mt-1.5">{lv}</span>
                  <div className="flex-1 space-y-1">
                    <input value={keyPoints[lv]} onChange={(e) => setKeyPoints((p) => ({ ...p, [lv]: e.target.value }))}
                      placeholder={`Key point — ${KEY_POINT_PLACEHOLDER[lv]}`}
                      className="w-full text-[12px] font-semibold px-2 py-1 bg-surface border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
                    <input value={guide[lv]} onChange={(e) => setGuide((p) => ({ ...p, [lv]: e.target.value }))}
                      placeholder="Deskripsi — contoh/kriteria perilaku…"
                      className="w-full text-[12px] px-2 py-1 bg-surface border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-0.5">
            <button type="button" disabled={busy} onClick={saveGuide}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-control bg-brand text-white hover:bg-brand-ink disabled:opacity-50">Simpan Panduan</button>
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-semibold text-ink-faint hover:text-ink-soft">Tutup</button>
          </div>
        </div>
      )}
    </div>
    <ConfirmDialog
      open={confirmDel}
      title="Hapus indikator?"
      tone="danger"
      confirmLabel="Hapus"
      busy={busy}
      onConfirm={async () => { const ok = await run(() => deleteIndicator(ind.id)); if (ok) setConfirmDel(false); }}
      onCancel={() => { if (!busy) setConfirmDel(false); }}
    >
      <p>Hapus indikator ini? Hanya bisa dihapus bila <strong>belum dipakai</strong> penilaian mana pun.</p>
    </ConfirmDialog>
    </>
  );
}
