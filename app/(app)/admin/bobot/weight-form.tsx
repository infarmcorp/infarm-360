'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveWeights } from './actions';
import { Button } from '@/components/button';

type Init = { model: '4class' | '2class'; atasan: number; peer: number; cross: number; bawahan: number; self: number; internal: number };

export function WeightForm({ initial }: { initial: Init }) {
  const router = useRouter();
  const [model, setModel] = useState(initial.model);
  const [w, setW] = useState({
    atasan: initial.atasan, peer: initial.peer, cross: initial.cross, bawahan: initial.bawahan, self: initial.self, internal: initial.internal,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof typeof w) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setW((p) => ({ ...p, [k]: Number(e.target.value) }));

  const total = model === '4class' ? w.atasan + w.peer + w.cross + w.bawahan : w.atasan + w.internal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await saveWeights({ model, ...w });
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

  /**
   * Kolom Self — TETAP bisa diisi (permintaan pengguna), tetapi diberi keterangan tegas bahwa
   * nilainya TIDAK ikut menghitung Skor 360° resmi (`weightedScore360` selalu mengecualikan Self;
   * lihat lib/score360.ts). Dibedakan: belum diset (0) vs diisi tapi tetap tak dipakai — supaya
   * HRD tak mengira angka yang diketik di sini akan mengubah skor.
   */
  const selfField = (
    <div>
      <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">
        Self <span className="normal-case tracking-normal font-bold text-warn-ink">· tak dihitung</span>
      </label>
      <input type="number" min={0} max={100} value={w.self} onChange={set('self')}
        className="w-full text-[13px] data-value px-2.5 py-1.5 border border-warn-ink/30 bg-warn-tint/40 rounded-control text-right text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
      <p className="mt-1 text-[10.5px] leading-snug text-warn-ink">
        {w.self > 0
          ? <>Terisi, tetapi <strong>bobot Self tetap dikecualikan</strong> dari Skor 360° — evaluasi diri hanya dipakai sebagai pembanding di laporan.</>
          : <>Tidak diset — <strong>bobot Self dikecualikan</strong> dari perhitungan Skor 360°.</>}
      </p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Model Bobot</label>
        <select value={model} onChange={(e) => setModel(e.target.value as '4class' | '2class')}
          className="text-[13px] px-2.5 py-1.5 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
          <option value="4class">4-Kelas (Atasan / Peer / Cross / Bawahan / Self)</option>
          <option value="2class">2-Kelas (Atasan / Internal)</option>
        </select>
      </div>

      {model === '4class' ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-start">
          {field('Atasan', 'atasan')}{field('Peer', 'peer')}{field('Cross', 'cross')}{field('Bawahan', 'bawahan')}{selfField}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {field('Atasan', 'atasan')}{field('Internal', 'internal')}
        </div>
      )}

      <p className="text-[12px] text-ink-soft">
        Total bobot resmi (Self dikecualikan): <span className="data-value font-bold text-ink">{total}</span>
        {total !== 100 && <span className="text-warn-ink"> — umumnya 100</span>}
      </p>

      {msg && <p className={`text-[12.5px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}

      <Button type="submit" disabled={busy}>
        {busy ? 'Menyimpan…' : 'Simpan & Terapkan Bobot'}
      </Button>
    </form>
  );
}
