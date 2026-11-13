'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activatePeriod, endPeriod, toggleHas360, toggleFormOpen, toggleMappingPublished, activePeriodReadiness, count360Submitted, periodDataCounts, deletePeriod } from './actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/button';
import { OverflowMenu, type OverflowItem } from '@/components/overflow-menu';
import { FIELD } from '@/components/infarm-ui';

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
  periodId, status, has360, formOpen, mappingPublished,
}: {
  periodId: string; status: 'active' | 'ended'; has360: boolean; formOpen: boolean;
  /** Pemetaan sudah diumumkan ke pegawai untuk ditinjau (fase sebelum form dibuka). */
  mappingPublished: boolean;
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
            <p>Mengaktifkan periode ini akan <strong>MENGUNCI “{label}”</strong>: penilaian, KPI, dan draf yang tersisa tidak bisa diubah lagi.</p>
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
            <p>Mematikan 360° menyembunyikan formulir penilaian dan mengubah <strong>Skor Akhir menjadi 100% KPI</strong>. Klasifikasi talenta ikut berubah. Lanjutkan?</p>
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
          <p>Periode akan ditutup: penilaian dan KPI tidak bisa diubah, dan laporan tidak bisa difinalisasi tanpa mengaktifkan ulang periode.</p>
          {issues.length > 0 && <p className="font-semibold text-danger-ink">Sebaiknya finalisasi dulu laporan yang tersisa.</p>}
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

  // Satu primary action per state; sisanya (toggle 360°, form, hapus) ke menu ⋯.
  const menuItems: OverflowItem[] = [
    {
      label: has360 ? 'Atur Tanpa 360°' : 'Aktifkan 360°',
      onSelect: toggle360Guard,
      disabled: busy,
      title: has360
        ? 'Menutup komponen 360°: formulir penilaian disembunyikan dari pegawai & skor 360° tak dihitung.'
        : 'Membuka 360°: formulir penilaian tampil ke pegawai yang punya pemetaan, dan skor 360° dihitung.',
    },
    // Fase tinjau pemetaan — hanya relevan selagi periode aktif & 360° menyala.
    ...(status === 'active' && has360 ? [{
      label: mappingPublished ? 'Tarik Pengumuman Pemetaan' : 'Umumkan Pemetaan',
      onSelect: () => run(() => toggleMappingPublished(periodId, !mappingPublished)),
      disabled: busy,
      title: mappingPublished
        ? 'Menyembunyikan kembali daftar pemetaan dari pegawai (pengajuan hapus/tambah ikut ditutup).'
        : 'Tampilkan daftar "siapa menilai siapa" ke pegawai. Mereka bisa mengajukan penghapusan atau penambahan sebelum formulir dibuka.',
    } as OverflowItem] : []),
    ...(status === 'active' && has360 ? [{
      label: formOpen ? 'Tutup Formulir' : 'Buka Formulir',
      onSelect: () => run(() => toggleFormOpen(periodId, !formOpen)),
      disabled: busy,
      title: formOpen
        ? 'Menutup formulir: pegawai berhenti mengisi. Skor 360° TETAP dihitung dan Hitung Ulang tetap tersedia.'
        : 'Membuka kembali formulir agar pegawai bisa melanjutkan pengisian 360°.',
    } as OverflowItem] : []),
    {
      label: 'Hapus periode',
      onSelect: askDelete,
      tone: 'danger',
      disabled: busy || status === 'active',
      title: status === 'active'
        ? 'Periode aktif tidak bisa dihapus — jalankan "Kunci & Akhiri" terlebih dahulu.'
        : 'Hapus periode ini beserta seluruh datanya (permanen).',
    },
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        {status === 'active' ? (
          <Button variant="ghost" disabled={busy} onClick={endWithGuard}>Kunci &amp; Akhiri</Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={activateWithGuard}>Aktifkan</Button>
        )}
        <OverflowMenu items={menuItems} />
      </div>
      {err && <span className="text-[12px] text-danger-ink max-w-[180px] text-right">{err}</span>}

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
              {del && del.counts.assessments > 0 && <li>{del.counts.assessments} penilaian 360° (+ jawaban nilai &amp; esai)</li>}
              {del && del.counts.kpi > 0 && <li>{del.counts.kpi} skor KPI (bulan khusus periode ini)</li>}
              {del && del.counts.finalReports > 0 && <li>{del.counts.finalReports} laporan final</li>}
              {del && del.counts.mappings > 0 && <li>{del.counts.mappings} pemetaan penilai→target</li>}
            </ul>
            <p>Juga aspek, indikator/pertanyaan, bobot, koreksi relasi, dan hasil 360° periode ini.</p>
          </>
        )}
        <p className="font-semibold text-danger-ink">Tindakan ini tidak bisa dibatalkan.</p>
        <label className="block">
          <span className="text-[12px] text-ink-soft">Ketik <strong>HAPUS</strong> untuk mengonfirmasi:</span>
          <input
            type="text" value={delText} onChange={(e) => setDelText(e.target.value)}
            autoFocus disabled={busy} placeholder="HAPUS"
            className={`${FIELD} mt-1 w-full`}
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
