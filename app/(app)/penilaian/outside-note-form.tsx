'use client';

import { useState, useTransition } from 'react';
import { PenLine } from 'lucide-react';
import { submitOutsideNote } from './outside-note-actions';
import { SearchableSelect } from '@/components/searchable-select';
import { callAction } from '@/lib/call-action';
import { OUTSIDE_NOTE_MIN, OUTSIDE_NOTE_MAX } from '@/lib/outside-notes';
import { Modal, ModalActions } from './modal';

type Candidate = { id: string; name: string; dept: string };
type Aspect = { id: string; name: string };

/**
 * "Tulis Catatan" — Catatan di Luar Pemetaan (migrasi 0054). Pola sama dengan Ajukan Penilaian
 * (request-assessment-form.tsx): pop-up, SearchableSelect rekan, validasi ulang di server.
 * Tanpa riwayat: sesudah terkirim hanya konfirmasi — catatan tak tersimpan dengan nama pengirim,
 * jadi tak bisa ditampilkan kembali kepadanya.
 */
export function OutsideNoteButton({ candidates, aspects }: { candidates: Candidate[]; aspects: Aspect[] }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [aspectId, setAspectId] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function reset() { setTargetId(''); setAspectId(''); setBody(''); setErr(null); setSent(false); }
  function close() { setOpen(false); reset(); }
  const len = body.trim().length;
  const unavailable = candidates.length === 0 || aspects.length === 0;

  function submit() {
    setErr(null);
    if (!targetId) { setErr('Pilih rekan yang ingin Anda ceritakan.'); return; }
    if (!aspectId) { setErr('Pilih aspek budaya yang paling sesuai.'); return; }
    if (len < OUTSIDE_NOTE_MIN) { setErr(`Isi catatan minimal ${OUTSIDE_NOTE_MIN} karakter.`); return; }
    start(async () => {
      const res = await callAction(() => submitOutsideNote(targetId, aspectId, body));
      if (res.ok) setSent(true);
      else setErr(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand hover:bg-brand-ink px-4 py-2 rounded-control">
        <PenLine className="w-3.5 h-3.5" /> Tulis Catatan
      </button>

      <Modal open={open} title={sent ? 'Catatan Terkirim' : 'Catatan di Luar Pemetaan'} size="lg" busy={busy} onClose={close}>
        {sent ? (
          <>
            <p className="text-sm font-bold text-brand-ink">Catatan terkirim ke HRD</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={close}
                className="text-xs font-bold text-ink-soft hover:text-ink border border-line px-4 py-2 rounded-control">
                Tutup
              </button>
              <button type="button" onClick={reset}
                className="text-xs font-bold text-white bg-brand hover:bg-brand-ink px-4 py-2 rounded-control">
                Tulis Catatan Lain
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-ink-soft">
              Nama Anda tidak ikut tersimpan. Hanya HRD yang membaca catatan ini. Hindari detail yang bisa
              menunjukkan siapa Anda.
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] uppercase font-extrabold text-ink-faint mb-1">Rekan</label>
                <SearchableSelect
                  value={targetId}
                  onChange={setTargetId}
                  disabled={busy || candidates.length === 0}
                  options={candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.dept}` }))}
                  placeholder={candidates.length ? '— Pilih Rekan Kerja —' : 'Tidak ada rekan yang bisa dipilih'}
                  searchPlaceholder="Cari rekan…"
                  className="text-xs px-3 py-2 border border-line rounded-control bg-surface"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-extrabold text-ink-faint mb-1">Aspek Budaya</label>
                <select value={aspectId} onChange={(e) => setAspectId(e.target.value)} disabled={busy || aspects.length === 0}
                  className="w-full text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink font-semibold focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
                  <option value="">— Pilih Aspek —</option>
                  {aspects.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-extrabold text-brand-ink mb-1">Isi Catatan</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={5}
                maxLength={OUTSIDE_NOTE_MAX}
                placeholder="Ceritakan kejadian atau informasi yang perlu HRD ketahui."
                className="w-full text-xs p-2.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
              <p className={`text-[10px] mt-1 ${len >= OUTSIDE_NOTE_MIN ? 'text-ink-faint' : 'text-warn-ink'}`}>
                <span className="data-value">{len}</span> karakter · minimal <span className="data-value">{OUTSIDE_NOTE_MIN}</span>
              </p>
            </div>

            <p className="text-[10px] text-ink-faint">
              Catatan tanpa rating, tidak memengaruhi Skor 360°, dan tidak bisa diubah atau dihapus setelah dikirim.
            </p>

            {err && <p className="text-[11px] text-danger-ink font-semibold">{err}</p>}
            <ModalActions busy={busy} disabled={unavailable} confirmLabel="Kirim Catatan"
              onCancel={close} onConfirm={submit} />
          </>
        )}
      </Modal>
    </>
  );
}
