'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setLateWaiver } from './actions';
import { LATE_PENALTY_360 } from '@/lib/late';

/** Isian ringkas di sel tabel (setinggi kontrol standar 36px; padding diatur per isian). */
const INPUT = 'text-[13px] min-h-9 border border-line rounded-control bg-infarm-surface text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint';

/**
 * Potongan keterlambatan menilai per pegawai (Skor 360°): OTOMATIS −3 bila ada kewajiban yang belum
 * selesai saat deadline — Wajib maupun AJUAN (Opsional hasil permohonan yang disetujui HRD). HRD bisa
 * MENGUBAH nilainya (alasan wajib; 0 = dikecualikan) atau mengembalikannya ke otomatis.
 * Tampil hanya bila ada potongan otomatis atau penetapan HRD.
 */
export function LateWaiver({
  employeeId, penalty, auto, override, reason, lateWajib, lateAjuan, readOnly,
}: {
  employeeId: string;
  penalty: number;            // yang berlaku
  auto: number;               // otomatis (tanpa campur tangan HRD)
  override: number | null;    // ditetapkan HRD (null = otomatis)
  reason: string | null;
  lateWajib: number;          // jumlah kewajiban WAJIB yang terlambat
  lateAjuan: number;          // jumlah AJUAN yang terlambat
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pts, setPts] = useState(String(override ?? auto ?? LATE_PENALTY_360));
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(value: { reason: string; points: number } | null) {
    setBusy(true); setErr(null);
    const res = await setLateWaiver(value ? { employeeId, ...value } : { employeeId, reason: null });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setOpen(false); setWhy('');
    router.refresh();
  }

  if (auto === 0 && override == null) return <span className="text-[13px] text-ink-soft">—</span>;

  // Asal potongan: Wajib / Ajuan — agar HRD tahu bila potongan muncul karena AJUAN (opsional) yang
  // diajukan pegawai sendiri tapi tak dituntaskan.
  const source = [lateWajib > 0 ? `${lateWajib} wajib` : null, lateAjuan > 0 ? `${lateAjuan} ajuan` : null].filter(Boolean).join(' · ');
  const ptsNum = Number(pts.replace(',', '.'));
  const ptsValid = pts.trim() !== '' && Number.isFinite(ptsNum) && ptsNum >= 0 && ptsNum <= 100;

  return (
    <div className="flex flex-col items-center gap-1">
      {override === 0 ? (
        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-neutral-tint text-ink-soft"
          title={reason ?? ''}>Dikecualikan</span>
      ) : (
        <span className="text-[13px] font-bold font-mono text-danger-ink">−{penalty}</span>
      )}
      {override != null && override > 0 && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warn-tint text-warn-ink"
          title={`Otomatis −${auto}. Alasan: ${reason ?? '—'}`}>diubah HRD</span>
      )}
      {source && (
        <span className={`text-[11px] font-mono ${lateAjuan > 0 && lateWajib === 0 ? 'text-warn-ink font-semibold' : 'text-ink-soft'}`}
          title={lateAjuan > 0 ? 'Ajuan = penilaian opsional yang diajukan pegawai dan disetujui HRD, tetapi belum selesai saat tenggat.' : undefined}>
          {source}
        </span>
      )}
      {!readOnly && !open && (
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => { setPts(String(override ?? auto)); setOpen(true); }}
            className="text-xs font-semibold text-ink-soft hover:text-brand-ink hover:underline">Ubah</button>
          {override != null && (
            <button type="button" disabled={busy} onClick={() => submit(null)}
              className="text-xs font-semibold text-ink-soft hover:text-brand-ink hover:underline disabled:opacity-50">
              {busy ? '…' : 'Kembalikan otomatis'}
            </button>
          )}
        </span>
      )}
      {open && (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-ink-soft">−</span>
            <input value={pts} onChange={(e) => setPts(e.target.value)} inputMode="decimal"
              className={`${INPUT} w-14 px-1 text-center font-mono`} />
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Alasan (mis. cuti sakit)"
              maxLength={300} autoFocus
              className={`${INPUT} w-44 px-2.5`} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || !ptsValid || why.trim().length < 3}
              onClick={() => submit({ reason: why, points: ptsNum })}
              className="text-[13px] font-bold min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
              {busy ? '…' : 'Simpan'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setErr(null); }}
              className="text-[13px] font-semibold min-h-9 px-3 rounded-xl text-ink-soft hover:text-ink">Batal</button>
          </div>
          <span className="text-[11px] text-ink-soft">0 = dikecualikan · otomatis <span className="font-mono text-danger-ink">−{LATE_PENALTY_360}</span></span>
        </div>
      )}
      {err && <span className="text-xs text-danger-ink max-w-[200px] text-center">{err}</span>}
    </div>
  );
}
