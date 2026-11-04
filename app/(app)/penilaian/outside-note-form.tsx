'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, PenLine } from 'lucide-react';
import { submitOutsideNote } from './outside-note-actions';
import { SearchableSelect } from '@/components/searchable-select';
import { callAction } from '@/lib/call-action';
import { OUTSIDE_NOTE_MIN, OUTSIDE_NOTE_MAX } from '@/lib/outside-notes';
import { Modal, ModalActions } from './modal';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';
import { BTN_GHOST, BTN_PRIMARY, FIELD_AREA } from './penilaian-ui';

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
        className={BTN_PRIMARY}>
        <PenLine className="w-4 h-4" /> Tulis Catatan
      </button>

      <Modal open={open} title={sent ? 'Catatan Terkirim' : 'Catatan di Luar Pemetaan'} size="lg" busy={busy} onClose={close}>
        {sent ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-bold text-brand-ink"><CheckCircle2 className="w-4 h-4 shrink-0" /> Catatan terkirim ke HRD</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={close}
                className={BTN_GHOST}>
                Tutup
              </button>
              <button type="button" onClick={reset}
                className={BTN_PRIMARY}>
                Tulis Catatan Lain
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              Nama Anda tidak ikut tersimpan. Hanya HRD yang membaca catatan ini. Hindari detail yang bisa
              menunjukkan siapa Anda.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL}>Rekan</label>
                <SearchableSelect
                  value={targetId}
                  onChange={setTargetId}
                  disabled={busy || candidates.length === 0}
                  options={candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.dept}` }))}
                  placeholder={candidates.length ? '— Pilih Rekan Kerja —' : 'Tidak ada rekan yang bisa dipilih'}
                  searchPlaceholder="Cari rekan…"
                  className={FIELD}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>Aspek Budaya</label>
                <select value={aspectId} onChange={(e) => setAspectId(e.target.value)} disabled={busy || aspects.length === 0}
                  className={`${FIELD} w-full`}>
                  <option value="">— Pilih Aspek —</option>
                  {aspects.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>Isi Catatan</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={5}
                maxLength={OUTSIDE_NOTE_MAX}
                placeholder="Ceritakan kejadian atau informasi yang perlu HRD ketahui."
                className={FIELD_AREA} />
              <p className={`text-xs mt-1 ${len >= OUTSIDE_NOTE_MIN ? 'text-ink-soft' : 'text-warn-ink'}`}>
                <span className="data-value">{len}</span> karakter · minimal <span className="data-value">{OUTSIDE_NOTE_MIN}</span>
              </p>
            </div>

            <p className="text-xs text-ink-soft">
              Catatan tanpa rating, tidak memengaruhi Skor 360°, dan tidak bisa diubah atau dihapus setelah dikirim.
            </p>

            {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
            <ModalActions busy={busy} disabled={unavailable} confirmLabel="Kirim Catatan"
              onCancel={close} onConfirm={submit} />
          </>
        )}
      </Modal>
    </>
  );
}
