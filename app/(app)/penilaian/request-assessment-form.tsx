'use client';

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { requestNewAssessment } from './request-actions';
import { SearchableSelect } from '@/components/searchable-select';
import { Modal, ModalActions } from './modal';

type Candidate = { id: string; name: string; dept: string };

const REL_OPTS = ['Atasan', 'Peer', 'Cross', 'Bawahan'] as const;
const REL_LABEL: Record<string, string> = {
  Atasan: 'Atasan saya', Peer: 'Rekan sejawat (Peer)', Cross: 'Lintas Divisi', Bawahan: 'Bawahan saya',
};

// BR-04 (Q3 2026, keputusan HRD): pilihan alasan pengajuan lewat dropdown, bukan teks bebas.
// 'Lainnya' tetap butuh keterangan bebas agar tak menyempitkan kasus yang belum tercakup.
const REASON_OPTS = [
  'Sering bekerja sama dengan ratee selama periode ini',
  'Terlibat dalam project/tugas yang sama selama periode ini',
  'Sering berkoordinasi dalam pekerjaan selama periode ini',
  'Memiliki hubungan kerja lintas divisi selama periode ini',
  'Lainnya',
] as const;
const REASON_LAINNYA = 'Lainnya';

/**
 * "Ajukan Penilaian": pegawai mengusulkan menilai rekan yang belum ada di daftarnya, LENGKAP
 * dengan hubungan kerja yang menurutnya benar. Berbeda dari Ad-Hoc (instan, relasi dikunci
 * 'Cross'): usulan di sini menunggu persetujuan HRD — karena relasi menentukan BOBOT skor 360°,
 * jadi tak boleh ditetapkan sepihak.
 *
 * Bentuk pop-up (bukan panel permanen): pengajuan adalah aksi sesekali, sedangkan panel
 * berisi form penuh mendorong halaman turun dan menyaingi daftar penilaian sebagai fokus.
 */
export function RequestAssessmentButton({ candidates }: { candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [relation, setRelation] = useState<string>('Peer');
  const [reasonOpt, setReasonOpt] = useState<string>(REASON_OPTS[0]);
  const [reasonOther, setReasonOther] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function close() { setOpen(false); setErr(null); }
  const isOther = reasonOpt === REASON_LAINNYA;
  const finalReason = isOther ? reasonOther.trim() : reasonOpt;

  function submit() {
    setErr(null);
    if (!targetId) { setErr('Pilih rekan yang ingin Anda nilai.'); return; }
    if (isOther && reasonOther.trim().length < 5) { setErr('Isi keterangan alasan (minimal 5 karakter) untuk pilihan "Lainnya".'); return; }
    start(async () => {
      const res = await requestNewAssessment(targetId, relation, finalReason);
      // Sukses → tutup; konfirmasinya = baris baru "Menunggu" di panel Permohonan Saya
      // (disegarkan revalidatePath), jadi tak perlu toast terpisah.
      if (res.ok) { setOpen(false); setTargetId(''); setReasonOpt(REASON_OPTS[0]); setReasonOther(''); setRelation('Peer'); }
      else setErr(res.error);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand hover:bg-brand-ink px-4 py-2 rounded-control">
        <Send className="w-3.5 h-3.5" /> Ajukan Penilaian atas Rekan Lain
      </button>

      <Modal open={open} title="Ajukan Penilaian atas Rekan Lain" size="lg" busy={busy} onClose={close}>
        <p className="text-xs text-ink-soft">
          Merasa perlu menilai rekan yang belum ada di daftar? Ajukan di sini beserta hubungan kerjanya.
          <strong> Berlaku setelah disetujui HRD.</strong>
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] uppercase font-extrabold text-ink-faint mb-1">Rekan yang Dinilai</label>
            <SearchableSelect
              value={targetId}
              onChange={setTargetId}
              disabled={busy || candidates.length === 0}
              options={candidates.map((c) => ({ value: c.id, label: `${c.name} — ${c.dept}` }))}
              placeholder={candidates.length ? '— Pilih Rekan Kerja —' : 'Semua rekan sudah ada di daftar Anda'}
              searchPlaceholder="Cari rekan…"
              className="text-xs px-3 py-2 border border-line rounded-control bg-surface"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-extrabold text-ink-faint mb-1">Hubungan Kerja Anda dengan Rekan Itu</label>
            <select value={relation} onChange={(e) => setRelation(e.target.value)} disabled={busy}
              className="w-full text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink font-semibold focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
              {REL_OPTS.map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-extrabold text-brand-ink mb-1">Alasan Pengajuan</label>
          <select value={reasonOpt} onChange={(e) => setReasonOpt(e.target.value)} disabled={busy}
            className="w-full text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink font-semibold focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint">
            {REASON_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {isOther && (
            <>
              <textarea value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} disabled={busy} rows={3}
                placeholder="Jelaskan alasan Anda mengajukan penilaian ini."
                className="w-full text-xs p-2.5 mt-1.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
              <p className="text-[10px] text-ink-faint mt-1">Wajib diisi (minimal 5 karakter) untuk pilihan "Lainnya".</p>
            </>
          )}
          <p className="text-[10px] text-ink-faint mt-1">Alasan ini yang dibaca HRD saat memutuskan.</p>
        </div>

        {err && <p className="text-[11px] text-danger-ink font-semibold">{err}</p>}
        <ModalActions busy={busy} disabled={candidates.length === 0} confirmLabel="Kirim Permohonan"
          onCancel={close} onConfirm={submit} />
      </Modal>
    </>
  );
}
