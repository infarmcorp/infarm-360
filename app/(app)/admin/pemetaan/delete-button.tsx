'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMapping, mappingDeleteInfo, setAssessmentValidity, type PairStatus } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatWib } from '@/lib/late';

type Info = { assessor: string; target: string; relation: string; status: PairStatus; invalidReason: string | null; invalidatedAt: string | null };

/**
 * Aksi per baris pemetaan sesuai status penilaian (Screen 07, Decision 09):
 *   Belum Mulai / Draft → "Hapus" (alasan wajib; Draft ikut terhapus)
 *   Terkirim            → "Periksa Validitas" → Batalkan Validitas (arsip, keluar dari skor; Screen 06)
 *   Dibatalkan          → "Dibatalkan" → lihat alasan / Pulihkan Validitas
 * Status dibaca ulang dari server saat diklik (bisa berubah sejak halaman dimuat).
 */
export function DeleteButton({ mappingId, status }: { mappingId: string; status: PairStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [reason, setReason] = useState('');

  async function open() {
    setBusy(true); setErr(null); setReason('');
    const res = await mappingDeleteInfo(mappingId);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setInfo(res);
  }

  async function confirm() {
    if (!info) return;
    setBusy(true); setErr(null);
    const res = info.status === 'submitted' ? await setAssessmentValidity(mappingId, 'invalidate', reason)
      : info.status === 'invalidated' ? await setAssessmentValidity(mappingId, 'restore', reason)
      : await deleteMapping(mappingId, reason);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setInfo(null);
    router.refresh();
  }

  const label = status === 'submitted' ? 'Periksa Validitas' : status === 'invalidated' ? 'Dibatalkan' : 'Hapus';
  const btnCls = status === 'submitted'
    ? 'border-line text-brand-ink hover:border-brand'
    : status === 'invalidated' ? 'border-line text-ink-faint hover:text-ink-soft' : 'border-line text-danger-ink hover:border-danger-ink';

  const s = info?.status;
  const title = s === 'submitted' ? 'Batalkan Validitas Penilaian?'
    : s === 'invalidated' ? 'Penilaian Dibatalkan'
    : s === 'draft' ? 'Hapus Assignment dan Draft?' : 'Hapus Assignment?';
  const confirmLabel = s === 'submitted' ? 'Batalkan Validitas'
    : s === 'invalidated' ? 'Pulihkan Validitas'
    : s === 'draft' ? 'Hapus Assignment dan Draft' : 'Hapus Assignment';
  const reasonOk = reason.trim().length >= 5;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button type="button" disabled={busy} onClick={open}
        className={`text-[11px] font-semibold px-2.5 py-1 rounded-control border leading-tight disabled:opacity-50 ${btnCls}`}>
        {busy && !info ? '…' : label}
      </button>
      {err && !info && <span className="text-[10px] text-danger-ink">{err}</span>}

      <ConfirmDialog
        open={!!info}
        title={title}
        tone={s === 'invalidated' ? 'primary' : 'danger'}
        confirmLabel={confirmLabel}
        cancelLabel="Kembali"
        busy={busy}
        confirmDisabled={!reasonOk}
        onConfirm={confirm}
        onCancel={() => { if (!busy) { setInfo(null); setErr(null); } }}
      >
        <div className="text-left space-y-2">
          <p>
            <strong>{info?.assessor}</strong> → <strong>{info?.target}</strong> · relasi {info?.relation}
          </p>
          {s === 'none' && (
            <p>Assignment ini akan dihapus dari daftar penilaian rater. Rater tidak lagi memiliki kewajiban menyelesaikan penilaian ini.</p>
          )}
          {s === 'draft' && (
            <p className="text-danger-ink">
              Assignment ini sudah memiliki jawaban <strong>Draft</strong>. Bila dilanjutkan, assignment dan seluruh jawaban
              Draft pada periode ini akan <strong>terhapus</strong> dan tidak dapat dipulihkan. Assignment yang dihapus tidak
              lagi menjadi kewajiban rater.
            </p>
          )}
          {s === 'submitted' && (
            <p>
              Penilaian ini sudah <strong>terkirim</strong> sehingga tidak dapat dihapus. Bila setelah diverifikasi rater
              ternyata tidak layak menilai, batalkan validitasnya: penilaian <strong>dikeluarkan dari perhitungan Skor 360°</strong>,
              jawaban &amp; evidence <strong>tetap disimpan sebagai arsip</strong>, dan tidak memicu potongan keterlambatan.
              Pembatalan tidak boleh dilakukan semata-mata karena skor yang diberikan tidak diinginkan.
            </p>
          )}
          {s === 'invalidated' && (
            <p>
              Validitas penilaian ini dibatalkan{info?.invalidatedAt ? <> pada <span className="data-value">{formatWib(info.invalidatedAt)}</span></> : null}.
              <span className="block mt-1">Alasan: <em>{info?.invalidReason ?? '—'}</em></span>
              <span className="block mt-1">Memulihkan akan mengembalikan penilaian ke perhitungan Skor 360°.</span>
            </p>
          )}
          <label className="block">
            <span className="block text-[10px] font-semibold text-ink-faint uppercase tracking-[0.05em] mb-1">
              {s === 'invalidated' ? 'Alasan pemulihan' : s === 'submitted' ? 'Alasan pembatalan' : 'Alasan penghapusan'} *
            </span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} disabled={busy}
              placeholder={s === 'submitted' ? 'mis. Tidak ada interaksi kerja selama periode — dikonfirmasi ke leader' : 'mis. Assignment ganda, perubahan struktur organisasi'}
              className="w-full text-[12.5px] px-2.5 py-1.5 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
            <span className="block text-[10px] text-ink-faint text-right data-value">{reason.trim().length}/300 · min. 5</span>
          </label>
          {err && <p className="text-[11.5px] font-semibold text-danger-ink">{err}</p>}
        </div>
      </ConfirmDialog>
    </div>
  );
}
