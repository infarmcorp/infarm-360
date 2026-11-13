'use client';

import { useState, useTransition } from 'react';
import { BookOpen, CheckCircle2, Lock, PenLine } from 'lucide-react';
import { submitOutsideNote } from './outside-note-actions';
import { SearchableSelect } from '@/components/searchable-select';
import { DatePicker } from '@/components/date-picker';

/** Hari ini menurut WIB (`YYYY-MM-DD`) — batas yang sama dengan validasi server. */
function todayWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
import { callAction } from '@/lib/call-action';
import { OUTSIDE_NOTE_MIN, OUTSIDE_NOTE_MAX, OUTSIDE_NOTE_EXTRA_MAX } from '@/lib/outside-notes';
import { Modal, ModalActions } from './modal';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';
import { BTN_GHOST, BTN_PRIMARY, FIELD_AREA } from './penilaian-ui';

type Candidate = { id: string; name: string; dept: string };
type Aspect = { id: string; name: string };

const OTHER = 'other';
const REQ = <span className="text-danger-ink">*</span>;

/**
 * "Tulis Laporan" — Laporkan Pelanggaran (tabel catatan 0054 + 0058). Pola sama dengan Ajukan Penilaian
 * (request-assessment-form.tsx): pop-up, SearchableSelect rekan, validasi ulang di server.
 * Tanpa riwayat: sesudah terkirim hanya konfirmasi — laporan tak tersimpan dengan nama pengirim,
 * jadi tak bisa ditampilkan kembali kepadanya.
 */
export function OutsideNoteButton({ candidates, aspects }: { candidates: Candidate[]; aspects: Aspect[] }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [category, setCategory] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function reset() { setTargetId(''); setCategory(''); setIncidentDate(''); setBody(''); setNote(''); setErr(null); setSent(false); }
  function close() { setOpen(false); reset(); }
  const len = body.trim().length;
  const unavailable = candidates.length === 0;

  function submit() {
    setErr(null);
    if (!targetId) { setErr('Pilih rekan yang dilaporkan.'); return; }
    if (len < OUTSIDE_NOTE_MIN) { setErr(`Isi laporan minimal ${OUTSIDE_NOTE_MIN} karakter.`); return; }
    if (!incidentDate) { setErr('Isi tanggal kejadian.'); return; }
    if (!category) { setErr('Pilih kategori laporan.'); return; }
    start(async () => {
      const res = await callAction(() => submitOutsideNote(targetId, category, incidentDate, body, note));
      if (res.ok) setSent(true);
      else setErr(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}>
        <PenLine className="w-4 h-4" /> Tulis Laporan
      </button>

      <Modal open={open} title={sent ? 'Laporan Terkirim' : 'Laporkan Pelanggaran'} size="xl" busy={busy} onClose={close}>
        {sent ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-bold text-brand-ink"><CheckCircle2 className="w-4 h-4 shrink-0" /> Laporan terkirim ke HRD</p>
            <p className="text-[13px] text-ink-soft">Terima kasih. Nama dan identitas Anda tidak tersimpan bersama laporan ini.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={close} className={BTN_GHOST}>Tutup</button>
              <button type="button" onClick={reset} className={BTN_PRIMARY}>Tulis Laporan Lain</button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex gap-2.5 rounded-xl border border-brand-tint bg-infarm-surface px-3.5 py-3">
                <BookOpen className="w-4 h-4 shrink-0 mt-0.5 text-brand-ink" aria-hidden />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.06em] text-brand-ink mb-1">Panduan</p>
                  <p className="text-xs leading-relaxed text-ink">Jelaskan waktu, tempat, pihak yang terlibat, kronologi kejadian, dan dampaknya.</p>
                </div>
              </div>
              <div className="flex gap-2.5 rounded-xl border border-line bg-infarm-cream px-3.5 py-3">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-infarm-soil" aria-hidden />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.06em] text-infarm-soil mb-1">Kerahasiaan</p>
                  <p className="text-xs leading-relaxed text-ink">
                    Nama dan identitas Anda tidak disimpan dalam laporan. Laporan hanya dapat diakses oleh HRD untuk keperluan
                    verifikasi dan tindak lanjut, serta tidak dapat dilihat oleh rekan yang dilaporkan maupun karyawan lain.
                  </p>
                </div>
              </div>
            </div>

            {/* Satu baris di layar lebar: rekan (lebih lebar) · tanggal kejadian · kategori — agar pop-up muat tanpa digulir. */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2 min-w-0">
                <label className={FIELD_LABEL}>Rekan yang dilaporkan {REQ}</label>
                <SearchableSelect
                  value={targetId}
                  onChange={setTargetId}
                  disabled={busy || candidates.length === 0}
                  options={candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.dept}` }))}
                  placeholder={candidates.length ? '— Cari & pilih rekan kerja —' : 'Tidak ada rekan yang bisa dipilih'}
                  searchPlaceholder="Cari rekan…"
                  className={FIELD}
                />
              </div>
              <div className="min-w-0">
                <label className={FIELD_LABEL}>Tanggal kejadian {REQ}</label>
                {/* Pemilih tanggal yang sama dengan Kelola Periode; tanggal setelah hari ini (WIB) tak bisa dipilih. */}
                <DatePicker value={incidentDate} onChange={setIncidentDate} max={todayWib()}
                  placeholder="Pilih tanggal" ariaLabel="Tanggal kejadian" className="w-full" />
              </div>
              <div className="min-w-0">
                <label className={FIELD_LABEL}>Kategori {REQ}</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}
                  className={`${FIELD} w-full`}>
                  <option value="">— Pilih kategori —</option>
                  {aspects.length > 0 && (
                    <optgroup label="Budaya kerja">
                      {aspects.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  )}
                  <option value={OTHER}>Lainnya (di luar budaya kerja)</option>
                </select>
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>Laporan Anda {REQ}</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={5}
                maxLength={OUTSIDE_NOTE_MAX} placeholder="Ketik isi laporan Anda" className={FIELD_AREA} />
              <p className={`text-xs mt-1 ${len >= OUTSIDE_NOTE_MIN ? 'text-ink-soft' : 'text-warn-ink'}`}>
                <span className="data-value">{len}</span> karakter · minimal <span className="data-value">{OUTSIDE_NOTE_MIN}</span>
              </p>
            </div>

            <div>
              <label className={FIELD_LABEL}>
                Catatan <span className="font-medium">(opsional)</span>
                {category === OTHER && (
                  <span className="ml-1.5 font-semibold text-warn-ink">· Kategori Lainnya: sebutkan jenis pelanggarannya di sini</span>
                )}
              </label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} rows={2}
                maxLength={OUTSIDE_NOTE_EXTRA_MAX} placeholder="Informasi tambahan untuk HRD, misalnya bukti yang Anda punya"
                className={FIELD_AREA} />
            </div>

            <p className="text-xs text-ink-soft">
              Laporan ini tidak memengaruhi Skor 360° dan tidak bisa diubah atau dihapus setelah dikirim.
            </p>

            {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
            <ModalActions busy={busy} disabled={unavailable} confirmLabel="Kirim Laporan"
              onCancel={close} onConfirm={submit} />
          </>
        )}
      </Modal>
    </>
  );
}
