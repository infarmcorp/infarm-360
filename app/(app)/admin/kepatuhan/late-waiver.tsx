'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setLateWaiver } from './actions';
import { LATE_PENALTY_360 } from '@/lib/late';

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

  if (auto === 0 && override == null) return <span className="text-[11px] text-ink-faint">—</span>;

  // Asal potongan: Wajib / Ajuan — agar HRD tahu bila potongan muncul karena AJUAN (opsional) yang
  // diajukan pegawai sendiri tapi tak dituntaskan.
  const source = [lateWajib > 0 ? `${lateWajib} wajib` : null, lateAjuan > 0 ? `${lateAjuan} ajuan` : null].filter(Boolean).join(' · ');
  const ptsNum = Number(pts.replace(',', '.'));
  const ptsValid = pts.trim() !== '' && Number.isFinite(ptsNum) && ptsNum >= 0 && ptsNum <= 100;

  return (
    <div className="flex flex-col items-center gap-1">
      {override === 0 ? (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-control border bg-neutral-tint text-ink-soft border-line"
          title={reason ?? ''}>Dikecualikan</span>
      ) : (
        <span className="text-sm font-bold data-value text-danger-ink">−{penalty}</span>
      )}
      {override != null && override > 0 && (
        <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-control bg-warn-tint text-warn-ink"
          title={`Otomatis −${auto}. Alasan: ${reason ?? '—'}`}>diubah HRD</span>
      )}
      {source && (
        <span className={`text-[9.5px] ${lateAjuan > 0 && lateWajib === 0 ? 'text-warn-ink font-semibold' : 'text-ink-faint'}`}
          title={lateAjuan > 0 ? 'Ajuan = penilaian Opsional yang diajukan pegawai sendiri & disetujui HRD, tapi belum selesai saat deadline.' : undefined}>
          {source}
        </span>
      )}
      {!readOnly && !open && (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => { setPts(String(override ?? auto)); setOpen(true); }}
            className="text-[10.5px] text-ink-faint hover:text-ink-soft hover:underline">Ubah</button>
          {override != null && (
            <button type="button" disabled={busy} onClick={() => submit(null)}
              className="text-[10.5px] text-ink-faint hover:text-ink-soft hover:underline disabled:opacity-50">
              {busy ? '…' : 'Kembalikan otomatis'}
            </button>
          )}
        </span>
      )}
      {open && (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-ink-soft">−</span>
            <input value={pts} onChange={(e) => setPts(e.target.value)} inputMode="decimal"
              className="w-12 text-[11px] text-center data-value px-1 py-1 border border-line rounded-control text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Alasan (mis. cuti sakit)"
              maxLength={300} autoFocus
              className="w-40 text-[11px] px-2 py-1 border border-line rounded-control text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint" />
          </div>
          <div className="flex items-center gap-1">
            <button type="button" disabled={busy || !ptsValid || why.trim().length < 3}
              onClick={() => submit({ reason: why, points: ptsNum })}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
              {busy ? '…' : 'Simpan'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setErr(null); }}
              className="text-[11px] text-ink-faint hover:text-ink-soft">Batal</button>
          </div>
          <span className="text-[9.5px] text-ink-faint">0 = dikecualikan · otomatis −{LATE_PENALTY_360}</span>
        </div>
      )}
      {err && <span className="text-[10px] text-danger-ink max-w-[200px] text-center">{err}</span>}
    </div>
  );
}
