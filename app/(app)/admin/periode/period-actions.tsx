'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activatePeriod, endPeriod, toggleHas360, activePeriodReadiness } from './actions';

export function PeriodActions({
  periodId, status, has360,
}: {
  periodId: string; status: 'active' | 'ended'; has360: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return; }
    router.refresh();
  }

  /** Aktivasi dengan palang pengaman: peringatkan bila periode aktif masih punya pekerjaan tertunda. */
  async function activateWithGuard() {
    setBusy(true); setErr(null);
    const r = await activePeriodReadiness();
    if (r.ok && r.active) {
      const a = r.active;
      const issues: string[] = [];
      if (a.pending360 > 0) issues.push(`${a.pending360} penilaian 360° belum lengkap`);
      if (a.drafts > 0) issues.push(`${a.drafts} draf penilaian belum dikirim`);
      if (a.unfinalized > 0) issues.push(`${a.unfinalized} laporan belum difinalisasi`);
      if (issues.length) {
        const ok = window.confirm(
          `Periode aktif "${a.label}" masih punya:\n• ${issues.join('\n• ')}\n\n` +
          `Mengaktifkan periode ini akan MENGUNCI "${a.label}" — penilaian/KPI-nya tak bisa diisi/edit lagi, ` +
          `dan draf yang tersisa ikut terkunci.\n\nLanjutkan aktivasi?`,
        );
        if (!ok) { setBusy(false); return; }
      }
    } else if (!r.ok) {
      setBusy(false); setErr(r.error); return;
    }
    const res = await activatePeriod(periodId);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-1.5 justify-end">
        {status === 'active' ? (
          <button type="button" disabled={busy} onClick={() => run(() => endPeriod(periodId))}
            className="text-[11px] font-bold px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50">
            Kunci &amp; Akhiri
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={activateWithGuard}
            className="text-[11px] font-bold px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            Aktivasi
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => run(() => toggleHas360(periodId, !has360))}
          className="text-[11px] font-bold px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {has360 ? 'Set Tanpa 360°' : 'Aktifkan 360°'}
        </button>
      </div>
      {err && <span className="text-[10px] text-rose-600 max-w-[150px] text-right" role="alert">{err}</span>}
    </div>
  );
}
