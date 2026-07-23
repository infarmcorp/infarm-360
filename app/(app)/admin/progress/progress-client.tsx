'use client';

import { useMemo, useState, useTransition } from 'react';
import { forceComplete, sendReminder, massReminder, sendOnboarding, massOnboarding } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';

export type Pending = { targetId: string; targetName: string; relation: string; mandatory: boolean };
export type AssessorRow = {
  id: string; name: string; dept: string;
  total: number; done: number;              // semua tugas (wajib + opsional) — info sekunder
  mandatoryTotal: number; mandatoryDone: number; // kelengkapan ditentukan dari WAJIB saja
  pending: Pending[];
};
/** Info read-only "per yang dinilai": berapa penilai ditugaskan & berapa sudah menilai dia. */
export type TargetRow = { id: string; name: string; dept: string; total: number; done: number };

export function ProgressClient({ rows, targetRows, readOnly = false }: { rows: AssessorRow[]; targetRows: TargetRow[]; readOnly?: boolean }) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [status, setStatus] = useState<'all' | 'lengkap' | 'belum'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: React.ReactNode; onYes: () => void } | null>(null);
  const [pending, start] = useTransition();

  const depts = useMemo(() => [...new Set(rows.map((r) => r.dept))].sort(), [rows]);
  // Peta "dinilai oleh": berapa penilai sudah menilai pegawai ini (legacy: kolom "Menilai Si Penilai").
  const dinilaiBy = useMemo(
    () => new Map(targetRows.map((t) => [t.id, { done: t.done, total: t.total }])),
    [targetRows],
  );

  // Kelengkapan = semua penilaian WAJIB selesai (opsional tak menentukan). Tanpa wajib → lengkap.
  const isComplete = (r: AssessorRow) => r.mandatoryDone >= r.mandatoryTotal;

  const stats = useMemo(() => {
    const total = rows.length;
    const done = rows.filter(isComplete).length;
    const tasks = rows.reduce((s, r) => s + r.mandatoryTotal, 0);
    const doneTasks = rows.reduce((s, r) => s + r.mandatoryDone, 0);
    return { total, done, pending: total - done, pct: tasks ? Math.round((doneTasks / tasks) * 100) : 0 };
  }, [rows]);

  const shown = rows.filter((r) => {
    const complete = isComplete(r);
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
        <Stat label="Lengkap (wajib)" value={stats.done} c="text-emerald-700" />
        <Stat label="Belum (wajib)" value={stats.pending} c="text-amber-700" />
        <Stat label="Progres Wajib" value={`${stats.pct}%`} c="text-indigo-700" />
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
        {!readOnly && (
          <>
            <button type="button" onClick={() => act(massReminder)} disabled={pending}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white disabled:opacity-60">
              🔔 Kirim Pengingat Massal
            </button>
            <button type="button" disabled={pending}
              onClick={() => setConfirm({
                title: 'Kirim Undangan Massal?',
                onYes: () => act(massOnboarding),
                body: (
                  <>
                    <p>Kirim <strong>Undangan &amp; Info Akun</strong> ke semua pegawai.</p>
                    <p>Sandi mereka akan <strong>DISETEL ULANG</strong> (acak unik) lalu dikirim via email.</p>
                    <p className="font-semibold text-rose-700">Lakukan sekali di awal periode, sebelum mereka mengganti sandi sendiri.</p>
                  </>
                ),
              })}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
              📨 Kirim Undangan Massal
            </button>
          </>
        )}
      </div>
      {toast && <p className={`text-xs font-semibold ${toast.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{toast.text}</p>}

      {/* Rows (per penilai) */}
      <div className="space-y-2">
        {shown.length === 0 && <p className="text-sm text-gray-500">Tidak ada penilai sesuai filter.</p>}
        {shown.map((r) => {
          const complete = isComplete(r);
          const pct = r.mandatoryTotal ? Math.round((r.mandatoryDone / r.mandatoryTotal) * 100) : 100;
          const optionalPending = r.pending.filter((p) => !p.mandatory).length;
          const by = dinilaiBy.get(r.id);
          const byComplete = !!by && by.total > 0 && by.done === by.total;
          const byPct = by && by.total ? Math.round((by.done / by.total) * 100) : 0;
          return (
            <div key={r.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <span className="font-bold text-gray-800 text-sm">{r.name}</span>
                  <span className="text-[11px] text-gray-500"> · {r.dept}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {r.mandatoryDone}/{r.mandatoryTotal} wajib · {complete ? 'Lengkap' : 'Belum'}
                  </span>
                  {!readOnly && (
                    <button type="button" disabled={pending}
                      onClick={() => setConfirm({
                        title: `Kirim Undangan ke ${r.name}?`,
                        onYes: () => act(() => sendOnboarding(r.id)),
                        body: (
                          <p>Sandi <strong>{r.name}</strong> akan <strong>disetel ulang</strong> (acak) lalu dikirim via email berisi info akun &amp; panduan.</p>
                        ),
                      })}
                      title="Kirim undangan + info akun (peran, email, sandi baru, panduan)"
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
                      Undangan
                    </button>
                  )}
                  {!readOnly && !complete && (
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
              {/* Dua progres berdampingan (paritas legacy): "Menilai" vs "Dinilai oleh". */}
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 mt-2">
                <div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 mb-0.5">
                    <span>Menilai (wajib)</span>
                    <span>{r.mandatoryDone}/{r.mandatoryTotal} · {pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {optionalPending > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">+{optionalPending} opsional belum (tak memengaruhi status)</p>
                  )}
                </div>
                <div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-500 mb-0.5">
                    <span>Dinilai oleh</span>
                    <span>{by ? `${by.done}/${by.total} orang · ${byPct}%` : '—'}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${byComplete ? 'bg-indigo-600' : 'bg-amber-400'}`} style={{ width: `${byPct}%` }} />
                  </div>
                </div>
              </div>
              {expanded === r.id && r.pending.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Belum dinilai:</p>
                  {r.pending.map((p) => (
                    <div key={p.targetId} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="text-gray-700 font-semibold">{p.targetName}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{p.relation}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${p.mandatory ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {p.mandatory ? 'Wajib' : 'Opsional'}
                        </span>
                      </div>
                      {!readOnly && (
                        <button type="button" onClick={() => act(() => forceComplete(r.id, p.targetId))} disabled={pending}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-60 shrink-0">
                          Paksa Selesai
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-500 italic">
        <strong>Status "Lengkap"</strong> dihitung dari penilaian <strong>WAJIB</strong> saja — penilaian
        opsional tak memengaruhi status/kartu (tetap ditampilkan di Rincian untuk dipantau). Tiap baris:
        <strong> Menilai (wajib)</strong> (tugas wajib penilai) &amp; <strong>Dinilai oleh</strong> (berapa
        penilai sudah menilai pegawai ini). “Paksa Selesai” menandai penilaian terkirim; “Kirim Pengingat”
        mengirim email berisi daftar yang belum dinilai; “Undangan” / “Kirim Undangan Massal” mengirim
        info akun (peran, email, sandi baru, panduan) sekali di awal periode — sandi disetel ulang.
      </p>

      <ConfirmDialog
        open={!!confirm}
        icon="📨"
        title={confirm?.title ?? ''}
        tone="primary"
        confirmLabel="Kirim"
        busy={pending}
        onConfirm={() => { confirm?.onYes(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.body}
      </ConfirmDialog>
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
