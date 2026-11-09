'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, MessageSquare, Undo2 } from 'lucide-react';
import { Button } from '@/components/button';
import { CARD, CardTitle, FIELD } from '@/components/infarm-ui';
import { callAction } from '@/lib/call-action';
import { SUP_MIN, supervisorApproveBlocker } from '@/lib/dev-plan';
import { decideAsSupervisor } from './actions';

type Comments = { confirmation: string; context: string; support: string; hope: string };
const FIELDS: { key: keyof Comments; label: string; hint: string; required: boolean }[] = [
  { key: 'confirmation', label: 'Konfirmasi Kinerja', hint: 'Apakah hasil penilaian ini mencerminkan kinerja yang Anda amati sehari-hari?', required: true },
  { key: 'context', label: 'Konteks Tambahan', hint: 'Adakah konteks situasional atau hal lain yang perlu diketahui pegawai?', required: false },
  { key: 'support', label: 'Dukungan yang Diberikan', hint: 'Apa bentuk dukungan konkret yang akan Anda berikan untuk pengembangan pegawai?', required: true },
  { key: 'hope', label: 'Harapan ke Depan', hint: 'Pesan atau harapan Anda untuk pegawai di kuartal ini.', required: false },
];

/**
 * Komentar Atasan Langsung (PDF bagian 7) + keputusan. Setujui = persetujuan atasan (Konfirmasi Kinerja & Dukungan
 * wajib); Minta Perbaikan = rencana kembali ke pegawai dengan alasan (persetujuan pegawai batal).
 */
export function SupervisorForm({ planId, initial }: { planId: string; initial: Comments }) {
  const router = useRouter();
  const [c, setC] = useState<Comments>(initial);
  const [reason, setReason] = useState('');
  const [revising, setRevising] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function decide(decision: 'approve' | 'revise') {
    setErr(null);
    if (decision === 'approve') {
      const b = supervisorApproveBlocker(c);
      if (b) { setErr(b); return; }
    } else if (reason.trim().length < SUP_MIN) {
      setErr(`Tulis alasan perbaikan (minimal ${SUP_MIN} karakter).`); return;
    }
    start(async () => {
      const r = await callAction(() => decideAsSupervisor(planId, decision, c, reason));
      if (!r.ok) { setErr(r.error); return; }
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} space-y-3`}>
      <CardTitle icon={MessageSquare}>Komentar Atasan Langsung</CardTitle>
      <p className="text-xs text-ink-soft">Diisi setelah sesi empat mata dengan pegawai. Bertanda * wajib sebelum Setujui.</p>
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="text-[13px] font-semibold text-ink">{f.label}{f.required && <span className="text-danger-ink"> *</span>}</span>
          <span className="block text-xs text-ink-soft">{f.hint}</span>
          <textarea value={c[f.key]} onChange={(e) => setC((x) => ({ ...x, [f.key]: e.target.value }))} disabled={busy} rows={3}
            className={`${FIELD} mt-1.5 w-full py-2 resize-y`} />
        </label>
      ))}
      {revising && (
        <label className="block">
          <span className="text-[13px] font-semibold text-danger-ink">Alasan perbaikan *</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={2}
            placeholder="Bagian mana yang perlu diperbaiki pegawai?"
            className={`${FIELD} mt-1.5 w-full py-2 resize-y`} />
        </label>
      )}
      {err && <p className="text-xs text-danger-ink font-semibold">{err}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {revising ? (
          <>
            <Button variant="ghost" className="min-h-9" disabled={busy} onClick={() => { setRevising(false); setErr(null); }}>Batal</Button>
            <Button variant="danger" className="min-h-9" disabled={busy} onClick={() => decide('revise')}><Undo2 className="w-4 h-4" /> Kirim Permintaan Perbaikan</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="min-h-9" disabled={busy} onClick={() => setRevising(true)}><Undo2 className="w-4 h-4" /> Minta Perbaikan</Button>
            <Button className="min-h-9" disabled={busy} onClick={() => decide('approve')}><Check className="w-4 h-4" /> Setujui</Button>
          </>
        )}
      </div>
    </section>
  );
}
