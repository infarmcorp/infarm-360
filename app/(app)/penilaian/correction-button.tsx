'use client';

import { useState, useTransition } from 'react';
import { requestCorrection } from './correction-actions';

const REL_OPTS = ['Atasan', 'Peer', 'Cross', 'Bawahan'];
const REL_LABEL: Record<string, string> = { Atasan: 'Atasan', Peer: 'Rekan (Peer)', Cross: 'Lintas Divisi', Bawahan: 'Bawahan' };

/** Tombol + modal "Minta Koreksi" garis hubungan terhadap satu rekan (penilai). */
export function CorrectionButton({
  mappingId, targetId, targetName, currentRelation, pending,
}: {
  mappingId: string; targetId: string; targetName: string; currentRelation: string; pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [newRel, setNewRel] = useState(REL_OPTS.find((r) => r !== currentRelation) ?? 'Peer');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (pending) {
    return <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Koreksi diajukan</span>;
  }

  function submit() {
    setErr(null);
    start(async () => {
      const res = await requestCorrection(mappingId, targetId, currentRelation, newRel, reason);
      if (res.ok) { setOpen(false); setReason(''); }
      else setErr(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-gray-500 hover:text-indigo-700 hover:underline">
        Minta Koreksi
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3.5 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-indigo-900 uppercase tracking-wide">Koreksi Relasi Kerja</h3>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <p className="text-xs text-gray-500">Ajukan penyesuaian garis hubungan penilaian terhadap <strong>{targetName}</strong>. Akan divalidasi HRD.</p>
            <div>
              <label className="block text-[10px] uppercase font-extrabold text-gray-400 mb-1">Garis Hubungan Saat Ini</label>
              <div className="text-xs font-bold text-gray-800 bg-gray-50 px-3 py-2.5 rounded-lg border border-gray-200">{REL_LABEL[currentRelation] ?? currentRelation}</div>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-extrabold text-indigo-900 mb-1">Relasi yang Semestinya</label>
              <select value={newRel} onChange={(e) => setNewRel(e.target.value)} disabled={busy}
                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl bg-white text-emerald-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-600">
                {REL_OPTS.map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-extrabold text-indigo-900 mb-1">Alasan Koreksi</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={3}
                placeholder="Mis. 'Beliau bukan atasan saya melainkan rekan sejawat di divisi yang sama.'"
                className="w-full text-xs p-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-600" />
            </div>
            {err && <p className="text-[11px] text-rose-600 font-semibold">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                className="text-xs font-bold text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-lg">Batal</button>
              <button type="button" onClick={submit} disabled={busy}
                className="text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-4 py-2 rounded-lg disabled:opacity-60">
                {busy ? 'Mengirim…' : 'Kirim Pengajuan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
