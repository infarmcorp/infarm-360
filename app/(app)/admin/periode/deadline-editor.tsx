'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setAssessmentDeadline } from './actions';
import { toWibInput } from '@/lib/late';

/**
 * Editor inline DEADLINE penilaian 360° (WIB). Simpan saat blur bila berubah; kosongkan =
 * hapus deadline. Form tak ditutup otomatis — kiriman pertama sesudah deadline = Terlambat
 * (potongan −3 pada Skor 360° penilai, lib/late.ts).
 */
export function DeadlineEditor({ periodId, value }: { periodId: string; value: string | null }) {
  const router = useRouter();
  const initial = toWibInput(value);
  const [val, setVal] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (val === initial) { setErr(null); return; }
    setBusy(true); setErr(null);
    const res = await setAssessmentDeadline(periodId, val);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); setVal(initial); return; }
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className="inline-flex items-center gap-1">
        <input
          type="datetime-local"
          value={val}
          disabled={busy}
          aria-label="Deadline penilaian 360° (WIB)"
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="text-[12px] data-value px-1.5 py-1.5 border border-line rounded-control text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint disabled:opacity-50"
        />
        <span className="text-[10px] text-ink-faint">WIB</span>
      </div>
      {err && <span className="text-[10px] text-danger-ink max-w-[200px]">{err}</span>}
    </div>
  );
}
