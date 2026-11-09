'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Plus } from 'lucide-react';
import { addIndicator } from './actions';
import { Button } from '@/components/button';
import { FIELD, FIELD_LABEL } from '@/components/infarm-ui';

/**
 * Section khusus "Tambah Indikator Kuantitatif Baru" (ala legacy): pilih Aspek →
 * Judul Ringkas + Deskripsi Perilaku → satu tombol. Teks indikator = "Judul — Deskripsi"
 * (deskripsi opsional). Menggantikan field tambah inline di tiap aspek.
 */
export function AddIndicatorForm({ aspects }: { aspects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [aspectId, setAspectId] = useState(aspects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!aspectId) { setMsg({ ok: false, text: 'Pilih aspek dahulu.' }); return; }
    if (!title.trim()) { setMsg({ ok: false, text: 'Judul indikator wajib diisi.' }); return; }
    setBusy(true); setMsg(null);
    // Deskripsi disimpan di kolom tersendiri (muncul sebagai panduan di form penilaian).
    const res = await addIndicator(aspectId, title.trim(), desc.trim());
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error ?? 'Gagal menambah indikator.' }); return; }
    setMsg({ ok: true, text: 'Indikator kuantitatif berhasil ditambahkan.' });
    setTitle(''); setDesc('');
    router.refresh();
  }

  return (
    <section className="border-t border-line-soft pt-4 mt-4">
      <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink mb-2">
        <PlusCircle className="w-4 h-4 text-brand" /> Tambah Indikator Kuantitatif Baru
      </span>
      <form onSubmit={submit} className="space-y-3 bg-neutral-tint p-3.5 rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className={FIELD_LABEL}>Aspek Kelompok</label>
            <select value={aspectId} onChange={(e) => setAspectId(e.target.value)}
              className={`${FIELD} w-full bg-surface font-semibold cursor-pointer`}>
              {aspects.length === 0 && <option value="">— belum ada aspek —</option>}
              {aspects.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={FIELD_LABEL}>Judul Ringkas</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Kejujuran Finansial"
              className={`${FIELD} w-full bg-surface font-semibold`} />
          </div>
        </div>
        <div>
          <label className={FIELD_LABEL}>Deskripsi Perilaku (opsional)</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
            placeholder="Contoh: Senantiasa memelihara transparansi & ketepatan laporan operasional…"
            className={`${FIELD} w-full py-2 bg-surface leading-relaxed resize-none`} />
        </div>
        {msg && <p className={`text-[13px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          <Plus className="w-3.5 h-3.5" /> {busy ? 'Menyimpan…' : 'Tambah Indikator ke Aspek'}
        </Button>
      </form>
    </section>
  );
}
