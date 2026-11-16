'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trash2, ChevronUp, Pencil, Check, X } from 'lucide-react';
import { updateIndicator, toggleIndicator, deleteIndicator, renameAspect, deleteAspect, moveAspect } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';

// Tombol ikon kecil (ubah/geser/hapus aspek) & tombol teks baris indikator — skala rapat Design System Infarm.
const ICON_BTN = 'inline-flex items-center justify-center w-8 h-8 rounded-xl text-ink-soft hover:bg-neutral-tint disabled:opacity-30';
const ROW_BTN = 'inline-flex items-center justify-center min-h-9 px-3 rounded-xl text-[13px] font-semibold bg-surface border border-line disabled:opacity-50 shrink-0';
const SAVE_BTN = 'inline-flex items-center justify-center min-h-9 px-4 rounded-xl text-[13px] font-bold bg-brand text-white hover:bg-brand-ink disabled:opacity-50 shrink-0';

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
    <section className="border border-line rounded-xl p-3.5">
      <AspectHeader aspectId={aspectId} aspectName={aspectName} canUp={canUp} canDown={canDown} run={run} busy={busy} count={indicators.length} />
      <div className="space-y-2">
        {indicators.map((ind) => <IndicatorRow key={ind.id} ind={ind} run={run} busy={busy} />)}
        {indicators.length === 0 && <p className="text-[13px] text-ink-soft italic">Belum ada indikator.</p>}
      </div>
      {err && <p className="text-[12px] text-danger-ink mt-1.5">{err}</p>}
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
            className={`${FIELD} flex-1 bg-surface font-bold`} />
          <button type="button" onClick={save} disabled={busy} title="Simpan" className={`${ICON_BTN} text-brand hover:text-brand-ink`}><Check className="w-4 h-4" /></button>
          <button type="button" onClick={() => { setEditing(false); setName(aspectName); }} title="Batal" className={ICON_BTN}><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <h3 className="text-[13px] font-bold text-ink flex items-center gap-1.5">
          {aspectName}
          <span className="text-[12px] font-semibold text-ink-soft">· <span className="data-value">{count}</span> indikator</span>
        </h3>
      )}
      {!editing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => setEditing(true)} disabled={busy} title="Ubah nama" className={`${ICON_BTN} hover:text-brand`}><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => run(() => moveAspect(aspectId, 'up'))} disabled={busy || !canUp} title="Naik" className={`${ICON_BTN} hover:text-ink`}><ChevronUp className="w-4 h-4" /></button>
          <button type="button" onClick={() => run(() => moveAspect(aspectId, 'down'))} disabled={busy || !canDown} title="Turun" className={`${ICON_BTN} hover:text-ink`}><ChevronDown className="w-4 h-4" /></button>
          <button type="button" onClick={remove} disabled={busy} title="Hapus aspek" className={`${ICON_BTN} hover:text-danger-ink`}><Trash2 className="w-3.5 h-3.5" /></button>
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
    <div className={`rounded-xl ${ind.is_active ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setOpen((o) => !o)} title="Panduan penilaian"
          className={`${ICON_BTN} shrink-0`}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)}
          className={`${FIELD} flex-1 min-w-[140px] bg-surface`} />
        {hasGuide && !open && <span className="text-[12px] font-semibold text-brand-ink bg-brand-tint px-2.5 py-0.5 rounded-full shrink-0">panduan</span>}
        {dirtyText && (
          <button type="button" disabled={busy} onClick={() => run(() => updateIndicator(ind.id, text))}
            className={SAVE_BTN}>Simpan</button>
        )}
        <button type="button" disabled={busy} onClick={() => run(() => toggleIndicator(ind.id, !ind.is_active))}
          className={`${ROW_BTN} text-ink-soft hover:text-ink hover:border-line-strong`}>
          {ind.is_active ? 'Nonaktif' : 'Aktifkan'}
        </button>
        <button type="button" disabled={busy} title="Hapus indikator (hanya bila belum dipakai penilaian)"
          onClick={() => setConfirmDel(true)}
          className={`${ROW_BTN} px-2.5 text-danger-ink hover:border-danger-ink`}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="mt-2 ml-10 p-3.5 bg-neutral-tint rounded-xl space-y-3">
          <div>
            <label className={FIELD_LABEL}>Deskripsi Perilaku (kotak penjelasan di formulir)</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
              placeholder="Penjelasan singkat indikator ini bagi penilai…"
              className={`${FIELD} w-full py-2 bg-surface leading-relaxed resize-none`} />
          </div>
          <div>
            <label className={FIELD_LABEL}>Panduan BARS per Level</label>
            <p className="text-[12px] text-ink-soft mb-2 leading-relaxed">
              Poin kunci = label besar di formulir penilaian (khusus indikator ini, sesuai Instrumen Final Q3 2026). Deskripsi = penjelasan di bawahnya.
            </p>
            <div className="space-y-2">
              {['1', '2', '3', '4', '5'].map((lv) => (
                <div key={lv} className="flex items-start gap-2">
                  <span className="text-[13px] font-bold text-brand-ink data-value w-4 text-center shrink-0 mt-2">{lv}</span>
                  <div className="flex-1 space-y-1">
                    <input value={keyPoints[lv]} onChange={(e) => setKeyPoints((p) => ({ ...p, [lv]: e.target.value }))}
                      placeholder={`Poin kunci — ${KEY_POINT_PLACEHOLDER[lv]}`}
                      className={`${FIELD} w-full bg-surface font-semibold`} />
                    <input value={guide[lv]} onChange={(e) => setGuide((p) => ({ ...p, [lv]: e.target.value }))}
                      placeholder="Deskripsi — contoh/kriteria perilaku…"
                      className={`${FIELD} w-full bg-surface`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <button type="button" disabled={busy} onClick={saveGuide}
              className={SAVE_BTN}>Simpan Panduan</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-9 px-3 rounded-xl text-[13px] font-semibold text-ink-soft hover:text-ink">Tutup</button>
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
