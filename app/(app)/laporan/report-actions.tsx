'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Save, CheckCircle2 } from 'lucide-react';
import { saveOrFinalizeReport } from '@/app/(app)/admin/laporan/actions';

/**
 * Panel aksi HRD di halaman detail Review Hasil Akhir: Unduh PDF (print),
 * Simpan Draf, Finalisasi Hasil. Finalisasi → status 'finalized' (pegawai bisa lihat).
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
  const [busy, setBusy] = useState<'draft' | 'final' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(finalize: boolean) {
    setBusy(finalize ? 'final' : 'draft');
    setMsg(null);
    const res = await saveOrFinalizeReport(employeeId, finalize);
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setMsg({ ok: true, text: finalize ? `Hasil difinalisasi (Skor Akhir ${res.finalScore}) — dirilis ke pegawai.` : `Draf tersimpan (Skor Akhir ${res.finalScore}).` });
    router.refresh();
  }

  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mr-auto">
        <span className="text-xs font-bold text-gray-700">Review Hasil Akhir</span>
        {status === 'finalized'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Final</span>
          : status === 'draft'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Draf</span>
          : <span className="text-[10px] text-gray-400">belum disimpan</span>}
        {finalScore != null && <span className="text-[11px] font-mono font-bold text-slate-700">Skor Akhir {finalScore.toFixed(1)}</span>}
      </div>

      <button type="button" onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white">
        <Download className="w-3.5 h-3.5" /> Unduh PDF
      </button>

      {!canCompute ? (
        <span className="text-[11px] text-gray-400 italic">KPI pegawai masih kosong — belum bisa disimpan.</span>
      ) : (
        <>
          <button type="button" disabled={busy !== null} onClick={() => run(false)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {busy === 'draft' ? 'Menyimpan…' : 'Simpan Draf'}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => run(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            <CheckCircle2 className="w-3.5 h-3.5" /> {busy === 'final' ? 'Memfinalisasi…' : 'Finalisasi Hasil'}
          </button>
        </>
      )}

      {msg && (
        <span className={`w-full text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>
      )}
    </div>
  );
}
