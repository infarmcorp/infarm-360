'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUp, Mail, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/button';
import { DatePicker } from '@/components/date-picker';
import {
  defaultSteps, releaseEmailHtml, releaseSubject,
  type ReleaseContent, type ReleaseImageSrc, type ReleasePeriod, type ReleaseStep,
} from '@/lib/email/release-template';
import { RELEASE_IMAGES, type ReleaseImageKey } from '@/lib/report-release';
import {
  sendReleaseEmails, sendReleaseEmailTest, uploadReleaseImage, removeReleaseImage,
  scheduleReleaseEmail, updateReleaseSchedule, cancelReleaseSchedule,
} from './release-email-actions';
import { callAction } from '@/lib/call-action';
import type { ReleaseSchedule } from '@/lib/release-schedule';
import { fmtScheduleWib, isoToWibParts, sendAtError, wibToIso } from '@/lib/release-schedule-time';

export type ReleaseRecipient = { id: string; name: string; dept: string; hasFolder: boolean; sent: boolean };

/** Data email rilis dari server (Review & Finalisasi, HRD Mode Admin). */
export type ReleaseProps = {
  period: ReleasePeriod & { id: string };
  defaultCycle: string;
  recipients: ReleaseRecipient[];          // pegawai ber-laporan Final periode ini
  appUrl: string;                          // tautan tombol "Buka Laporan Saya" (sama dengan server)
  images: Partial<Record<ReleaseImageKey, string>>; // URL publik gambar pendamping yang sudah diunggah
  storageOk: boolean;                      // false = bucket gambar belum ada (migrasi 0051)
  /** Jadwal kirim (migrasi 0053): ok=false = fitur jadwal belum aktif. */
  schedule: { ok: boolean; active: ReleaseSchedule | null; last: ReleaseSchedule | null };
};

const BATCH = 20; // selaras MAX_BATCH di server
const MAX_STEPS = 8;

/**
 * Tombol massal — langkah ③ kokpit Review & Finalisasi. Hijau bila `primary` (langkah yang sedang perlu
 * dikerjakan); nonaktif bila belum ada laporan Final. Ringkasan jumlah ditampilkan oleh kartu langkahnya.
 */
