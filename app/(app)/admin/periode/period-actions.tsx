'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activatePeriod, endPeriod, toggleHas360, activePeriodReadiness } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Dialog = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone: 'danger' | 'primary';
  onConfirm: () => Promise<void>;
};

export function PeriodActions({
  periodId, status, has360,
}: {
  periodId: string; status: 'active' | 'ended'; has360: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return; }
    router.refresh();
  }

  /** Daftar pekerjaan tertunda periode aktif (untuk pesan dialog). */
  function issuesOf(a: { pending360: number; drafts: number; unfinalized: number } | null): string[] {
    const out: string[] = [];
    if (!a) return out;
    if (a.unfinalized > 0) out.push(`${a.unfinalized} laporan belum difinalisasi`);
    if (a.pending360 > 0) out.push(`${a.pending360} penilaian 360° belum lengkap`);
    if (a.drafts > 0) out.push(`${a.drafts} draf penilaian belum dikirim`);
    return out;
  }

  /** Jalankan aksi dari dalam dialog (jaga busy + tutup + refresh). */
  async function fromDialog(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    setDialog(null);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return; }
    router.refresh();
  }

  /** Aktivasi: bila periode aktif masih punya pekerjaan tertunda → konfirmasi dulu. */
  async function activateWithGuard() {
    setBusy(true); setErr(null);
    const r = await activePeriodReadiness();
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const issues = issuesOf(r.ok ? r.active : null);
    if (issues.length && r.ok && r.active) {
      const label = r.active.label;
      setDialog({
        title: 'Aktifkan periode ini?',
        tone: 'danger',
        confirmLabel: 'Ya, aktifkan',
        body: (
          <>
            <p>Periode aktif <strong>“{label}”</strong> masih punya:</p>
            <ul className="list-disc pl-5">{issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
            <p>Mengaktifkan periode ini akan <strong>MENGUNCI “{label}”</strong> — penilaian/KPI-nya
              tak bisa diisi/edit lagi, dan draf yang tersisa ikut terkunci.</p>
          </>
        ),
        onConfirm: () => fromDialog(() => activatePeriod(periodId)),
      });
      return;
    }
    await run(() => activatePeriod(periodId));
  }

  /** Kunci & Akhiri: selalu konfirmasi; peringatkan bila masih ada yang belum final. */
  async function endWithGuard() {
    setBusy(true); setErr(null);
    const r = await activePeriodReadiness();
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const issues = issuesOf(r.ok ? r.active : null);
    setDialog({
      title: 'Kunci & Akhiri Periode?',
      tone: 'danger',
      confirmLabel: 'Kunci & Akhiri',
      body: (
        <>
          {issues.length > 0 && (
            <>
              <p>Periode ini masih punya:</p>
              <ul className="list-disc pl-5">{issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
          <p>Mengunci & mengakhiri akan <strong>menutup periode</strong>: penilaian/KPI tak bisa
            diisi/edit lagi, dan Anda <strong>tidak bisa memfinalisasi</strong> laporan tanpa
            mengaktifkan ulang periode.</p>
          {issues.length > 0 && <p className="font-semibold text-rose-700">Sebaiknya finalisasi dulu yang tersisa.</p>}
        </>
      ),
      onConfirm: () => fromDialog(() => endPeriod(periodId)),
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-1.5 justify-end">
        {status === 'active' ? (
          <button type="button" disabled={busy} onClick={endWithGuard}
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
          title={has360
            ? 'Menutup komponen 360°: form penilaian disembunyikan dari pegawai & skor 360° tak dihitung.'
            : 'Membuka komponen 360°: form penilaian tampil ke pegawai yang punya pemetaan & skor 360° dihitung.'}
          className="text-[11px] font-bold px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {has360 ? 'Set Tanpa 360°' : 'Aktifkan 360°'}
        </button>
      </div>
      {err && <span className="text-[10px] text-rose-600 max-w-[150px] text-right">{err}</span>}

      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title ?? ''}
        confirmLabel={dialog?.confirmLabel}
        tone={dialog?.tone}
        busy={busy}
        onConfirm={() => dialog?.onConfirm()}
        onCancel={() => { if (!busy) setDialog(null); }}
      >
        {dialog?.body}
      </ConfirmDialog>
    </div>
  );
}
