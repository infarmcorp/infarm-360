'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { setExposureStatus } from '../actions';

type Status = 'eligible' | 'partially_eligible' | 'not_eligible';

const OPTIONS: { value: Status; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'eligible',
    label: 'Eligible',
    desc: 'Saya memiliki exposure kerja yang cukup untuk menilai seluruh indikator.',
    icon: <CheckCircle2 className="w-5 h-5 text-brand" />,
  },
  {
    value: 'partially_eligible',
    label: 'Partially Eligible',
    desc: 'Exposure saya cukup untuk sebagian indikator saja — indikator lain akan saya tandai N/A.',
    icon: <AlertTriangle className="w-5 h-5 text-warn-ink" />,
  },
  {
    value: 'not_eligible',
    label: 'Not Eligible',
    desc: 'Saya TIDAK memiliki exposure kerja yang cukup untuk menilai pegawai ini. Penilaian tidak dilanjutkan.',
    icon: <XCircle className="w-5 h-5 text-danger-ink" />,
  },
];

/**
 * BR-03 Exposure Check — layar WAJIB sebelum rater masuk ke form penilaian.
 * Ditampilkan oleh /penilaian/[targetId]/page.tsx selama `exposure_status` masih
 * kosong. Pilihan TERKUNCI setelah dikonfirmasi (server menolak set ulang) — jadi
 * konfirmasi di sini final sampai HRD melakukan koreksi (Tahap 2).
 */
export function ExposureCheckForm({ targetId, targetName }: { targetId: string; targetName: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Status | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function confirm() {
    if (!selected) { setErr('Pilih salah satu status exposure terlebih dahulu.'); return; }
    setErr(null); setConfirming(true);
  }

  function submit() {
    if (!selected) return;
    start(async () => {
      const res = await setExposureStatus({ targetId, status: selected });
      if (!res.ok) { setErr(res.error); setConfirming(false); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-neutral-tint border border-line rounded-panel p-4">
        <p className="text-sm text-ink-soft leading-relaxed">
          Sebelum menilai <span className="font-bold text-ink">{targetName}</span>, pastikan dulu apakah Anda
          memiliki <strong>exposure kerja</strong> (cukup berinteraksi/mengamati langsung) selama periode
          observasi. Status ini <strong>hanya bisa dikonfirmasi sekali</strong> — koreksi sesudahnya lewat HRD.
        </p>
      </div>

      <div className="space-y-2">
        {OPTIONS.map((o) => {
          const sel = selected === o.value;
          return (
            <button key={o.value} type="button" disabled={busy} onClick={() => setSelected(o.value)}
              className={`w-full text-left flex items-start gap-3 p-3.5 rounded-panel border transition-all disabled:opacity-60 ${
                sel ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-neutral-tint'
              }`}>
              <span className="shrink-0 mt-0.5">{o.icon}</span>
              <span>
                <span className="block text-sm font-extrabold text-ink">{o.label}</span>
                <span className="block text-[12px] text-ink-soft mt-0.5 leading-relaxed">{o.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}

      {!confirming ? (
        <button type="button" disabled={!selected} onClick={confirm}
          className="inline-flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
          Lanjutkan
        </button>
      ) : (
        <div className="bg-warn-tint border border-warn-ink/25 rounded-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-warn-ink font-semibold">
            Konfirmasi status <strong>{OPTIONS.find((o) => o.value === selected)?.label}</strong>? Tidak bisa diubah sendiri setelah ini.
          </p>
          <div className="flex gap-2 shrink-0">
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}
              className="text-sm font-bold px-4 py-2 rounded-control text-ink-soft bg-surface border border-line hover:bg-neutral-tint disabled:opacity-60">
              Batal
            </button>
            <button type="button" disabled={busy} onClick={submit}
              className="text-sm font-bold px-4 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
              {busy ? 'Menyimpan…' : 'Ya, Konfirmasi'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
