'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MessageSquareText, Coins, Check, X, RotateCcw } from 'lucide-react';
import { CARD, CardTitle, FIELD, FIELD_LABEL, Note } from '@/components/infarm-ui';
import { Button } from '@/components/button';
import { callAction } from '@/lib/call-action';
import { AI_MODELS, PROMPT_MAX_LEN, modelById, type AiSettings } from '@/lib/ai/settings';
import { saveAiSettings } from './actions';

const fmtRp = (n: number) => `Rp ${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

// Contoh perkiraan biaya untuk satu kali ringkas (angka kasar, hanya ilustrasi).
const SAMPLE_IN = 3000;
const SAMPLE_OUT = 600;

export function AiSettingsForm({ initial, defaults }: {
  initial: AiSettings;
  defaults: { aspectPrompt: string; qualPrompt: string };
}) {
  const router = useRouter();
  const [model, setModel] = useState(initial.model);
  const [priceIn, setPriceIn] = useState(String(initial.priceIn));
  const [priceOut, setPriceOut] = useState(String(initial.priceOut));
  const [usdIdr, setUsdIdr] = useState(String(initial.usdIdr));
  const [aspectPrompt, setAspectPrompt] = useState(initial.aspectPrompt);
  const [qualPrompt, setQualPrompt] = useState(initial.qualPrompt);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function pickModel(id: string) {
    const m = modelById(id);
    if (!m) return;
    setModel(id);
    setPriceIn(String(m.priceIn));
    setPriceOut(String(m.priceOut));
    setMsg(null);
  }

  const pIn = Number(priceIn), pOut = Number(priceOut), kurs = Number(usdIdr);
  const numbersOk = [pIn, pOut, kurs].every((n) => Number.isFinite(n) && n >= 0) && kurs > 0;
  const sampleIdr = numbersOk ? ((SAMPLE_IN * pIn + SAMPLE_OUT * pOut) / 1_000_000) * kurs : null;

  async function save() {
    setBusy(true); setMsg(null);
    const res = await callAction(() => saveAiSettings({ model, priceIn: pIn, priceOut: pOut, usdIdr: kurs, aspectPrompt, qualPrompt }));
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: `Tersimpan — berlaku untuk semua ringkasan berikutnya (versi ${res.version}).` }); router.refresh(); }
    else setMsg({ ok: false, text: res.error });
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-xs text-ink-soft">
        {initial.source === 'db' && initial.updatedAt
          ? <>Versi <span className="data-value">{initial.version}</span> · terakhir diubah {initial.updatedByName ?? '—'} pada <span className="data-value">{fmtDate(initial.updatedAt)}</span></>
          : <>Masih memakai pengaturan bawaan (belum pernah disimpan).</>}
      </p>

      <section className={CARD}>
        <CardTitle icon={Bot}>Model</CardTitle>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {AI_MODELS.map((m) => {
            const active = m.id === model;
            return (
              <button
                key={m.id} type="button" onClick={() => pickModel(m.id)}
                className={`text-left rounded-control border p-3 transition-colors ${active ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:border-infarm-light'}`}
              >
                <span className={`flex items-center gap-1.5 text-[13px] font-bold ${active ? 'text-brand-ink' : 'text-ink'}`}>
                  {active && <Check className="w-3.5 h-3.5" aria-hidden />}{m.label}
                </span>
                <span className="block text-xs text-ink-soft mt-1">{m.note}</span>
                <span className="block text-xs text-ink-soft mt-1.5 data-value">US$ {m.priceIn} / {m.priceOut} per 1 jt token</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={CARD}>
        <CardTitle icon={Coins}>Harga &amp; kurs (untuk perkiraan biaya)</CardTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={FIELD_LABEL}>Input — US$ per 1 juta token</span>
            <input className={`${FIELD} w-full data-value`} inputMode="decimal" value={priceIn} onChange={(e) => setPriceIn(e.target.value)} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>Output — US$ per 1 juta token</span>
            <input className={`${FIELD} w-full data-value`} inputMode="decimal" value={priceOut} onChange={(e) => setPriceOut(e.target.value)} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>Kurs — Rp per US$ 1</span>
            <input className={`${FIELD} w-full data-value`} inputMode="decimal" value={usdIdr} onChange={(e) => setUsdIdr(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-ink-soft mt-2.5">
          Harga terisi otomatis saat memilih model; koreksi bila daftar harga Google berubah.
          {sampleIdr != null && <> Contoh: <span className="data-value">{SAMPLE_IN.toLocaleString('id-ID')}</span> token input + <span className="data-value">{SAMPLE_OUT.toLocaleString('id-ID')}</span> token output ≈ <strong className="data-value">{fmtRp(sampleIdr)}</strong> per sekali ringkas.</>}
        </p>
      </section>

      <PromptCard
        title="Prompt — Evaluasi Aspek Budaya & Perilaku 360°"
        hint="Dipakai untuk ringkasan per aspek. Komentar dan rating per indikator ditempel otomatis setelah prompt ini."
        value={aspectPrompt} onChange={setAspectPrompt} onReset={() => setAspectPrompt(defaults.aspectPrompt)}
      />
      <PromptCard
        title="Prompt — Umpan Balik Kualitatif 360°"
        hint="Dipakai untuk ringkasan per pertanyaan esai. Jawaban penilai ditempel otomatis setelah prompt ini."
        value={qualPrompt} onChange={setQualPrompt} onReset={() => setQualPrompt(defaults.qualPrompt)}
      />

      <Note>
        Cukup atur isi dan gaya ringkasan. Pembagian hasil per aspek/pertanyaan diatur sistem. Yang dikirim ke AI hanya
        komentar dan rating tanpa nama penilai, tanpa nama atau divisi pegawai. Mengubah model atau prompt menaikkan nomor versi.
      </Note>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => { void save(); }} disabled={busy || !numbersOk}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</Button>
        {msg && (
          <span className={`flex items-center gap-1 text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>
            {msg.ok ? <Check className="w-3.5 h-3.5" aria-hidden /> : <X className="w-3.5 h-3.5" aria-hidden />}{msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function PromptCard({ title, hint, value, onChange, onReset }: {
  title: string; hint: string; value: string; onChange: (v: string) => void; onReset: () => void;
}) {
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon={MessageSquareText}>{title}</CardTitle>
        <Button variant="ghost" size="sm" type="button" onClick={onReset}><RotateCcw className="w-3.5 h-3.5" aria-hidden />Kembalikan ke bawaan</Button>
      </div>
      <p className="text-xs text-ink-soft mt-1.5">{hint}</p>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)} maxLength={PROMPT_MAX_LEN}
        rows={Math.min(18, Math.max(6, value.split('\n').length + 1))}
        className="mt-3 block w-full text-[13px] p-3 border border-line rounded-control bg-surface text-ink leading-relaxed outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint resize-y"
      />
      <p className="text-xs text-ink-soft mt-1 text-right data-value">{value.length.toLocaleString('id-ID')} / {PROMPT_MAX_LEN.toLocaleString('id-ID')}</p>
    </section>
  );
}
