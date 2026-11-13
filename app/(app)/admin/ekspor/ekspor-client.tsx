'use client';

import { useState } from 'react';
import { Download, Users, Settings, BarChart3, MessageSquareText, ScrollText, FileText, Sprout, type LucideIcon } from 'lucide-react';
import { CARD, CardTitle, Note, FIELD } from '@/components/infarm-ui';
import {
  exportEmployees, exportKpi, exportKpiAudit, exportRekap, exportLatePenalties,
  exportAssessments, exportQualAnswers, exportMappings, exportAspectSummaries,
  exportSummary360, exportAspectScores, exportPeriodConfig, exportHrdAuditLog, exportReportMaterials, exportDevPlans,
  type ExportResult, type Sheet,
} from './actions';

type PeriodOpt = { id: string; label: string; active: boolean };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'periode';

/**
 * Ekspor Dataset (HRD) — DIKONSOLIDASI jadi 4 file multi-sheet (bukan 11 tombol) agar tak ada
 * unduhan ganda untuk data yang berkaitan. Tiap fungsi `exportX` di actions.ts tetap dipakai;
 * di sini hanya dirangkai jadi beberapa lembar dalam satu workbook (perakitan di sisi klien).
 *  1. Pegawai (Master)            — 1 lembar, lintas periode.
 *  2. Konfigurasi Periode Lengkap — Ringkasan/Bobot/Bulan KPI/Aspek & Indikator/Esai + Pemetaan.
 *  3. Kinerja Lengkap per Periode — Rekap/KPI Bulanan/Audit KPI/Potongan Keterlambatan.
 *  4. Penilaian 360° Lengkap      — Kuantitatif/Kualitatif/Ringkasan Naratif HRD (anonim penilai).
 *  5. Bahan Laporan per Pegawai   — Skor/Komentar Aspek/Komentar Esai/Laporan Pelanggaran, untuk diringkas jadi laporan.
 */
