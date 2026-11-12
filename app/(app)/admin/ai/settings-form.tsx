'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MessageSquareText, Coins, Check, X, RotateCcw } from 'lucide-react';
import { SearchableSelect } from '@/components/searchable-select';
import { CARD, CardTitle, FIELD, FIELD_LABEL, Note } from '@/components/infarm-ui';
import { Button } from '@/components/button';
import { callAction } from '@/lib/call-action';
import { KNOWN_PRICES, PROMPT_MAX_LEN, thinkingFor, type AiSettings } from '@/lib/ai/settings';
import type { GeminiModelInfo } from '@/lib/ai/gemini';
import { saveAiSettings } from './actions';

const fmtRp = (n: number) => `Rp ${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

// Contoh perkiraan biaya untuk satu kali ringkas (angka kasar, hanya ilustrasi).
const SAMPLE_IN = 3000;
const SAMPLE_OUT = 600;

export function AiSettingsForm({ initial, models, defaults }: {
  initial: AiSettings;
  models: GeminiModelInfo[];
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

  // Harga terakhir diubah tangan? → jangan ditimpa saat ganti model ke model tanpa harga diketahui.
  function pickModel(id: string) {
    setModel(id);
    const known = KNOWN_PRICES[id];
    if (known) { setPriceIn(String(known.priceIn)); setPriceOut(String(known.priceOut)); }
    setMsg(null);
  }
  const info = models.find((m) => m.id === model) ?? null;
  const priceKnown = !!KNOWN_PRICES[model];
  const savedModelGone = !!model && models.length > 0 && !info;

  const pIn = Number(priceIn), pOut = Number(priceOut), kurs = Number(usdIdr);
  const numbersOk = [pIn, pOut, kurs].every((n) => Number.isFinite(n) && n >= 0) && kurs > 0;
  const canSave = numbersOk && !!info;
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
        <p className="text-xs text-ink-soft mt-1.5">
          Daftar diambil langsung dari Google sesuai kunci API yang terpasang (<span className="data-value">{models.length}</span> model teks), jadi model baru muncul sendiri.
        </p>
        <div className="mt-3 max-w-xl">
          <SearchableSelect
            value={info ? model : ''}
            onChange={pickModel}
            options={models.map((m) => ({ value: m.id, label: m.label === m.id ? m.id : `${m.label} — ${m.id}` }))}
            placeholder={models.length ? '— pilih model —' : 'Daftar model belum termuat'}
            disabled={!models.length}
          />
        </div>
        {savedModelGone && (
          <div className="mt-3"><Note tone="warn">Model tersimpan <span className="data-value">{model}</span> sudah tidak tersedia untuk kunci ini. Pilih model lain lalu simpan.</Note></div>
        )}
        {info && (
          <div className="mt-3 rounded-control border border-line bg-infarm-surface p-3 text-xs text-ink-soft space-y-1">
            <p><strong className="text-ink">{info.label}</strong> · <span className="data-value">{info.id}</span>
              {info.inputTokenLimit != null && <> · batas input <span className="data-value">{info.inputTokenLimit.toLocaleString('id-ID')}</span> token</>}</p>
            {info.description && <p>{info.description}</p>}
            <p>{thinkingFor(info.id) === 'off'
              ? 'Thinking dimatikan agar hemat token.'
              : 'Thinking mengikuti bawaan model — token output (ditagih) bisa lebih banyak dari panjang ringkasan.'}</p>
          </div>
        )}
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
          {info && !priceKnown
            ? <strong className="text-warn-ink">Harga model ini belum diketahui aplikasi — isi dari halaman harga Gemini API (ai.google.dev/pricing) agar perkiraan rupiah benar. </strong>
            : 'Harga terisi otomatis untuk model yang dikenal; koreksi bila daftar harga Google berubah. '}
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
        <Button onClick={() => { void save(); }} disabled={busy || !canSave}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</Button>
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
