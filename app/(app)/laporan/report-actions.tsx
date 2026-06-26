'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Save, CheckCircle2, Send, Undo2, AlertTriangle } from 'lucide-react';
import { saveOrFinalizeReport, releaseToSpv } from '@/app/(app)/admin/laporan/actions';

/**
 * Panel aksi HRD di halaman detail Review Hasil Akhir — berbasis STATUS (state machine):
 *  - draft / in_review (atau belum ada): bisa diedit → Simpan Draf · Rilis ke SPV · Finalisasi.
 *  - finalized: READ-ONLY (terlihat pegawai) → hanya Unduh PDF + "Kembalikan ke Draf"
 *    (amber + konfirmasi) untuk membuka kunci & merevisi.
 * Ringkasan aspek kini AUTO-SIMPAN (lihat AspectSummaryEditor) → tak perlu guard "belum disimpan".
 * `canCompute`=false bila KPI pegawai masih kosong (Skor Akhir belum bisa dihitung).
 */
export function ReportActions({
  employeeId, status, finalScore, liveFinal, canCompute,
}: {
  employeeId: string;
  status: string | null;
  finalScore: number | null;   // Skor Akhir TERSIMPAN (yang dilihat pegawai bila final)
  liveFinal: number | null;    // Skor Akhir TERKINI (dihitung dari KPI/360/punishment sekarang)
  canCompute: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'draft' | 'final' | 'release' | 'revert' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);

  const isFinal = status === 'finalized';
  // Baris FINAL: data dasar (KPI/360/punishment) berubah sejak difinalisasi?
  const drift = isFinal && finalScore != null && liveFinal != null && Math.abs(liveFinal - finalScore) >= 0.05;

  async function run(finalize: boolean, mode: 'draft' | 'final' | 'revert') {
    setBusy(mode);
    setMsg(null);
    const res = await saveOrFinalizeReport(employeeId, finalize);
    setBusy(null);
    if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
    setMsg({
      ok: true,
      text: mode === 'final' ? `Hasil difinalisasi (Skor Akhir ${res.finalScore}) — dirilis ke pegawai.`
        : mode === 'revert' ? `Dikembalikan ke draf — disembunyikan dari pegawai (Skor Akhir ${res.finalScore}).`
        : `Draf tersimpan (Skor Akhir ${res.finalScore}).`,
    });
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
        {isFinal
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Final</span>
          : status === 'in_review'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">Ditinjau SPV</span>
          : status === 'draft'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Draf</span>
          : <span className="text-[10px] text-gray-500">belum disimpan</span>}
        {finalScore != null && <span className="text-[11px] font-mono font-bold text-slate-700">Skor Akhir {finalScore.toFixed(1)}</span>}
        {drift && (
          <span title={`Skor terkini ${liveFinal!.toFixed(1)} berbeda dari yang difinalisasi (${finalScore!.toFixed(1)}) — KPI/360°/punishment berubah. Kembalikan ke Draf lalu Finalisasi ulang untuk memperbarui.`}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            berubah → {liveFinal!.toFixed(1)}
          </span>
        )}
      </div>

      <button type="button" onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white">
        <Download className="w-3.5 h-3.5" /> Unduh PDF
      </button>

      {!canCompute ? (
        <span className="text-[11px] text-gray-500 italic">KPI pegawai masih kosong — belum bisa disimpan.</span>
      ) : isFinal ? (
        // FINAL: terkunci. Satu-satunya jalan edit = kembalikan ke draf (dgn konfirmasi).
        <button type="button" disabled={busy !== null} onClick={() => setConfirmRevert(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-50">
          <Undo2 className="w-3.5 h-3.5" /> {busy === 'revert' ? 'Mengembalikan…' : 'Kembalikan ke Draf'}
        </button>
      ) : (
        // DRAF / DITINJAU SPV: bisa diedit.
        <>
          <button type="button" disabled={busy !== null} onClick={() => run(false, 'draft')}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50"
            title="Menyimpan & menghitung ulang Skor Akhir (tetap draf)">
            <Save className="w-3.5 h-3.5" /> {busy === 'draft' ? 'Menyimpan…' : 'Simpan Draf'}
          </button>
          {status !== 'in_review' && (
            <button type="button" disabled={busy !== null} onClick={release}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> {busy === 'release' ? 'Merilis…' : 'Rilis ke SPV'}
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={() => run(true, 'final')}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            <CheckCircle2 className="w-3.5 h-3.5" /> {busy === 'final' ? 'Memfinalisasi…' : 'Finalisasi Hasil'}
          </button>
        </>
      )}

      {/* Konfirmasi sebelum menurunkan laporan FINAL → draf (menyembunyikan dari pegawai). */}
      {confirmRevert && (
        <div className="w-full mt-1 flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 mr-auto">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Laporan ini <strong>sudah final &amp; terlihat pegawai</strong>. Mengembalikan ke draf akan
            <strong> menyembunyikannya kembali</strong> dari &quot;Laporan Hasil Saya&quot; sampai difinalisasi ulang. Lanjut?
          </span>
          <button type="button" disabled={busy !== null} onClick={() => setConfirmRevert(false)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100">
            Batal
          </button>
          <button type="button" disabled={busy !== null}
            onClick={async () => { setConfirmRevert(false); await run(false, 'revert'); }}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white">
            Ya, kembalikan ke draf
          </button>
        </div>
      )}

      {msg && (
        <span className={`w-full text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</span>
      )}
    </div>
  );
}
