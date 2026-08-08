'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus } from 'lucide-react';
import { addAspect } from './actions';
import { Button } from '@/components/button';

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
    <section className={`rounded-control p-3 ${hasAspects ? 'bg-neutral-tint' : 'border border-dashed border-brand/40 bg-brand-tint'}`}>
      <span className="flex items-center gap-1.5 text-[12px] font-bold text-ink mb-2">
        <Layers className="w-4 h-4 text-ink-faint" /> Tambah Aspek (Kelompok Penilaian)
      </span>
      {!hasAspects && (
        <p className="text-[12px] text-ink-soft mb-2 leading-relaxed">
          Belum ada aspek. Mulai dengan membuat aspek pertama (mis. <strong className="font-semibold text-ink">Integritas</strong>,
          <strong className="font-semibold text-ink"> Kepemimpinan</strong>, <strong className="font-semibold text-ink">Kolaborasi</strong>), lalu tambahkan indikator di dalamnya.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama aspek, mis. Integritas"
          className="flex-1 text-[13px] px-3 py-2 bg-surface border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint font-semibold text-ink" />
        <Button type="submit" size="sm" disabled={busy} className="shrink-0">
          <Plus className="w-3.5 h-3.5" /> {busy ? 'Menyimpan…' : 'Tambah Aspek'}
        </Button>
      </form>
      {msg && <p className={`text-[12px] font-semibold mt-1.5 ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
    </section>
  );
}
