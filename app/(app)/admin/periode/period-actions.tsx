'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activatePeriod, endPeriod, toggleHas360, toggleFormOpen, activePeriodReadiness, count360Submitted, periodDataCounts, deletePeriod } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';

type DelState = {
  label: string;
  counts: { assessments: number; mappings: number; finalReports: number; kpi: number };
};

type Dialog = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone: 'danger' | 'primary';
  onConfirm: () => Promise<void>;
};

export function PeriodActions({
  periodId, status, has360, formOpen,
}: {
  periodId: string; status: 'active' | 'ended'; has360: boolean; formOpen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [del, setDel] = useState<DelState | null>(null);
  const [delText, setDelText] = useState('');

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

  /**
   * Toggle 360°. Menyalakan (Aktifkan 360°) langsung. Mematikan (Set Tanpa 360°):
   * bila SUDAH ada penilaian terkirim → konfirmasi (mengubah rumus + menyembunyikan form).
   * Saat setup awal (belum ada data) → langsung, tanpa nag.
   */
  async function toggle360Guard() {
    if (!has360) { await run(() => toggleHas360(periodId, true)); return; }
    setBusy(true); setErr(null);
    const r = await count360Submitted(periodId);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (r.count > 0) {
      setDialog({
        title: 'Matikan komponen 360°?',
        tone: 'danger',
        confirmLabel: 'Ya, matikan 360°',
        body: (
          <>
            <p>Sudah ada <strong>{r.count} penilaian 360° terkirim</strong> di periode ini.</p>
            <p>Mematikan 360° akan <strong>menyembunyikan form penilaian</strong> dari pegawai &amp;
              mengubah <strong>Skor Akhir menjadi 100% KPI</strong> (komponen 360° tak dihitung &amp;
              klasifikasi talenta berubah). Lanjut?</p>
          </>
        ),
        onConfirm: () => fromDialog(() => toggleHas360(periodId, false)),
      });
      return;
    }
    await run(() => toggleHas360(periodId, false));
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

  /** Hapus periode: ambil rekap isi dulu → buka dialog konfirmasi (wajib ketik HAPUS). */
  async function askDelete() {
    setBusy(true); setErr(null);
    const r = await periodDataCounts(periodId);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setDelText('');
    setDel({ label: r.label, counts: r.counts });
  }

  async function doDelete() {
    setBusy(true); setErr(null);
    const res = await deletePeriod(periodId, delText);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? 'Gagal'); return; }
    setDel(null);
    router.refresh();
  }

  const delEmpty = del && del.counts.assessments === 0 && del.counts.mappings === 0
    && del.counts.finalReports === 0 && del.counts.kpi === 0;

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
        <button type="button" disabled={busy} onClick={toggle360Guard}
          title={has360
            ? 'Menutup komponen 360°: form penilaian disembunyikan dari pegawai & skor 360° tak dihitung.'
            : 'Membuka komponen 360°: form penilaian tampil ke pegawai yang punya pemetaan & skor 360° dihitung.'}
          className="text-[11px] font-bold px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {has360 ? 'Set Tanpa 360°' : 'Aktifkan 360°'}
        </button>
        {status === 'active' && has360 && (
          <button type="button" disabled={busy} onClick={() => run(() => toggleFormOpen(periodId, !formOpen))}
            title={formOpen
              ? 'Menutup form: pegawai berhenti mengisi (tahap review). 360° TETAP dihitung & Hitung Ulang tetap tersedia.'
              : 'Membuka kembali form agar pegawai bisa melanjutkan pengisian 360°.'}
            className="text-[11px] font-bold px-2 py-1 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
            {formOpen ? 'Tutup Form' : 'Buka Form'}
          </button>
        )}
        <button type="button" disabled={busy || status === 'active'} onClick={askDelete}
          title={status === 'active'
            ? 'Periode aktif tidak bisa dihapus — "Kunci & Akhiri" dulu.'
            : 'Hapus periode ini beserta seluruh datanya (permanen).'}
          className="text-[11px] font-bold px-2 py-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed">
          Hapus
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

      <ConfirmDialog
        open={!!del}
        icon="🗑️"
        title={`Hapus periode "${del?.label ?? ''}"?`}
        confirmLabel="Hapus Permanen"
        tone="danger"
        busy={busy}
        confirmDisabled={delText.trim().toUpperCase() !== 'HAPUS'}
        onConfirm={doDelete}
        onCancel={() => { if (!busy) { setDel(null); setErr(null); } }}
      >
        {delEmpty ? (
          <p>Periode ini <strong>tidak memiliki data</strong> (tanpa penilaian, KPI, laporan, atau pemetaan).</p>
        ) : (
          <>
            <p>Periode ini berisi data berikut yang akan <strong>ikut terhapus permanen</strong>:</p>
            <ul className="list-disc pl-5">
              {del && del.counts.assessments > 0 && <li>{del.counts.assessments} penilaian 360° (+ jawaban rating &amp; esai)</li>}
              {del && del.counts.kpi > 0 && <li>{del.counts.kpi} skor KPI (bulan khusus periode ini)</li>}
              {del && del.counts.finalReports > 0 && <li>{del.counts.finalReports} laporan final</li>}
              {del && del.counts.mappings > 0 && <li>{del.counts.mappings} pemetaan penilai→target</li>}
            </ul>
            <p>Juga aspek, indikator/pertanyaan, bobot, koreksi relasi, hasil 360°, dan punishment periode ini.</p>
          </>
        )}
        <p className="font-semibold text-rose-700">Tindakan ini tidak bisa dibatalkan.</p>
        <label className="block">
          <span className="text-[12px] text-gray-600">Ketik <strong>HAPUS</strong> untuk mengonfirmasi:</span>
          <input
            type="text" value={delText} onChange={(e) => setDelText(e.target.value)}
            autoFocus disabled={busy} placeholder="HAPUS"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