export function EksporClient({ periods }: { periods: PeriodOpt[] }) {
  const [periodId, setPeriodId] = useState<string>(''); // '' = semua periode
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  const selected = periods.find((p) => p.id === periodId) ?? null;
  const suffix = selected ? slug(selected.label) : 'semua-periode';
  const pid = () => periodId || null;

  // ExportResult → rows (lempar error bila gagal, ditangkap di run()).
  const rowsOf = (res: ExportResult): Sheet['rows'] => {
    if (!res.ok) throw new Error(res.error);
    return res.rows;
  };

  async function writeWorkbook(sheets: Sheet[], filename: string) {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
      const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ keterangan: 'Belum ada data' }]);
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    }
    XLSX.writeFile(wb, filename);
  }

  /** Bangun & unduh satu workbook multi-sheet; tampilkan pesan sukses/gagal. */
  async function run(key: string, build: () => Promise<{ sheets: Sheet[]; filename: string }>) {
    setBusy(key); setMsg(null);
    try {
      const { sheets, filename } = await build();
      const total = sheets.reduce((a, s) => a + s.rows.length, 0);
      if (total === 0) { setMsg({ key, ok: false, text: 'Belum ada data yang dapat diekspor.' }); return; }
      await writeWorkbook(sheets, filename);
      setMsg({ key, ok: true, text: `${total} baris diunduh (${sheets.length} lembar).` });
    } catch (e) {
      setMsg({ key, ok: false, text: e instanceof Error ? e.message : 'Gagal menyiapkan berkas.' });
    } finally { setBusy(null); }
  }

  type Card = { key: string; title: string; desc: React.ReactNode; icon: LucideIcon; scoped: boolean; go: () => Promise<void> };

  const cards: Card[] = [
    {
      key: 'pegawai', title: 'Pegawai (Master)', icon: Users, scoped: false,
      desc: 'Direktori pegawai: kode, nama, divisi, peran, status, atasan, email. Lintas periode (mengabaikan filter).',
      go: () => run('pegawai', async () => {
        const emp = rowsOf(await exportEmployees());
        return { sheets: [{ name: 'Pegawai', rows: emp }], filename: 'pegawai-master.xlsx' };
      }),
    },
    {
      key: 'config', title: 'Konfigurasi Periode Lengkap', icon: Settings, scoped: true,
      desc: <>Seluruh pengaturan HRD per kuartal — <strong>6 lembar</strong>: Ringkasan · Bobot Penilai · Bulan KPI · Aspek &amp; Indikator · Pertanyaan Esai · <strong>Pemetaan 360°</strong>.</>,
      go: () => run('config', async () => {
        const cfg = await exportPeriodConfig(pid());
        if (!cfg.ok) throw new Error(cfg.error);
        const map = rowsOf(await exportMappings(pid()));
        return { sheets: [...cfg.sheets, { name: 'Pemetaan', rows: map }], filename: `konfigurasi-periode-${suffix}.xlsx` };
      }),
    },
    {
      key: 'kinerja', title: 'Kinerja Lengkap per Periode', icon: BarChart3, scoped: true,
      desc: <><strong>4 lembar</strong>: Rekap (KPI rerata · Skor 360° · potongan telat · Skor Akhir · kategori · 4-Box) · KPI Bulanan · Audit KPI · <strong>Potongan Keterlambatan</strong> (siapa yang Skor 360°-nya dipotong & keputusan HRD).</>,
      go: () => run('kinerja', async () => {
        const [rekap, kpi, audit, late] = await Promise.all([exportRekap(pid()), exportKpi(pid()), exportKpiAudit(pid()), exportLatePenalties(pid())]);
        const sheets: Sheet[] = [
          { name: 'Rekap', rows: rowsOf(rekap) },
          { name: 'KPI Bulanan', rows: rowsOf(kpi) },
          { name: 'Audit KPI', rows: rowsOf(audit) },
          { name: 'Potongan Keterlambatan', rows: rowsOf(late) },
        ];
        return { sheets, filename: `kinerja-lengkap-${suffix}.xlsx` };
      }),
    },
    {
      key: 'f360', title: 'Penilaian 360° Lengkap', icon: MessageSquareText, scoped: true,
      desc: <><strong>5 lembar</strong> (semua <strong>anonim penilai</strong>): <strong>Ringkasan per Pegawai</strong> (jml penilai per kelas · Nilai Atasan/Internal/Self · Nilai 360° · Gap · Skala 100 · <strong>Skor 360° resmi</strong> &amp; selisihnya — selisih ≠ 0 berarti ada penilaian berubah sejak Hitung Ulang terakhir) · <strong>Rekap Aspek</strong> (Skor 360° terbobot &amp; Nilai Diri per aspek budaya) · Kuantitatif (rating per indikator) · Kualitatif (esai) · Ringkasan Naratif HRD.</>,
      go: () => run('f360', async () => {
        const [ringkas, aspek, quant, qual, naratif] = await Promise.all([exportSummary360(pid()), exportAspectScores(pid()), exportAssessments(pid()), exportQualAnswers(pid()), exportAspectSummaries(pid())]);
        const sheets: Sheet[] = [
          { name: 'Ringkasan per Pegawai', rows: rowsOf(ringkas) },
          { name: 'Rekap Aspek', rows: rowsOf(aspek) },
          { name: 'Kuantitatif', rows: rowsOf(quant) },
          { name: 'Kualitatif', rows: rowsOf(qual) },
          { name: 'Ringkasan Naratif', rows: rowsOf(naratif) },
        ];
        return { sheets, filename: `penilaian-360-lengkap-${suffix}.xlsx` };
      }),
    },
    {
      key: 'bahan', title: 'Bahan Laporan per Pegawai', icon: FileText, scoped: true,
      desc: <>Untuk diringkas menjadi laporan per pegawai — <strong>4 lembar</strong> (anonim penilai, tanpa Self): <strong>Skor</strong> (Skor Akhir · KPI · 360° · potongan telat · skor tiap aspek budaya + kategori) · <strong>Komentar Aspek</strong> (rating &amp; komentar per indikator) · <strong>Komentar Esai</strong> · <strong>Laporan Pelanggaran</strong> (tanggal kejadian, kategori, laporan, catatan — tanpa pelapor). Disertai divisi &amp; rentang periode.</>,
      go: () => run('bahan', async () => {
        const res = await exportReportMaterials(pid());
        if (!res.ok) throw new Error(res.error);
        return { sheets: res.sheets, filename: `bahan-laporan-per-pegawai-${suffix}.xlsx` };
      }),
    },
    {
      key: 'idp', title: 'Rencana Pengembangan & Sesi Empat Mata', icon: Sprout, scoped: true,
      desc: <>Rencana pengembangan pegawai (<strong>bernama</strong>), disaring menurut periode <strong>laporan</strong> asalnya — <strong>3 lembar</strong>: <strong>Rencana</strong> (per prioritas) · <strong>Komentar &amp; Persetujuan</strong> (komentar atasan, siapa menyetujui &amp; kapan) · <strong>Sesi &amp; Tinjauan</strong> (sesi 1-on-1, tinjauan bulanan HRD, kemajuan per prioritas, tanggapan pegawai).</>,
      go: () => run('idp', async () => {
        const res = await exportDevPlans(pid());
        if (!res.ok) throw new Error(res.error);
        return { sheets: res.sheets, filename: `rencana-pengembangan-${suffix}.xlsx` };
      }),
    },
    {
      key: 'log', title: 'Log Aktivitas HRD', icon: ScrollText, scoped: false,
      desc: <>Jejak audit aksi sensitif HRD (append-only, <strong>lintas periode</strong>): waktu · pelaku · kategori · aksi · ringkasan · target · detail. Terbaru di atas.</>,
      go: () => run('log', async () => {
        const log = rowsOf(await exportHrdAuditLog());
        return { sheets: [{ name: 'Log Aktivitas HRD', rows: log }], filename: 'log-aktivitas-hrd.xlsx' };
      }),
    },
  ];

  // Ikon kartu seragam (kotak hijau pucat CardTitle) — kartu dibedakan lewat judul/ikon bentuk, bukan pelangi warna.
  return (
    <div className="space-y-5">
      {/* Filter periode — satu kontrol: label sejajar, tanpa kartu (rapat, seperti versi lama). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="text-[13px] font-semibold text-ink" htmlFor="ekspor-period">Periode:</label>
        <select id="ekspor-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)}
          className={`${FIELD} bg-surface min-w-[220px]`}>
          <option value="">Semua Periode</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}{p.active ? ' (aktif)' : ''}</option>)}
        </select>
        <span className="text-xs text-ink-soft">Berlaku untuk dataset ber-periode (Pegawai selalu lintas periode).</span>
      </div>

      <Note>
        Setiap unduhan berupa satu berkas Excel dengan beberapa lembar yang saling berkaitan, jadi cukup diunduh sekali.
      </Note>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map((c) => (
          <div key={c.key} className={`${CARD} flex flex-col gap-2`}>
            <CardTitle icon={c.icon}>{c.title}</CardTitle>
            <p className="text-[13px] text-ink-soft leading-relaxed">{c.desc}</p>
            <div className="mt-auto pt-1 flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy !== null} onClick={c.go}
                className="inline-flex items-center justify-center gap-2 text-[13px] font-bold min-h-9 px-4 rounded-xl bg-brand hover:bg-brand-ink text-white disabled:opacity-50 disabled:cursor-not-allowed">
                <Download className="w-4 h-4" /> {busy === c.key ? 'Menyiapkan…' : 'Unduh Excel'}
              </button>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-tint text-ink-soft">{c.scoped ? (selected ? selected.label : 'Semua periode') : 'Master'}</span>
            </div>
            {msg?.key === c.key && <p className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
