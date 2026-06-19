'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus } from 'lucide-react';
import { addAspect } from './actions';

/**
 * Tambah Aspek (kelompok indikator) ke periode aktif — langkah pertama menyusun
 * pertanyaan. Setelah aspek ada, indikator & panduan ditambahkan di dalamnya.
 */
export function AddAspectForm({ hasAspects }: { hasAspects: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setMsg({ ok: false, text: 'Nama aspek wajib diisi.' }); return; }
    setBusy(true); setMsg(null);
    const res = await addAspect(name.trim());
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: res.error ?? 'Gagal menambah aspek.' }); return; }
    setMsg({ ok: true, text: `Aspek "${name.trim()}" ditambahkan.` });
    setName('');
    router.refresh();
  }

  return (
    <section className={`rounded-xl p-3 border ${hasAspects ? 'border-indigo-100 bg-indigo-50/30' : 'border-indigo-300 bg-indigo-50'}`}>
      <span className="flex items-center gap-1.5 text-xs font-black text-indigo-950 uppercase tracking-wide mb-2">
        <Layers className="w-4 h-4 text-indigo-700" /> Tambah Aspek (Kelompok Penilaian)
      </span>
      {!hasAspects && (
        <p className="text-[11px] text-indigo-900 mb-2">
          Belum ada aspek. Mulai dengan membuat aspek pertama (mis. <strong>Integritas</strong>,
          <strong> Kepemimpinan</strong>, <strong>Kolaborasi</strong>), lalu tambahkan indikator di dalamnya.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama aspek, mis. Integritas"
          className="flex-1 text-xs p-2 bg-white border border-gray-250 rounded-md focus:ring-1 focus:ring-indigo-600 outline-none font-semibold text-gray-800" />
        <button type="submit" disabled={busy}
          className="bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> {busy ? 'Menyimpan…' : 'Tambah Aspek'}
        </button>
      </form>
      {msg && <p role="status" className={`text-[11px] font-semibold mt-1.5 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
    </section>
  );
}
