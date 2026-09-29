'use client';

import { fmt2 } from '@/lib/scoring';

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
  employeeId, status, finalScore, liveFinal, canCompute, totalMonths, missingMonths, stale360,
  subjectIsSpv = false,
}: {
  employeeId: string;
  status: string | null;
  finalScore: number | null;   // Skor Akhir TERSIMPAN (yang dilihat pegawai bila final)
  liveFinal: number | null;    // Skor Akhir TERKINI (dihitung dari KPI/360/punishment sekarang)
  canCompute: boolean;
  totalMonths: number;         // jumlah bulan periode
  missingMonths: string[];     // bulan KPI yang belum terisi
  stale360: boolean;           // Skor 360° perlu dihitung ulang (penilaian/koreksi berubah)
  subjectIsSpv?: boolean;      // subjek laporan berperan SPV → peninjau/ACC = DIREKSI (bukan SPV)
}) {
  // Eskalasi: laporan pegawai ditinjau SPV; laporan SPV ditinjau DIREKSI. Ubah label agar jelas.
  const reviewer = subjectIsSpv ? 'Direksi' : 'SPV';
  const router = useRouter();
  const [busy, setBusy] = useState<'draft' | 'final' | 'release' | 'revert' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);

  const isFinal = status === 'finalized';

  // Masalah yang patut dikonfirmasi sebelum Finalisasi (tak memblokir keras):
  //  - Skor 360° usang (sebaiknya Hitung Ulang dulu) — bisa membekukan skor lama.
  //  - KPI belum lengkap semua bulan (mungkin sah bila pegawai baru aktif sebagian periode).
  const finalIssues: string[] = [];
  if (stale360) finalIssues.push('Skor 360° belum dihitung ulang (perlu hitung ulang) — finalisasi sekarang membekukan skor 360° lama.');
  if (missingMonths.length > 0) finalIssues.push(`KPI baru terisi ${totalMonths - missingMonths.length} dari ${totalMonths} bulan (belum ada: ${missingMonths.join(', ')}).`);

  function finalGuard() {
    if (finalIssues.length > 0) setConfirmFinal(true);
    else run(true, 'final');
  }
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
    setMsg({ ok: true, text: `Dirilis ke ${reviewer} untuk ditinjau (Skor Akhir ${res.finalScore}).` });
    router.refresh();
  }

  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2 bg-neutral-tint border border-line rounded-panel p-3">
      <div className="flex items-center gap-2 mr-auto">
        <span className="text-xs font-bold text-ink">Review & Finalisasi</span>
        {isFinal
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-control border bg-brand-tint text-brand-ink border-brand-ink/20">Final</span>
          : status === 'in_review'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-control border bg-neutral-tint text-ink-soft border-line">Ditinjau {reviewer}</span>
          : status === 'draft'
          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-control border bg-warn-tint text-warn-ink border-warn-ink/25">Draf</span>
          : <span className="text-[10px] text-ink-faint">belum disimpan</span>}
        {finalScore != null && <span className="text-[11px] data-value font-bold text-ink">Skor Akhir {fmt2(finalScore)}</span>}
        {drift && (
          <span title={`Skor terkini ${fmt2(liveFinal!)} berbeda dari yang difinalisasi (${fmt2(finalScore!)}) — KPI/360°/punishment berubah. Kembalikan ke Draf lalu Finalisasi ulang untuk memperbarui.`}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warn-tint text-warn-ink border border-warn-ink/25">
            berubah → {fmt2(liveFinal!)}
          </span>
        )}
      </div>

      <button type="button" onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-control bg-sidebar hover:opacity-90 text-white">
        <Download className="w-3.5 h-3.5" /> Unduh PDF
      </button>

      {!canCompute ? (
        <span className="text-[11px] text-ink-faint italic">KPI pegawai masih kosong — belum bisa disimpan.</span>
      ) : isFinal ? (
        // FINAL: terkunci. Satu-satunya jalan edit = kembalikan ke draf (dgn konfirmasi).
        <button type="button" disabled={busy !== null} onClick={() => setConfirmRevert(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-control border border-warn-ink/40 text-warn-ink bg-warn-tint hover:bg-warn-tint/70 disabled:opacity-50">
          <Undo2 className="w-3.5 h-3.5" /> {busy === 'revert' ? 'Mengembalikan…' : 'Kembalikan ke Draf'}
        </button>
      ) : (
        // DRAF / DITINJAU SPV: bisa diedit.
        <>
          <button type="button" disabled={busy !== null} onClick={() => run(false, 'draft')}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-control border border-line text-ink-soft hover:bg-surface disabled:opacity-50"
            title="Menyimpan & menghitung ulang Skor Akhir (tetap draf)">
            <Save className="w-3.5 h-3.5" /> {busy === 'draft' ? 'Menyimpan…' : 'Simpan Draf'}
          </button>
          {status !== 'in_review' && (
            <button type="button" disabled={busy !== null} onClick={release}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-control border border-line text-ink-soft hover:bg-surface disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> {busy === 'release' ? 'Merilis…' : `Rilis ke ${reviewer}`}
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={finalGuard}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
            <CheckCircle2 className="w-3.5 h-3.5" /> {busy === 'final' ? 'Memfinalisasi…' : 'Finalisasi Hasil'}
          </button>
        </>
      )}

      {/* Konfirmasi sebelum menurunkan laporan FINAL → draf (menyembunyikan dari pegawai). */}
      {confirmRevert && (
        <div className="w-full mt-1 flex flex-wrap items-center gap-2 bg-warn-tint border border-warn-ink/25 rounded-control p-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-warn-ink mr-auto">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Laporan ini <strong>sudah final &amp; terlihat pegawai</strong>. Mengembalikan ke draf akan
            <strong> menyembunyikannya kembali</strong> dari &quot;Laporan Hasil Saya&quot; sampai difinalisasi ulang. Lanjut?
          </span>
          <button type="button" disabled={busy !== null} onClick={() => setConfirmRevert(false)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-control border border-warn-ink/40 text-warn-ink hover:bg-warn-tint/70">
            Batal
          </button>
          <button type="button" disabled={busy !== null}
            onClick={async () => { setConfirmRevert(false); await run(false, 'revert'); }}
            className="text-[11px] font-bold px-3 py-1.5 rounded-control bg-warn-ink hover:opacity-90 text-white">
            Ya, kembalikan ke draf
          </button>
        </div>
      )}

      {/* Konfirmasi sebelum Finalisasi bila ada masalah (360° usang / KPI belum lengkap). */}
      {confirmFinal && (
        <div className="w-full mt-1 flex flex-wrap items-center gap-2 bg-warn-tint border border-warn-ink/25 rounded-control p-2.5">
          <div className="flex items-start gap-1.5 text-[11px] font-semibold text-warn-ink mr-auto">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              Sebelum finalisasi, perhatikan:
              <ul className="list-disc pl-4 mt-1 space-y-0.5 font-normal">
                {finalIssues.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => setConfirmFinal(false)}
            className="text-[11px] font-bold px-3 py-1.5 rounded-control border border-warn-ink/40 text-warn-ink hover:bg-warn-tint/70">
            Batal (perbaiki dulu)
          </button>
          <button type="button" disabled={busy !== null}
            onClick={async () => { setConfirmFinal(false); await run(true, 'final'); }}
            className="text-[11px] font-bold px-3 py-1.5 rounded-control bg-brand hover:bg-brand-ink text-white">
            Ya, finalisasi
          </button>
        </div>
      )}

      {msg && (
        <span className={`w-full text-[11px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>
      )}
    </div>
  );
}
