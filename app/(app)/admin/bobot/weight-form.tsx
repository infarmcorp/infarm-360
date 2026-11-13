'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveWeights } from './actions';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/button';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';

type Init = { model: '4class' | '2class'; atasan: number; peer: number; cross: number; bawahan: number; self: number; internal: number };

/** `auto2` = periode Q3 2026 dst.: model 2-Kelas memakai bobot OTOMATIS BR-10 (isian % dikunci). */
export function WeightForm({ initial, auto2 = false }: { initial: Init; auto2?: boolean }) {
  const router = useRouter();
  const [model, setModel] = useState(initial.model);
  // `self` TIDAK punya kolom input: Self selalu dikecualikan dari Skor 360° (weightedScore360),
  // jadi bobotnya tak bisa memengaruhi apa pun. Nilai lamanya tetap dibawa apa adanya saat simpan
  // agar tidak menimpa data yang sudah tersimpan di DB (skema server tetap menerima field ini).
  const [w, setW] = useState({
    atasan: initial.atasan, peer: initial.peer, cross: initial.cross, bawahan: initial.bawahan, self: initial.self, internal: initial.internal,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof typeof w) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setW((p) => ({ ...p, [k]: Number(e.target.value) }));

  const autoMode = auto2 && model === '2class';
  // Mode otomatis: isian % tak dipakai rumus, tapi skema tetap disimpan valid (total 100, dicek DB) —
  // Internal disesuaikan ke 100 − Atasan agar nilai Atasan model 4-Kelas tak ikut berubah.
  const sendW = autoMode && w.atasan + w.internal !== 100 ? { ...w, internal: 100 - w.atasan } : w;
  const total = autoMode ? 100 : model === '4class' ? w.atasan + w.peer + w.cross + w.bawahan : w.atasan + w.internal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await saveWeights({ model, ...sendW });
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: 'Bobot tersimpan. Jalankan Hitung Ulang Skor 360° agar berlaku.' }); router.refresh(); }
    else setMsg({ ok: false, text: res.error });
  }

  const field = (label: string, k: keyof typeof w) => (
    <div>
      <label className={FIELD_LABEL}>{label}</label>
      <input type="number" min={0} max={100} value={w[k]} onChange={set(k)}
        className={`${FIELD} w-full font-mono text-right`} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={FIELD_LABEL}>Model Bobot</label>
        <select value={model} onChange={(e) => setModel(e.target.value as '4class' | '2class')}
          className={FIELD}>
          <option value="4class">4-Kelas (Atasan / Rekan / Lintas Divisi / Bawahan)</option>
          <option value="2class">2-Kelas (Atasan / Internal)</option>
        </select>
      </div>

      {autoMode ? (
        <div className="border border-line bg-infarm-surface rounded-xl p-3.5 text-xs text-ink-soft leading-relaxed">
          <p className="text-[13px] font-semibold text-ink">Bobot otomatis — tidak perlu diisi</p>
          <p className="mt-1">Mulai Q3 2026, bobot 2-Kelas mengikuti jumlah penilai <strong>Internal</strong> (Rekan, Lintas Divisi, Bawahan) yang sudah mengirim:</p>
          <ul className="mt-1.5 space-y-0.5">
            <li className="flex flex-wrap items-center gap-1.5">Atasan + ≥2 Internal <ArrowRight className="w-3.5 h-3.5 text-ink-faint" aria-hidden /> <span className="font-mono font-semibold text-ink">Atasan 40% · Internal 60%</span></li>
            <li className="flex flex-wrap items-center gap-1.5">Atasan + 1 Internal <ArrowRight className="w-3.5 h-3.5 text-ink-faint" aria-hidden /> <span className="font-mono font-semibold text-ink">Atasan 60% · Internal 40%</span></li>
            <li className="flex flex-wrap items-center gap-1.5">Hanya Atasan <ArrowRight className="w-3.5 h-3.5 text-ink-faint" aria-hidden /> <span className="font-mono font-semibold text-ink">Atasan 100%</span> · Hanya Internal <ArrowRight className="w-3.5 h-3.5 text-ink-faint" aria-hidden /> <span className="font-mono font-semibold text-ink">Internal 100%</span></li>
          </ul>
          <p className="mt-1.5 text-ink-soft">Skor Internal = rata-rata seluruh penilai internal (tidak dibobot per kelompok). Bobot Khusus per Pegawai di bawah tetap berlaku.</p>
        </div>
      ) : model === '4class' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {field('Atasan', 'atasan')}{field('Rekan', 'peer')}{field('Lintas Divisi', 'cross')}{field('Bawahan', 'bawahan')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {field('Atasan', 'atasan')}{field('Internal', 'internal')}
        </div>
      )}

      <p className="text-xs text-ink-soft">
        {!autoMode && <>Total bobot: <span className="font-mono font-bold text-ink">{total}</span></>}
        {total !== 100 && <span className="text-danger-ink"> — harus tepat 100 untuk bisa disimpan</span>}
        <span className="block text-xs text-ink-soft mt-0.5">
          Evaluasi diri tidak berbobot dan tidak masuk Skor 360° — hanya pembanding di laporan pegawai.
        </span>
      </p>

      {msg && <p className={`text-[13px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}

      <Button type="submit" className="min-h-9" disabled={busy || total !== 100}>
        {busy ? 'Menyimpan…' : 'Simpan & Terapkan Bobot'}
      </Button>
    </form>
  );
}
