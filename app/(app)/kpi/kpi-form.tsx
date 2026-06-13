'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveKpiScores } from './actions';

type Member = { id: string; code: string; name: string; dept: string };

/**
 * Form input KPI. Kirim hanya baris yang diisi. Komentar audit opsional
 * (PANDUAN: wajib diisi saat MENGEDIT skor — divalidasi ringan di sini).
 * Filter divisi: SPV biasa hanya 1 divisi; HRD-as-SPV bisa fokus per divisi.
 */
export function KpiForm({ members, months }: { members: Member[]; months: string[] }) {
  const [ym, setYm] = useState(months[0]);
  const [dept, setDept] = useState('all');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const depts = useMemo(() => [...new Set(members.map((m) => m.dept))].sort(), [members]);
  const shown = useMemo(() => (dept === 'all' ? members : members.filter((m) => m.dept === dept)), [members, dept]);

  function submit() {
    setMsg(null);
    const rows = shown
      .filter((m) => scores[m.id]?.trim())
      .map((m) => ({ employeeId: m.id, score: scores[m.id], note: notes[m.id] }));

    if (rows.length === 0) {
      setMsg({ ok: false, text: 'Isi minimal satu skor sebelum menyimpan.' });
      return;
    }

    startTransition(async () => {
      const res = await saveKpiScores({ ym, rows });
      setMsg(
        res.ok
          ? { ok: true, text: `Tersimpan: ${res.saved} skor.` }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="block text-sm">
          Bulan & Tahun Evaluasi
          <select
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="mt-1 block rounded border px-3 py-2"
          >
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        {depts.length > 1 && (
          <label className="block text-sm">
            Divisi
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="mt-1 block rounded border px-3 py-2"
            >
              <option value="all">Semua Divisi</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Pegawai</th>
            <th className="py-2">Skor (0–100)</th>
            <th className="py-2">Komentar Audit (jika edit)</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">
                {m.name} <span className="text-gray-400">· {m.dept}</span>
              </td>
              <td className="py-2">
                <input
                  type="number" min={0} max={100} inputMode="decimal"
                  value={scores[m.id] ?? ''}
                  onChange={(e) => setScores((s) => ({ ...s, [m.id]: e.target.value }))}
                  className="w-24 rounded border px-2 py-1"
                />
              </td>
              <td className="py-2">
                <input
                  type="text" placeholder="opsional"
                  value={notes[m.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
                  className="w-full rounded border px-2 py-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? 'Menyimpan…' : 'Simpan Semua Skor'}
        </button>
        {msg && (
          <span className={msg.ok ? 'text-green-600' : 'text-red-600'}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
