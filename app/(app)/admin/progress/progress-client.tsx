'use client';

import { useMemo, useState, useTransition } from 'react';
import { forceComplete, sendReminder, massReminder } from './actions';

export type Pending = { targetId: string; targetName: string; relation: string; mandatory: boolean };
export type AssessorRow = { id: string; name: string; dept: string; total: number; done: number; pending: Pending[] };
/** Info read-only "per yang dinilai": berapa penilai ditugaskan & berapa sudah menilai dia. */
export type TargetRow = { id: string; name: string; dept: string; total: number; done: number };

export function ProgressClient({ rows, targetRows }: { rows: AssessorRow[]; targetRows: TargetRow[] }) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState<'all' | 'lengkap' | 'belum'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const depts = useMemo(() => [...new Set(rows.map((r) => r.dept))].sort(), [rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.total > 0 && r.done === r.total).length;
    const tasks = rows.reduce((s, r) => s + r.total, 0);
    const doneTasks = rows.reduce((s, r) => s + r.done, 0);
    return { total, done, pending: total - done, pct: tasks ? Math.round((doneTasks / tasks) * 100) : 0 };
  }, [rows]);

  const shown = rows.filter((r) => {
    const complete = r.total > 0 && r.done === r.total;
    if (q.trim() && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (dept !== 'all' && r.dept !== dept) return false;
    if (status === 'lengkap' && !complete) return false;
    if (status === 'belum' && complete) return false;
    return true;
  });

  function act(fn: () => Promise<{ ok: boolean; msg?: string; error?: string }>) {
    setToast(null);
    start(async () => {
      const res = await fn();
      setToast(res.ok ? { ok: true, text: res.msg ?? 'Berhasil.' } : { ok: false, text: res.error ?? 'Gagal.' });
    });
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Total Penilai" value={stats.total} c="text-slate-800" />
        <Stat label="Lengkap" value={stats.done} c="text-emerald-700" />
        <Stat label="Belum" value={stats.pending} c="text-amber-700" />
        <Stat label="Progres Keseluruhan" value={`${stats.pct}%`} c="text-indigo-700" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama penilai…"
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg flex-1 min-w-[160px] focus:outline-none focus:ring-1 focus:ring-emerald-600" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white">
          <option value="all">Semua Divisi</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white">
          <option value="all">Semua Status</option>
          <option value="lengkap">Lengkap</option>
          <option value="belum">Belum Lengkap</option>
        </select>
        <button type="button" onClick={() => act(massReminder)} disabled={pending}
          className="text-xs font-bold px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white disabled:opacity-60">
          🔔 Kirim Pengingat Massal
        </button>
      </div>
      {toast && <p className={`text-xs font-semibold ${toast.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{toast.text}</p>}

      {/* Rows (per penilai) */}
      <div className="space-y-2">
        {shown.length === 0 && <p className="text-sm text-gray-500">Tidak ada penilai sesuai filter.</p>}
        {shown.map((r) => {
          const complete = r.total > 0 && r.done === r.total;
          const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
          return (
            <div key={r.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-bold text-gray-800 text-sm">{r.name}</span>
                  <span className="text-[11px] text-gray-400"> · {r.dept}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {r.done}/{r.total} {complete ? 'Lengkap' : 'Belum'}
                  </span>
                  {!complete && (
                    <button type="button" onClick={() => act(() => sendReminder(r.id))} disabled={pending}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
                      Kirim Pengingat
                    </button>
                  )}
                  {r.pending.length > 0 && (
                    <button type="button" onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="text-[11px] font-semibold text-gray-500 hover:underline">
                      {expanded === r.id ? 'Tutup' : `Rincian (${r.pending.length})`}
                    </button>
                  )}
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
              </div>
              {expanded === r.id && r.pending.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Belum dinilai:</p>
                  {r.pending.map((p) => (
                    <div key={p.targetId} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="text-gray-700 font-semibold">{p.targetName}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{p.relation}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${p.mandatory ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {p.mandatory ? 'Wajib' : 'Opsional'}
                        </span>
                      </div>
                      <button type="button" onClick={() => act(() => forceComplete(r.id, p.targetId))} disabled={pending}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-60 shrink-0">
                        Paksa Selesai
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 italic">
        “Paksa Selesai” menandai penilaian sebagai terkirim (tanpa skor) agar tak lagi terhitung terlambat.
        “Kirim Pengingat” akan mengirim email saat integrasi Resend diaktifkan.
      </p>

      {/* Info read-only: tiap pegawai sudah dinilai oleh berapa orang. */}
      <DinilaiInfo targetRows={targetRows} q={q} dept={dept} />
    </div>
  );
}

/** Daftar informasi (tanpa aksi): tiap pegawai sudah dinilai oleh berapa penilai. */
function DinilaiInfo({ targetRows, q, dept }: { targetRows: TargetRow[]; q: string; dept: string }) {
  const shown = targetRows.filter((r) =>
    (!q.trim() || r.name.toLowerCase().includes(q.toLowerCase())) &&
    (dept === 'all' || r.dept === dept),
  );
  if (targetRows.length === 0) return null;
  return (
    <div className="border border-gray-200 rounded-xl p-3 mt-2">
      <h2 className="text-sm font-bold text-gray-700">Sudah Dinilai oleh Berapa Orang (per pegawai)</h2>
      <p className="text-[11px] text-gray-500 mb-2">
        Informasi: untuk tiap pegawai, berapa penilai yang sudah menilainya dari total penilai yang ditugaskan
        (mengikuti filter Nama &amp; Divisi di atas).
      </p>
      <div className="space-y-1.5">
        {shown.length === 0 && <p className="text-xs text-gray-400 italic">Tidak ada pegawai sesuai filter.</p>}
        {shown.map((r) => {
          const complete = r.total > 0 && r.done === r.total;
          const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
          return (
            <div key={r.id} className="flex items-center gap-2.5">
              <div className="min-w-0 w-40 shrink-0">
                <span className="text-xs font-semibold text-gray-700 truncate">{r.name}</span>
                <span className="text-[10px] text-gray-400"> · {r.dept}</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                dinilai {r.done}/{r.total} orang
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, c }: { label: string; value: number | string; c: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 text-center">
      <div className={`text-xl font-black font-mono ${c}`}>{value}</div>
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
