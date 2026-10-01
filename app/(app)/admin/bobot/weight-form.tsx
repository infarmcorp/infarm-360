'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveWeights } from './actions';
import { Button } from '@/components/button';

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
      <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">{label}</label>
      <input type="number" min={0} max={100} value={w[k]} onChange={set(k)}
        className="w-full text-[13px] data-value px-2.5 py-1.5 border border-line rounded-control text-right text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Model Bobot</label>
        <select value={model} onChange={(e) => setModel(e.target.value as '4class' | '2class')}
          className="text-[13px] px-2.5 py-1.5 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
          <option value="4class">4-Kelas (Atasan / Peer / Cross / Bawahan)</option>
          <option value="2class">2-Kelas (Atasan / Internal)</option>
        </select>
      </div>

      {autoMode ? (
        <div className="border border-line bg-neutral-tint rounded-panel p-3 text-[12px] text-ink-soft leading-relaxed">
          <p className="font-semibold text-ink">Bobot otomatis (BR-10) — tidak perlu diisi</p>
          <p className="mt-1">Mulai Q3 2026, bobot 2-Kelas ditentukan dari jumlah penilai <strong>Internal</strong> (Peer, Cross, Bawahan — dihitung per orang yang sudah mengirim):</p>
          <ul className="mt-1.5 space-y-0.5">
            <li>Atasan + ≥2 Internal → <span className="data-value font-semibold text-ink">Atasan 40% · Internal 60%</span></li>
            <li>Atasan + 1 Internal → <span className="data-value font-semibold text-ink">Atasan 60% · Internal 40%</span></li>
            <li>Hanya Atasan → <span className="data-value font-semibold text-ink">Atasan 100%</span> · Hanya Internal → <span className="data-value font-semibold text-ink">Internal 100%</span></li>
          </ul>
          <p className="mt-1.5 text-ink-faint">Skor Internal = rata-rata seluruh penilai internal (tidak dibobot per kelompok). Bobot Khusus per Pegawai di bawah tetap berlaku.</p>
        </div>
      ) : model === '4class' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {field('Atasan', 'atasan')}{field('Peer', 'peer')}{field('Cross', 'cross')}{field('Bawahan', 'bawahan')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {field('Atasan', 'atasan')}{field('Internal', 'internal')}
        </div>
      )}

      <p className="text-[12px] text-ink-soft">
        {!autoMode && <>Total bobot: <span className="data-value font-bold text-ink">{total}</span></>}
        {total !== 100 && <span className="text-danger-ink"> — harus tepat 100 untuk bisa disimpan</span>}
        <span className="block text-[11px] text-ink-faint mt-0.5">
          Evaluasi diri (Self) tidak punya bobot — nilainya tak pernah masuk Skor 360°, hanya tampil
          sebagai pembanding di laporan pegawai.
        </span>
      </p>

      {msg && <p className={`text-[12.5px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}

      <Button type="submit" disabled={busy || total !== 100}>
        {busy ? 'Menyimpan…' : 'Simpan & Terapkan Bobot'}
      </Button>
    </form>
  );
}
