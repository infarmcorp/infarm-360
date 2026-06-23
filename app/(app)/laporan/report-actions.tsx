'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Save, CheckCircle2, Send, AlertTriangle } from 'lucide-react';
import { saveOrFinalizeReport, releaseToSpv } from '@/app/(app)/admin/laporan/actions';
import { useSummaryDirty } from './summary-dirty';

/**
 * Panel aksi HRD di halaman detail Review Hasil Akhir: Unduh PDF (print),
 * Simpan Draf, Rilis ke SPV, Finalisasi Hasil.
 * Alur: draft (HRD garap) → in_review (Rilis ke SPV: SPV lihat detail agregat) →
 * finalized (pegawai bisa lihat). Rilis & finalisasi NON-BLOK terhadap ACC SPV.
 * `canCompute`=false bila KPI pegawai masih kosong (Skor Akhir belum bisa dihitung).
 */
export function ReportActions({
  employeeId, status, finalScore, canCompute,
}: {
  employeeId: string;
  status: string | null;
  finalScore: number | null;
  canCompute: boolean;
}) {
  const router = useRouter();
  const { dirty } = useSummaryDirty(); // ringkasan aspek belum disimpan?
  const [busy, setBusy] = useState<'draft' | 'final' | 'release' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<null | 'release' | 'final'>(null);

  // Guard: bila ada ringkasan belum disimpan, minta konfirmasi sebelum mengubah
  // visibilitas (Rilis/Finalisasi) — keduanya TIDAK menyimpan ringkasan.
  function guardedRelease() { if (dirty) setConfirm('release'); else release(); }
  function guardedFinal() { if (dirty) setConfirm('final'); else run(true); }
  function proceedConfirm() {
    const c = confirm;
    setConfirm(null);
    if (c === 'release') release();
    else if (c === 'final') run(true);
  }

  async function run(finalize: boolean) {
    setBusy(finalize ? 'final' : 'draft');
    setMsg(null);
    const res = await saveOrFinalizeReport(employeeId, finalize);
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setMsg({ ok: true, text: finalize ? `Hasil difinalisasi (Skor Akhir ${res.finalScore}) — dirilis ke pegawai.` : `Draf tersimpan (Skor Akhir ${res.finalScore}).` });
    router.refresh();
  }

  async function release() {
    setBusy('release');
    setMsg(null);
    const res = await releaseToSpv(employeeId);
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setMsg({ ok: true, text: `Dirilis ke SPV untuk ditinjau (Skor Akhir ${res.finalScore}).` });
    router.refresh();
  }

  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mr-auto">
        <span className="text-xs font-bold text-gray-700">Review Hasil Akhir</span>
        {status === 'finalized'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Final</span>
          : status === 'in_review'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">Ditinjau SPV</span>
          : status === 'draft'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Draf</span>
          : <span className="text-[10px] text-gray-500">belum disimpan</span>}
        {finalScore != null && <span className="text-[11px] font-mono font-bold text-slate-700">Skor Akhir {finalScore.toFixed(1)}</span>}
      </div>

      <button type="button" onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white">
        <Download className="w-3.5 h-3.5" /> Unduh PDF
      </button>

      {!canCompute ? (
        <span className="text-[11px] text-gray-500 italic">KPI pegawai masih kosong — belum bisa disimpan.</span>
      ) : (
        <>
          <button type="button" disabled={busy !== null} onClick={() => run(false)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {busy === 'draft' ? 'Menyimpan…' : 'Simpan Draf'}
          </button>
          {status !== 'in_review' && status !== 'finalized' && (
            <button type="button" disabled={busy !== null} onClick={guardedRelease}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> {busy === 'release' ? 'Merilis…' : 'Rilis ke SPV'}
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={guardedFinal}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            <CheckCircle2 className="w-3.5 h-3.5" /> {busy === 'final' ? 'Memfinalisasi…' : 'Finalisasi Hasil'}
          </button>
        </>
      )}

      {/* Guard konfirmasi: ringkasan aspek belum disimpan saat akan Rilis/Finalisasi. */}
      {confirm && (
        <div className="w-full mt-1 flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 mr-auto">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Ringkasan aspek <strong>belum disimpan</strong>. {confirm === 'release' ? 'Rilis ke SPV' : 'Finalisasi'} <strong>tidak</strong> menyimpan ringkasan —
            SPV/pegawai akan melihat versi <strong>tanpa ringkasan terbaru</strong>.
          </span>
          <button type="button" onClick={() => setConfirm(null)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100">
            Batal (simpan ringkasan dulu)
          </button>
          <button type="button" onClick={proceedConfirm}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white">
            Lanjut tanpa ringkasan
          </button>
        </div>
      )}

      {msg && (
        <span className={`w-full text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>
      )}
    </div>
  );
}
