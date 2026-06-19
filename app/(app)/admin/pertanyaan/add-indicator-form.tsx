'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Plus } from 'lucide-react';
import { addIndicator } from './actions';

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
    <section className="border-t border-gray-150 pt-4 mt-2">
      <span className="flex items-center gap-1.5 text-xs font-black text-emerald-950 uppercase tracking-wide mb-2">
        <PlusCircle className="w-4 h-4 text-emerald-800" /> Tambah Indikator Kuantitatif Baru
      </span>
      <form onSubmit={submit} className="space-y-3 bg-emerald-50/30 p-3 rounded-xl border border-emerald-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">Aspek Kelompok</label>
            <select value={aspectId} onChange={(e) => setAspectId(e.target.value)}
              className="w-full text-[11px] p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none text-gray-700 font-semibold cursor-pointer">
              {aspects.length === 0 && <option value="">— belum ada aspek —</option>}
              {aspects.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">Judul Ringkas</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Kejujuran Finansial"
              className="w-full text-xs p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none font-semibold text-gray-800" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-0.5">Deskripsi Perilaku (opsional)</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
            placeholder="Contoh: Senantiasa memelihara transparansi & ketepatan laporan operasional…"
            className="w-full text-xs p-1.5 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-emerald-700 outline-none text-gray-800 leading-relaxed resize-none" />
        </div>
        {msg && <p className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
        <button type="submit" disabled={busy}
          className="w-full bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> {busy ? 'Menyimpan…' : 'Tambah Indikator ke Aspek'}
        </button>
      </form>
    </section>
  );
}
