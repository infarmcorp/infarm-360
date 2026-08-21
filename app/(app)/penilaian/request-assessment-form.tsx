'use client';

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { requestNewAssessment } from './request-actions';
import { SearchableSelect } from '@/components/searchable-select';

type Candidate = { id: string; name: string; dept: string };

const REL_OPTS = ['Atasan', 'Peer', 'Cross', 'Bawahan'] as const;
const REL_LABEL: Record<string, string> = {
  Atasan: 'Atasan saya', Peer: 'Rekan sejawat (Peer)', Cross: 'Lintas Divisi', Bawahan: 'Bawahan saya',
};

/**
 * "Ajukan Penilaian": pegawai mengusulkan menilai rekan yang belum ada di daftarnya, LENGKAP
 * dengan hubungan kerja yang menurutnya benar. Berbeda dari Ad-Hoc (instan, relasi dikunci
 * 'Cross'): usulan di sini menunggu persetujuan HRD — karena relasi menentukan BOBOT skor 360°,
 * jadi tak boleh ditetapkan sepihak.
 */
export function RequestAssessmentForm({ candidates }: { candidates: Candidate[] }) {
  const [targetId, setTargetId] = useState('');
  const [relation, setRelation] = useState<string>('Peer');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  function submit() {
    setMsg(null);
    if (!targetId) { setMsg({ ok: false, text: 'Pilih rekan yang ingin Anda nilai.' }); return; }
    start(async () => {
      const res = await requestNewAssessment(targetId, relation, reason);
      if (res.ok) {
        setMsg({ ok: true, text: 'Permohonan terkirim — menunggu keputusan HRD.' });
        setTargetId(''); setReason('');
      } else setMsg({ ok: false, text: res.error });
    });
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-4 space-y-3">
      <div>
        <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Ajukan Penilaian atas Rekan Lain</h3>
        <p className="text-[11px] text-ink-soft mt-0.5">
          Merasa perlu menilai rekan yang belum ada di daftar? Ajukan di sini beserta hubungan kerjanya.
          <strong> Berlaku setelah disetujui HRD.</strong>
        </p>
      </div>

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
        <label className="block text-[10px] uppercase font-extrabold text-ink-faint mb-1">Alasan Pengajuan</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} rows={2}
          placeholder="Mis. 'Kami satu tim proyek selama kuartal ini, sehingga saya punya dasar menilai kinerjanya.'"
          className="w-full text-xs p-2.5 border border-line rounded-control focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
        <p className="text-[10px] text-ink-faint mt-1">Minimal 5 karakter. Alasan ini yang dibaca HRD saat memutuskan.</p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={busy || candidates.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand hover:bg-brand-ink px-4 py-2 rounded-control disabled:opacity-60">
          <Send className="w-3.5 h-3.5" /> {busy ? 'Mengirim…' : 'Kirim Permohonan'}
        </button>
        {msg && <span className={`text-[11px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
