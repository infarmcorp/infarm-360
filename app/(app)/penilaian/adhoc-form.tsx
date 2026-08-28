'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { addAdhocTarget } from './adhoc-actions';
import { SearchableSelect } from '@/components/searchable-select';
import { Modal, ModalActions } from './modal';

type Candidate = { id: string; name: string; dept: string };

/**
 * "Hak Penilaian Ad-Hoc": tambah rekan di luar daftar rutin untuk dinilai — INSTAN,
 * tanpa persetujuan HRD, relasi dikunci 'Cross' (Lintas Unit). Bandingkan dengan
 * RequestAssessmentButton yang relasinya bebas diusulkan tapi harus di-ACC HRD.
 *
 * Pop-up (sebelumnya panel permanen) agar sejajar dengan tombol Ajukan Penilaian di
 * tab Pengajuan: dua aksi serupa berdampingan, bedanya terbaca dari label & catatannya.
 */
export function AdhocButton({ candidates }: { candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function close() { setOpen(false); setErr(null); }

  function add() {
    setErr(null);
    if (!targetId) { setErr('Pilih rekan yang ingin Anda nilai.'); return; }
    start(async () => {
      const res = await addAdhocTarget(targetId);
      // Sukses → tutup; rekannya langsung tampil di tab Penilaian (revalidatePath).
      if (res.ok) { setOpen(false); setTargetId(''); }
      else setErr(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink border border-line hover:border-brand px-4 py-2 rounded-control">
        <Plus className="w-3.5 h-3.5" /> Tambah Ad-Hoc (langsung)
      </button>

      <Modal open={open} title="Hak Penilaian Ad-Hoc Mandiri" busy={busy} onClose={close}>
        <p className="text-xs text-ink-soft">
          Anda berhak menilai <strong>rekan kerja lain</strong> yang tidak tercantum di daftar rutin.
          Berlaku <strong>langsung tanpa persetujuan HRD</strong>, dihitung sebagai relasi <strong>Lintas Unit</strong>.
        </p>
        <div>
          <label className="block text-[10px] uppercase font-extrabold text-brand-ink mb-1">Rekan yang Dinilai</label>
          <SearchableSelect
            value={targetId}
            onChange={setTargetId}
            disabled={busy || candidates.length === 0}
            options={candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.dept}` }))}
            placeholder={candidates.length ? '— Pilih Rekan Kerja untuk Dinilai —' : 'Semua rekan sudah ada di daftar Anda'}
            searchPlaceholder="Cari rekan…"
            className="text-xs px-3 py-2.5 bg-surface border border-line rounded-control font-medium"
          />
          <p className="text-[10px] text-ink-faint mt-1">
            Butuh relasi selain Lintas Unit (mis. Atasan/Bawahan)? Pakai <strong>Ajukan Penilaian</strong> —
            relasi menentukan bobot skor, jadi harus lewat HRD.
          </p>
        </div>
        {err && <p className="text-[11px] text-danger-ink font-semibold">{err}</p>}
        <ModalActions busy={busy} disabled={candidates.length === 0} confirmLabel="Tambahkan Rekan"
          busyLabel="Menambah…" onCancel={close} onConfirm={add} />
      </Modal>
    </>
  );
}
