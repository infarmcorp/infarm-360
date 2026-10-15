'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Plus, X } from 'lucide-react';
import { Button } from '@/components/button';
import {
  defaultSteps, releaseEmailHtml, releaseSubject,
  type ReleaseContent, type ReleasePeriod, type ReleaseStep,
} from '@/lib/email/release-template';
import { sendReleaseEmails, sendReleaseEmailTest } from './release-email-actions';

export type ReleaseRecipient = { id: string; name: string; dept: string; hasFolder: boolean; sent: boolean };

const BATCH = 20; // selaras MAX_BATCH di server
const MAX_STEPS = 8;

/**
 * Tombol + dialog "Email Rilis Laporan" (Review & Finalisasi, HRD Mode Admin). HRD mengisi bagian
 * yang berubah tiap kuartal (urutan siklus, potongan keterlambatan, Tahapan Selanjutnya), melihat
 * pratinjau, mengirim uji ke email sendiri, lalu mengirim ke pegawai ber-laporan Final yang Folder
 * Laporannya sudah diisi. Pengiriman per gelombang (BATCH) agar progres terlihat & tak kena batas waktu.
 * Isian disimpan di browser per periode (kenyamanan saja; server tak bergantung padanya).
 */
export function ReleaseEmailButton({ period, defaultCycle, recipients, appUrl }: {
  period: ReleasePeriod & { id: string };
  defaultCycle: string;
  appUrl: string; // tautan tombol "Buka Laporan Saya" (sama dengan yang dikirim server)
  recipients: ReleaseRecipient[]; // pegawai ber-laporan Final periode ini
}) {
  const router = useRouter();
  const storeKey = `release-email:${period.id}`;
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ReleaseContent>(() => ({
    cycle: defaultCycle, includeLate: period.has360, steps: defaultSteps(tomorrow(), period.label),
  }));
  const [onlyUnsent, setOnlyUnsent] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'test' | 'send'>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);

  // Buka dialog + pulihkan isian terakhir periode ini (bila ada).
  function openDialog() {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const v = JSON.parse(raw) as ReleaseContent;
        if (Array.isArray(v.steps) && typeof v.cycle === 'string') setContent({ ...v, includeLate: !!v.includeLate });
      }
    } catch { /* penyimpanan browser tak tersedia → pakai isian bawaan */ }
    setMsg(null); setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(storeKey, JSON.stringify(content)); } catch { /* abaikan */ }
  }, [open, storeKey, content]);

  const ready = recipients.filter((r) => r.hasFolder);
  const noFolder = recipients.filter((r) => !r.hasFolder);
  const unsent = ready.filter((r) => !r.sent);
  const targets = onlyUnsent ? unsent : ready;
  const sample = targets[0]?.name ?? ready[0]?.name ?? '[Nama Pegawai]';

  const previewHtml = useMemo(
    () => releaseEmailHtml({ name: sample, period, content, appUrl }),
    [sample, period, content, appUrl],
  );

  if (recipients.length === 0) return null; // belum ada laporan Final → tak ada yang dikabari

  const setStep = (i: number, patch: Partial<ReleaseStep>) =>
    setContent((c) => ({ ...c, steps: c.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  async function sendTest() {
    setBusy('test'); setMsg(null);
    const res = await sendReleaseEmailTest({ periodId: period.id, content });
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
      const res = await sendReleaseEmails({ periodId: period.id, employeeIds: ids.slice(i, i + BATCH), content });
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

  const inputCls = 'w-full rounded-control border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-tint';

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={openDialog}>
        <Mail className="w-3.5 h-3.5" /> Email Rilis Laporan
        <span className="data-value text-ink-faint">({unsent.length} belum)</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => { if (!busy) setOpen(false); }}>
          <div className="my-6 w-full max-w-5xl rounded-panel border border-line bg-surface p-5 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold text-ink">Email Rilis Laporan — <span className="data-value">{period.label}</span></h2>
                <p className="mt-0.5 text-[12.5px] text-ink-soft">
                  Mengabarkan pegawai bahwa PDF laporannya sudah bisa diunduh di <strong>Laporan Hasil Saya</strong>.
                  Email tidak memuat skor atau isi laporan.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={!!busy} className="text-ink-faint hover:text-ink disabled:opacity-40">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              {/* Kiri: penerima & isian kuartal */}
              <div className="space-y-4">
                <section className="rounded-panel border border-line bg-neutral-tint p-3 text-[12.5px] text-ink-soft space-y-1.5">
                  <p>
                    <span className="data-value font-semibold text-ink">{recipients.length}</span> laporan Final ·{' '}
                    <span className="data-value font-semibold text-ink">{ready.length}</span> Folder PDF terisi ·{' '}
                    <span className="data-value font-semibold text-ink">{ready.length - unsent.length}</span> sudah dikirimi
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={onlyUnsent} onChange={() => setOnlyUnsent(true)} className="accent-brand" />
                    Hanya yang belum pernah dikirimi (<span className="data-value">{unsent.length}</span>)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!onlyUnsent} onChange={() => setOnlyUnsent(false)} className="accent-brand" />
                    Semua yang siap, termasuk kirim ulang (<span className="data-value">{ready.length}</span>)
                  </label>
                  {noFolder.length > 0 && (
                    <details className="text-warn-ink">
                      <summary className="cursor-pointer font-semibold">
                        {noFolder.length} pegawai Final belum punya Folder Laporan → tidak dikirimi
                      </summary>
                      <p className="mt-1 text-ink-soft">{noFolder.map((r) => r.name).join(', ')}. Isi tautannya di Kelola Pegawai.</p>
                    </details>
                  )}
                </section>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">Urutan siklus</span>
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
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">Tahapan Selanjutnya</span>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">Pratinjau</p>
                <p className="mt-1 text-[12px] text-ink-soft">
                  Subjek: <span className="font-semibold text-ink">{releaseSubject(period.label, sample)}</span>
                </p>
                <iframe title="Pratinjau email" srcDoc={previewHtml} sandbox=""
                  className="mt-2 h-[560px] w-full rounded-control border border-line bg-white" />
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

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {progress && (
                <span className="mr-auto text-[12px] text-ink-soft">
                  Mengirim… <span className="data-value">{progress.done}/{progress.total}</span>
                </span>
              )}
              {confirming ? (
                <>
                  <span className="mr-auto text-[12.5px] font-semibold text-ink">
                    Kirim email ke <span className="data-value">{targets.length}</span> pegawai sekarang?
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Batal</Button>
                  <Button type="button" size="sm" onClick={sendAll}>Ya, kirim</Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={sendTest} disabled={!!busy}>
                    {busy === 'test' ? 'Mengirim uji…' : 'Kirim Uji ke Email Saya'}
                  </Button>
                  <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={!!busy || targets.length === 0}>
                    {busy === 'send' ? 'Mengirim…' : `Kirim ke ${targets.length} pegawai`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Tanggal rilis bawaan = besok (email biasanya disiapkan sehari sebelum rilis). */
function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}