export function ReleaseEmailButton({ release, primary }: { release: ReleaseProps; primary: boolean }) {
  const [open, setOpen] = useState(false);
  const none = release.recipients.length === 0;
  return (
    <>
      <Button type="button" variant={primary && !none ? 'primary' : 'ghost'} size="sm" onClick={() => setOpen(true)}
        disabled={none} title={none ? 'Belum ada laporan Final' : undefined}>
        <Mail className="w-3.5 h-3.5" /> Kirim Email Rilis
      </Button>
      {open && <ReleaseEmailDialog release={release} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Dialog Email Rilis Laporan — massal (tanpa `onlyId`) atau satu pegawai (`onlyId`, dari tabel).
 * HRD mengisi bagian yang berubah tiap kuartal (urutan siklus, potongan keterlambatan, Tahapan
 * Selanjutnya), mengelola gambar pendamping periode, melihat pratinjau, mengirim uji ke email
 * sendiri, lalu mengirim. Massal dikirim per gelombang (BATCH) agar progres terlihat & tak kena
 * batas waktu. Isian disimpan di browser per periode (kenyamanan saja; server tak bergantung padanya).
 */
export function ReleaseEmailDialog({ release, onlyId, onClose }: { release: ReleaseProps; onlyId?: string; onClose: () => void }) {
  const { period, recipients, appUrl, images, storageOk, schedule } = release;
  const router = useRouter();
  const storeKey = `release-email:${period.id}`;
  const [content, setContent] = useState<ReleaseContent>(() => initialContent(storeKey, release));
  const [onlyUnsent, setOnlyUnsent] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'test' | 'send' | 'image' | 'schedule'>(null);
  // Kirim sekarang vs Jadwalkan (massal saja). Penerima & isi DIKUNCI bersama jadwal (keputusan 2026-10-16).
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [picked, setPicked] = useState<Set<string> | null>(null); // null = semua sesuai pilihan radio
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schedDate, setSchedDate] = useState(() => isoToWibParts(tomorrow().toISOString()).date);
  const [schedTime, setSchedTime] = useState('09:00');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(content)); } catch { /* abaikan */ }
  }, [storeKey, content]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const single = onlyId ? recipients.find((r) => r.id === onlyId) ?? null : null;
  const ready = recipients.filter((r) => r.hasFolder);
  const noFolder = recipients.filter((r) => !r.hasFolder);
  const unsent = ready.filter((r) => !r.sent);
  const base = onlyId ? (single?.hasFolder ? [single] : []) : onlyUnsent ? unsent : ready;
  const targets = picked && !onlyId ? base.filter((r) => picked.has(r.id)) : base;
  const togglePick = (id: string) => setPicked((p) => {
    const n = new Set(p ?? base.map((r) => r.id));
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const active = schedule.active;
  const activeLocked = !!active && (active.status === 'sending' || active.sentIds.length > 0);
  const sendAtIso = wibToIso(schedDate, schedTime);
  const sample = single?.name ?? targets[0]?.name ?? ready[0]?.name ?? '[Nama Pegawai]';

  // Dihitung tiap render (murah; srcDoc yang sama tak memuat ulang iframe).
  const previewHtml = releaseEmailHtml({ name: sample, period, content, appUrl, images: images as ReleaseImageSrc });

  const setStep = (i: number, patch: Partial<ReleaseStep>) =>
    setContent((c) => ({ ...c, steps: c.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  async function sendTest() {
    setBusy('test'); setMsg(null);
    const res = await callAction(() => sendReleaseEmailTest({ periodId: period.id, content }));
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: res.msg } : { ok: false, text: res.error });
  }

  async function sendAll() {
    setConfirming(false); setBusy('send'); setMsg(null);
    const ids = targets.map((t) => t.id);
    let sent = 0;
    const details: string[] = [];
    setProgress({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += BATCH) {
      const res = await callAction(() => sendReleaseEmails({ periodId: period.id, employeeIds: ids.slice(i, i + BATCH), content }));
      if (!res.ok) { details.push(`Gelombang ${i / BATCH + 1}: ${res.error}`); break; }
      sent += res.sent.length;
      res.skipped.forEach((s) => details.push(`${s.name}: dilewati — ${s.reason}`));
      res.failed.forEach((f) => details.push(`${f.name}: gagal — ${f.reason}`));
      setProgress({ done: Math.min(ids.length, i + BATCH), total: ids.length });
    }
    setBusy(null); setProgress(null);
    setMsg({ ok: details.length === 0, text: `${sent} dari ${ids.length} email terkirim.`, details });
    router.refresh();
  }

  /** Muat isi jadwal aktif ke formulir untuk diubah (penerima, isi, jam). */
  function startEdit(s: ReleaseSchedule) {
    setEditingId(s.id); setContent(s.content); setOnlyUnsent(false); setPicked(new Set(s.recipientIds));
    const p = isoToWibParts(s.sendAt); setSchedDate(p.date); setSchedTime(p.time);
    setMode('schedule'); setConfirming(false); setMsg(null);
  }

  async function saveSchedule() {
    setConfirming(false);
    if (!sendAtIso) { setMsg({ ok: false, text: 'Tanggal/jam tidak sah.' }); return; }
    const err = sendAtErrorNow(sendAtIso);
    if (err) { setMsg({ ok: false, text: err }); return; }
    setBusy('schedule'); setMsg(null);
    const ids = targets.map((t) => t.id);
    const res = await callAction(() => editingId
      ? updateReleaseSchedule({ id: editingId, sendAt: sendAtIso, employeeIds: ids, content })
      : scheduleReleaseEmail({ periodId: period.id, sendAt: sendAtIso, employeeIds: ids, content }));
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: res.msg } : { ok: false, text: res.error });
    if (res.ok) { setEditingId(null); setMode('now'); setPicked(null); setOnlyUnsent(true); router.refresh(); }
  }

  async function cancelSchedule(id: string) {
    setBusy('schedule'); setMsg(null);
    const res = await callAction(() => cancelReleaseSchedule({ id }));
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: res.msg } : { ok: false, text: res.error });
    if (res.ok) { setEditingId(null); setMode('now'); setPicked(null); router.refresh(); }
  }

  async function upload(key: ReleaseImageKey, file: File) {
    setBusy('image'); setMsg(null);
    const fd = new FormData();
    fd.set('periodId', period.id); fd.set('key', key); fd.set('file', file);
    const res = await callAction(() => uploadReleaseImage(fd));
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: res.msg } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  async function removeImage(key: ReleaseImageKey) {
    setBusy('image'); setMsg(null);
    const res = await callAction(() => removeReleaseImage({ periodId: period.id, key }));
    setBusy(null);
    setMsg(res.ok ? { ok: true, text: res.msg } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  const inputCls = 'w-full rounded-control border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-tint';
  const labelCls = 'text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={() => { if (!busy) onClose(); }}>
      <div className="my-6 w-full max-w-5xl rounded-panel border border-line bg-surface p-5 text-left shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold text-ink">
              Email Rilis Laporan — <span className="data-value">{period.label}</span>
              {single && <span className="text-ink-soft font-semibold"> · {single.name}</span>}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              Mengabarkan pegawai bahwa PDF laporannya sudah bisa diunduh di <strong>Laporan Hasil Saya</strong>.
              Email tidak memuat skor atau isi laporan.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="text-ink-faint hover:text-ink disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* Kiri: penerima, gambar, isian kuartal */}
          <div className="space-y-4">
            {!single && active && (
              <section className="rounded-panel border border-brand/30 bg-brand-tint p-3 text-[12.5px] text-ink-soft space-y-1.5">
                <p className="font-semibold text-brand-ink">
                  {activeLocked ? 'Sedang dikirim terjadwal' : 'Terjadwal'}: {fmtScheduleWib(active.sendAt)}
                </p>
                <p>
                  <span className="data-value">{active.recipientIds.length}</span> pegawai
                  {activeLocked && <> · <span className="data-value">{active.sentIds.length}</span> sudah terkirim</>}
                  {' '}· dibuat oleh {active.createdByName ?? 'HRD'}
                </p>
                {!activeLocked && !editingId && (
                  <div className="flex gap-4">
                    <button type="button" onClick={() => startEdit(active)} disabled={!!busy}
                      className="font-semibold text-brand-ink hover:underline disabled:opacity-50">Lihat / ubah jadwal</button>
                    <button type="button" onClick={() => cancelSchedule(active.id)} disabled={!!busy}
                      className="font-semibold text-danger-ink hover:underline disabled:opacity-50">Batalkan jadwal</button>
                  </div>
                )}
                {editingId && (
                  <p className="font-semibold text-warn-ink">
                    Sedang mengubah jadwal ini — penerima, isi, dan jam di formulir adalah isi jadwal. Simpan dengan tombol di bawah.
                  </p>
                )}
              </section>
            )}
            {!single && !active && schedule.last && <ScheduleResult s={schedule.last} />}

            <section className="rounded-panel border border-line bg-neutral-tint p-3 text-[12.5px] text-ink-soft space-y-1.5">
              {single ? (
                <>
                  <p>Penerima: <strong className="text-ink">{single.name}</strong> · {single.dept}</p>
                  {!single.hasFolder && <p className="font-semibold text-danger-ink">Folder Laporan pegawai ini belum diisi — isi dulu di Kelola Pegawai.</p>}
                  {single.hasFolder && single.sent && <p className="font-semibold text-warn-ink">Pegawai ini sudah pernah dikirimi email rilis periode ini — mengirim lagi = kirim ulang.</p>}
                </>
              ) : (
                <>
                  <p>
                    <span className="data-value font-semibold text-ink">{recipients.length}</span> laporan Final ·{' '}
                    <span className="data-value font-semibold text-ink">{ready.length}</span> Folder PDF terisi ·{' '}
                    <span className="data-value font-semibold text-ink">{ready.length - unsent.length}</span> sudah dikirimi
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={onlyUnsent} onChange={() => { setOnlyUnsent(true); setPicked(null); }} className="accent-brand" />
                    Hanya yang belum pernah dikirimi (<span className="data-value">{unsent.length}</span>)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!onlyUnsent} onChange={() => { setOnlyUnsent(false); setPicked(null); }} className="accent-brand" />
                    Semua yang siap, termasuk kirim ulang (<span className="data-value">{ready.length}</span>)
                  </label>
                  {base.length > 0 && (
                    <details>
                      <summary className="cursor-pointer font-semibold text-ink">
                        Lihat / pilih penerima (<span className="data-value">{targets.length}</span> dari <span className="data-value">{base.length}</span>)
                      </summary>
                      <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-control border border-line bg-surface p-2">
                        {base.map((r) => (
                          <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={picked ? picked.has(r.id) : true} onChange={() => togglePick(r.id)} className="accent-brand" />
                            <span className="text-ink">{r.name}</span>
                            <span className="text-ink-faint">· {r.dept}</span>
                            {r.sent && <span className="text-warn-ink">· sudah dikirimi</span>}
                          </label>
                        ))}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-faint">Hapus centang untuk menahan pegawai tertentu (dikirimi menyusul).</p>
                    </details>
                  )}
                  {noFolder.length > 0 && (
                    <details className="text-warn-ink">
                      <summary className="cursor-pointer font-semibold">
                        {noFolder.length} pegawai Final belum punya Folder Laporan → tidak dikirimi
                      </summary>
                      <p className="mt-1 text-ink-soft">{noFolder.map((r) => r.name).join(', ')}. Isi tautannya di Kelola Pegawai.</p>
                    </details>
                  )}
                </>
              )}
            </section>

            <section>
              <span className={labelCls}>Gambar pendamping periode ini</span>
              {!storageOk ? (
                <p className="mt-1 text-[12px] text-warn-ink">Penyimpanan gambar belum aktif (perubahan database 0051 belum dijalankan). Email tetap bisa dikirim tanpa gambar.</p>
              ) : (
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {RELEASE_IMAGES.map((def) => (
                    <ImageSlot key={def.key} label={def.label} url={images[def.key]} disabled={!!busy}
                      onPick={(f) => upload(def.key, f)} onRemove={() => removeImage(def.key)} />
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-ink-faint">JPG/PNG/WebP, maks. 2 MB. Gambar hanya berlaku untuk periode {period.label} — ganti tiap periode.</p>
            </section>

            <label className="block">
              <span className={labelCls}>Urutan siklus</span>
              <input value={content.cycle} onChange={(e) => setContent((c) => ({ ...c, cycle: e.target.value }))}
                maxLength={40} placeholder="mis. ketiga — kosongkan untuk menghilangkan kalimat" className={`${inputCls} mt-1`} />
            </label>

            {period.has360 && (
              <label className="flex items-start gap-2 text-[12.5px] text-ink-soft cursor-pointer">
                <input type="checkbox" checked={content.includeLate}
                  onChange={(e) => setContent((c) => ({ ...c, includeLate: e.target.checked }))} className="mt-0.5 accent-brand" />
                Sertakan paragraf potongan keterlambatan pengisian 360° pada periode ini
              </label>
            )}

            <div>
              <div className="flex items-center justify-between">
                <span className={labelCls}>Tahapan Selanjutnya</span>
                <button type="button" onClick={() => setContent((c) => ({ ...c, steps: defaultSteps(tomorrow(), period.label) }))}
                  className="text-[11px] font-semibold text-brand-ink hover:underline">Isi ulang bawaan</button>
              </div>
              <div className="mt-1.5 space-y-2">
                {content.steps.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="data-value pt-1.5 text-[12px] text-ink-faint">{i + 1}.</span>
                    <div className="flex-1 space-y-1">
                      <input value={s.when} onChange={(e) => setStep(i, { when: e.target.value })} maxLength={80}
                        placeholder="Tanggal, mis. 16–20 Oktober 2026" className={`${inputCls} font-semibold`} />
                      <textarea value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} maxLength={600} rows={2}
                        placeholder="Kegiatan" className={inputCls} />
                    </div>
                    <button type="button" title="Hapus tahap" onClick={() => setContent((c) => ({ ...c, steps: c.steps.filter((_, j) => j !== i) }))}
                      className="self-start pt-1.5 text-ink-faint hover:text-danger-ink"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              {content.steps.length < MAX_STEPS && (
                <button type="button" onClick={() => setContent((c) => ({ ...c, steps: [...c.steps, { when: '', text: '' }] }))}
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-ink hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Tambah tahap
                </button>
              )}
            </div>
          </div>

          {/* Kanan: pratinjau */}
          <div className="min-w-0">
            <p className={labelCls}>Pratinjau</p>
            <p className="mt-1 text-[12px] text-ink-soft">
              Subjek: <span className="font-semibold text-ink">{releaseSubject(period.label, sample)}</span>
            </p>
            <iframe title="Pratinjau email" srcDoc={previewHtml} sandbox=""
              className="mt-2 h-[620px] w-full rounded-control border border-line bg-white" />
          </div>
        </div>

        {msg && (
          <div className={`mt-4 rounded-control border px-3 py-2 text-[12.5px] ${msg.ok ? 'border-brand/25 bg-brand-tint text-brand-ink' : 'border-danger-ink/25 bg-danger-tint text-danger-ink'}`}>
            <p className="font-semibold">{msg.text}</p>
            {msg.details && msg.details.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-ink-soft">{msg.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
            )}
          </div>
        )}

        {!single && (
          <section className="mt-4 rounded-panel border border-line p-3 text-[12.5px] text-ink-soft">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === 'now'} disabled={!!editingId || !!busy}
                  onChange={() => { setMode('now'); setConfirming(false); }} className="accent-brand" />
                Kirim sekarang
              </label>
              <label className={`flex items-center gap-2 ${!schedule.ok || (!!active && !editingId) ? 'opacity-50' : 'cursor-pointer'}`}>
                <input type="radio" checked={mode === 'schedule'} disabled={!schedule.ok || (!!active && !editingId) || !!busy}
                  onChange={() => { setMode('schedule'); setConfirming(false); }} className="accent-brand" />
                Jadwalkan
              </label>
              {mode === 'schedule' && (
                <div className="flex items-center gap-2">
                  <DatePicker value={schedDate} onChange={setSchedDate} ariaLabel="Tanggal kirim" className="w-44" />
                  <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} aria-label="Jam kirim"
                    className="rounded-control border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-tint" />
                  <span className="font-semibold text-ink">WIB</span>
                </div>
              )}
            </div>
            {!schedule.ok && <p className="mt-1.5 text-ink-faint">Jadwal belum aktif — perubahan database 0053 belum dijalankan.</p>}
            {schedule.ok && active && !editingId && <p className="mt-1.5 text-ink-faint">Sudah ada jadwal aktif (di atas) — ubah atau batalkan dulu untuk membuat jadwal baru.</p>}
            {mode === 'schedule' && (
              <p className="mt-1.5 text-ink-faint">
                Penerima dan isi email di atas <strong>dikunci</strong> bersama jadwal. Email terkirim mulai jam itu sampai ±30 menit
                sesudahnya. Jadwal bisa diubah atau dibatalkan sebelum mulai terkirim. Saat jam tiba, yang laporannya sudah tidak Final,
                foldernya kosong, atau sudah pernah dikirimi akan dilewati.
              </p>
            )}
          </section>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {progress && (
            <span className="mr-auto text-[12px] text-ink-soft">
              Mengirim… <span className="data-value">{progress.done}/{progress.total}</span>
            </span>
          )}
          {confirming && mode === 'schedule' && !single ? (
            <>
              <span className="mr-auto text-[12.5px] font-semibold text-ink">
                {editingId ? 'Simpan perubahan: kirim' : 'Jadwalkan email'} ke <span className="data-value">{targets.length}</span> pegawai
                pada {sendAtIso ? fmtScheduleWib(sendAtIso) : '—'}?
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Batal</Button>
              <Button type="button" size="sm" onClick={saveSchedule}>{editingId ? 'Ya, simpan' : 'Ya, jadwalkan'}</Button>
            </>
          ) : confirming ? (
            <>
              <span className="mr-auto text-[12.5px] font-semibold text-ink">
                {single ? <>Kirim email ke {single.name} sekarang?</> : <>Kirim email ke <span className="data-value">{targets.length}</span> pegawai sekarang?</>}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Batal</Button>
              <Button type="button" size="sm" onClick={sendAll}>Ya, kirim</Button>
            </>
          ) : (
            <>
              {editingId && (
                <Button type="button" variant="ghost" size="sm" disabled={!!busy}
                  onClick={() => { setEditingId(null); setMode('now'); setPicked(null); setOnlyUnsent(true); setMsg(null); }}>
                  Batal ubah
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={sendTest} disabled={!!busy}>
                {busy === 'test' ? 'Mengirim uji…' : 'Kirim Uji ke Email Saya'}
              </Button>
              {mode === 'schedule' && !single ? (
                <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={!!busy || targets.length === 0 || !sendAtIso}>
                  {busy === 'schedule' ? 'Menyimpan…' : editingId ? 'Simpan perubahan jadwal' : `Jadwalkan ke ${targets.length} pegawai`}
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={!!busy || targets.length === 0}>
                  {busy === 'send' ? 'Mengirim…' : single ? `Kirim ke ${single.name}` : `Kirim ke ${targets.length} pegawai`}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Validasi jam kirim terhadap waktu SEKARANG (dipanggil di handler klik, bukan saat render). */
function sendAtErrorNow(iso: string): string | null {
  return sendAtError(iso, Date.now());
}

/** Hasil jadwal terakhir yang sudah selesai: jumlah terkirim/dilewati/gagal + nama & alasan. */
function ScheduleResult({ s }: { s: ReleaseSchedule }) {
  const problems = [...s.failed.map((f) => `${f.name}: gagal — ${f.reason}`), ...s.skipped.map((x) => `${x.name}: dilewati — ${x.reason}`)];
  return (
    <section className="rounded-panel border border-line bg-neutral-tint p-3 text-[12.5px] text-ink-soft space-y-1">
      <p className="font-semibold text-ink">Jadwal terakhir ({fmtScheduleWib(s.sendAt)}) selesai</p>
      <p>
        <span className="data-value font-semibold text-brand-ink">{s.sentIds.length}</span> terkirim ·{' '}
        <span className="data-value font-semibold text-warn-ink">{s.skipped.length}</span> dilewati ·{' '}
        <span className="data-value font-semibold text-danger-ink">{s.failed.length}</span> gagal
      </p>
      {problems.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">Lihat yang tidak terkirim</summary>
          <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <p className="mt-1 text-[11px] text-ink-faint">Perbaiki penyebabnya (mis. isi Folder Laporan), lalu kirim manual atau buat jadwal baru.</p>
        </details>
      )}
    </section>
  );
}

/** Satu slot gambar: pratinjau kecil + Unggah/Ganti + Hapus. */
function ImageSlot({ label, url, disabled, onPick, onRemove }: {
  label: string; url?: string; disabled: boolean; onPick: (f: File) => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-control border border-line p-2">
      <p className="text-[11.5px] font-semibold text-ink leading-tight">{label}</p>
      <div className="mt-1.5 flex h-24 items-center justify-center overflow-hidden rounded-control bg-neutral-tint">
        {url
          // eslint-disable-next-line @next/next/no-img-element -- gambar dari Storage (URL publik), bukan aset build
          ? <img src={url} alt={label} className="h-full w-full object-cover object-top" />
          : <span className="text-[11px] text-ink-faint">Belum diunggah</span>}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" disabled={disabled} onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-ink hover:underline disabled:opacity-50">
          <ImageUp className="w-3.5 h-3.5" /> {url ? 'Ganti' : 'Unggah'}
        </button>
        {url && (
          <button type="button" disabled={disabled} onClick={onRemove}
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-danger-ink hover:underline disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" /> Hapus
          </button>
        )}
      </div>
    </div>
  );
}

/** Isian awal: yang terakhir disimpan di browser untuk periode ini, atau bawaan. */
function initialContent(storeKey: string, release: ReleaseProps): ReleaseContent {
  try {
    const raw = localStorage.getItem(storeKey);
    if (raw) {
      const v = JSON.parse(raw) as ReleaseContent;
      if (Array.isArray(v.steps) && typeof v.cycle === 'string') return { ...v, includeLate: !!v.includeLate };
    }
  } catch { /* penyimpanan browser tak tersedia → pakai bawaan */ }
  return { cycle: release.defaultCycle, includeLate: release.period.has360, steps: defaultSteps(tomorrow(), release.period.label) };
}

/** Tanggal rilis bawaan = besok (email biasanya disiapkan sehari sebelum rilis). */
function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}
