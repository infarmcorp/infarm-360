'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { saveEmployeeWeightOverride, removeEmployeeWeightOverride } from './actions';
import { SearchableSelect } from '@/components/searchable-select';
import type { WeightValues } from '@/lib/database.types';

export type Emp = { id: string; name: string; dept: string };
export type Override = { employeeId: string; name: string; dept: string; model: '4class' | '2class'; weights: WeightValues };

/** Ringkasan bobot untuk chip daftar (mis. "A40 · P25 · C15 · B20" / "A70 · Int30"). */
function summarize(model: '4class' | '2class', w: WeightValues): string {
  return model === '4class'
    ? `A${w.atasan ?? 0} · P${w.peer ?? 0} · C${w.cross ?? 0} · B${w.bawahan ?? 0}${w.self ? ` · Self${w.self}` : ''}`
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
      <label className="block text-[10px] font-bold text-gray-500 mb-1">{label}</label>
      <input type="number" min={0} max={100} value={w[k]} onChange={set(k)}
        className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-emerald-500" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Daftar override yang ada */}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Belum ada bobot khusus. Semua pegawai memakai skema periode di atas.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm min-w-[480px]">
            <thead>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="py-2 px-3">Pegawai</th>
                <th className="py-2 px-3">Model</th>
                <th className="py-2 px-3">Bobot</th>
                <th className="py-2 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-gray-800 block">{r.name}</span>
                    <span className="text-[11px] text-gray-500">{r.dept}</span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600">{r.model === '4class' ? '4-Kelas' : '2-Kelas'}</td>
                  <td className="py-2.5 px-3 font-mono text-[12px] text-indigo-700">{summarize(r.model, r.weights)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button type="button" onClick={() => remove(r.employeeId)} disabled={busy}
                      title="Hapus bobot khusus (kembali ke skema periode)"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg px-2 py-1 disabled:opacity-50">
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
      <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
        <h3 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Tambah bobot khusus</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">Pegawai</label>
            <SearchableSelect
              value={empId}
              onChange={setEmpId}
              options={options}
              placeholder="— pilih pegawai —"
              ariaLabel="Pilih pegawai untuk bobot khusus"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-1">Model Bobot</label>
            <select value={model} onChange={(e) => setModel(e.target.value as '4class' | '2class')}
              className="w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
              <option value="4class">4-Kelas (Atasan / Peer / Cross / Bawahan / Self)</option>
              <option value="2class">2-Kelas (Atasan / Internal)</option>
            </select>
          </div>
        </div>

        {model === '4class' ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {field('Atasan', 'atasan')}{field('Peer', 'peer')}{field('Cross', 'cross')}{field('Bawahan', 'bawahan')}{field('Self', 'self')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {field('Atasan', 'atasan')}{field('Internal', 'internal')}
          </div>
        )}

        <p className="text-[11px] text-gray-500">
          Total bobot resmi (Self dikecualikan): <span className="font-mono font-bold">{total}</span>
          {total !== 100 && <span className="text-amber-600"> — umumnya 100</span>}
        </p>

        {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}

        <button type="submit" disabled={busy || !empId}
          className="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
          {busy ? 'Menyimpan…' : 'Simpan bobot khusus'}
        </button>
      </form>
    </div>
  );
}
