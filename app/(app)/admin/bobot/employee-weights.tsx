'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { saveEmployeeWeightOverride, removeEmployeeWeightOverride } from './actions';
import { SearchableSelect } from '@/components/searchable-select';
import { Button } from '@/components/button';
import type { WeightValues } from '@/lib/database.types';

export type Emp = { id: string; name: string; dept: string };
export type Override = { employeeId: string; name: string; dept: string; model: '4class' | '2class'; weights: WeightValues };

/** Ringkasan bobot untuk chip daftar (mis. "A40 · P25 · C15 · B20" / "A70 · Int30"). */
function summarize(model: '4class' | '2class', w: WeightValues): string {
  return model === '4class'
    ? `A${w.atasan ?? 0} · P${w.peer ?? 0} · C${w.cross ?? 0} · B${w.bawahan ?? 0}`
    : `A${w.atasan ?? 0} · Int${w.internal ?? 0}`;
}

/**
 * Bobot Khusus per Pegawai — kelola override skema bobot 360° untuk pegawai tertentu (migrasi 0031).
 * Baris ada → dipakai saat Hitung Ulang; tak ada → skema default periode. Optimistis + refresh.
 */
export function EmployeeWeights({ employees, overrides }: { employees: Emp[]; overrides: Override[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Override[]>(overrides);
  const [empId, setEmpId] = useState('');
  const [model, setModel] = useState<'4class' | '2class'>('4class');
  // `self` selalu 0 & tanpa kolom input — Self dikecualikan dari Skor 360°, jadi bobotnya tak dipakai.
  // Tetap dikirim ke server agar bentuk payload (skema Zod saveEmployeeWeightOverride) tak berubah.
  const [w, setW] = useState({ atasan: 40, peer: 25, cross: 15, bawahan: 20, self: 0, internal: 60 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  // Sembunyikan pegawai yang SUDAH punya override dari dropdown tambah (edit lewat daftar).
  const overriddenIds = useMemo(() => new Set(rows.map((r) => r.employeeId)), [rows]);
  const options = useMemo(
    () => employees.filter((e) => !overriddenIds.has(e.id)).map((e) => ({ value: e.id, label: `${e.name} — ${e.dept}` })),
    [employees, overriddenIds],
  );

  const set = (k: keyof typeof w) => (e: React.ChangeEvent<HTMLInputElement>) => setW((p) => ({ ...p, [k]: Number(e.target.value) }));
  const total = model === '4class' ? w.atasan + w.peer + w.cross + w.bawahan : w.atasan + w.internal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!empId) { setMsg({ ok: false, text: 'Pilih pegawai dulu.' }); return; }
    setBusy(true); setMsg(null);
    const res = await saveEmployeeWeightOverride({ employeeId: empId, model, ...w });
    setBusy(false);
    if (res.ok) {
      const emp = empById.get(empId);
      const weights: WeightValues = model === '4class'
        ? { atasan: w.atasan, peer: w.peer, cross: w.cross, bawahan: w.bawahan, self: w.self }
        : { atasan: w.atasan, internal: w.internal };
      setRows((prev) => [
        ...prev.filter((r) => r.employeeId !== empId),
        { employeeId: empId, name: emp?.name ?? '—', dept: emp?.dept ?? '—', model, weights },
      ].sort((a, b) => a.name.localeCompare(b.name)));
      setEmpId('');
      setMsg({ ok: true, text: 'Bobot khusus tersimpan. Jalankan Hitung Ulang Skor 360° agar berlaku.' });
      router.refresh();
    } else setMsg({ ok: false, text: res.error });
  }

  async function remove(id: string) {
    setBusy(true); setMsg(null);
    const res = await removeEmployeeWeightOverride(id);
    setBusy(false);
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.employeeId !== id));
      setMsg({ ok: true, text: 'Bobot khusus dihapus (kembali ke skema periode). Jalankan Hitung Ulang agar berlaku.' });
      router.refresh();
    } else setMsg({ ok: false, text: res.error });
  }

  const field = (label: string, k: keyof typeof w) => (
    <div>
      <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">{label}</label>
      <input type="number" min={0} max={100} value={w[k]} onChange={set(k)}
        className="w-full text-[13px] data-value px-2.5 py-1.5 border border-line rounded-control bg-surface text-right text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Daftar override yang ada */}
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Belum ada bobot khusus. Semua pegawai memakai skema periode di atas.</p>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-line">
          <table className="w-full text-left text-sm min-w-[480px]">
            <thead>
              <tr className="bg-neutral-tint text-[11px] uppercase tracking-[0.05em] text-ink-faint border-b border-line">
                <th className="py-2 px-3 font-semibold">Pegawai</th>
                <th className="py-2 px-3 font-semibold">Model</th>
                <th className="py-2 px-3 font-semibold">Bobot</th>
                <th className="py-2 px-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-ink block">{r.name}</span>
                    <span className="text-[11px] text-ink-faint">{r.dept}</span>
                  </td>
                  <td className="py-2.5 px-3 text-ink-soft">{r.model === '4class' ? '4-Kelas' : '2-Kelas'}</td>
                  <td className="py-2.5 px-3 data-value text-[12px] text-brand-ink">{summarize(r.model, r.weights)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button type="button" onClick={() => remove(r.employeeId)} disabled={busy}
                      title="Hapus bobot khusus (kembali ke skema periode)"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger-ink border border-line hover:border-danger-ink rounded-control px-2 py-1 disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form tambah override */}
      <form onSubmit={submit} className="rounded-control bg-neutral-tint p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.05em]">Tambah bobot khusus</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Pegawai</label>
            <SearchableSelect
              value={empId}
              onChange={setEmpId}
              options={options}
              placeholder="— pilih pegawai —"
              ariaLabel="Pilih pegawai untuk bobot khusus"
              className="rounded-control border border-line px-3 py-2 text-sm bg-surface"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">Model Bobot</label>
            <select value={model} onChange={(e) => setModel(e.target.value as '4class' | '2class')}
              className="w-full text-sm px-2.5 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
              <option value="4class">4-Kelas (Atasan / Peer / Cross / Bawahan)</option>
              <option value="2class">2-Kelas (Atasan / Internal)</option>
            </select>
          </div>
        </div>

        {model === '4class' ? (
          // Tanpa kolom Self — Self selalu dikecualikan dari Skor 360°, jadi bobotnya tak berguna.
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {field('Atasan', 'atasan')}{field('Peer', 'peer')}{field('Cross', 'cross')}{field('Bawahan', 'bawahan')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {field('Atasan', 'atasan')}{field('Internal', 'internal')}
          </div>
        )}

        <p className="text-[12px] text-ink-soft">
          Total bobot: <span className="data-value font-bold text-ink">{total}</span>
          {total !== 100 && <span className="text-warn-ink"> — umumnya 100</span>}
        </p>

        {msg && <p className={`text-[12.5px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}

        <Button type="submit" disabled={busy || !empId}>
          {busy ? 'Menyimpan…' : 'Simpan bobot khusus'}
        </Button>
      </form>
    </div>
  );
}
