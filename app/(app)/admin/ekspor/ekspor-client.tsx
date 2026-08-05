'use client';

import { useState } from 'react';
import { Download, Users, Settings, BarChart3, MessageSquareText, ScrollText } from 'lucide-react';
import {
  exportEmployees, exportKpi, exportKpiAudit, exportPenalties, exportRekap,
  exportAssessments, exportQualAnswers, exportMappings, exportAspectSummaries,
  exportSummary360, exportAspectScores, exportPeriodConfig, exportHrdAuditLog, type ExportResult, type Sheet,
} from './actions';

type PeriodOpt = { id: string; label: string; active: boolean };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'periode';

/**
 * Ekspor Dataset (HRD) — DIKONSOLIDASI jadi 4 file multi-sheet (bukan 11 tombol) agar tak ada
 * unduhan ganda untuk data yang berkaitan. Tiap fungsi `exportX` di actions.ts tetap dipakai;
 * di sini hanya dirangkai jadi beberapa lembar dalam satu workbook (perakitan di sisi klien).
 *  1. Pegawai (Master)            — 1 lembar, lintas periode.
 *  2. Konfigurasi Periode Lengkap — Ringkasan/Bobot/Bulan KPI/Aspek & Indikator/Esai + Pemetaan.
 *  3. Kinerja Lengkap per Periode — Rekap/KPI Bulanan/Audit KPI/Punishment.
 *  4. Penilaian 360° Lengkap      — Kuantitatif/Kualitatif/Ringkasan Naratif HRD (anonim penilai).
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
      if (total === 0) { setMsg({ key, ok: false, text: 'Belum ada data untuk diekspor.' }); return; }
      await writeWorkbook(sheets, filename);
      setMsg({ key, ok: true, text: `${total} baris diunduh (${sheets.length} lembar).` });
    } catch (e) {
      setMsg({ key, ok: false, text: e instanceof Error ? e.message : 'Gagal menyiapkan file.' });
    } finally { setBusy(null); }
  }

  type Card = { key: string; title: string; desc: React.ReactNode; icon: React.ElementType; tint: string; scoped: boolean; go: () => Promise<void> };

  const cards: Card[] = [
    {
      key: 'pegawai', title: 'Pegawai (Master)', icon: Users, tint: 'slate', scoped: false,
      desc: 'Direktori pegawai: kode, nama, divisi, peran, status, atasan, email. Lintas periode (mengabaikan filter).',
      go: () => run('pegawai', async () => {
        const emp = rowsOf(await exportEmployees());
        return { sheets: [{ name: 'Pegawai', rows: emp }], filename: 'pegawai-master.xlsx' };
      }),
    },
    {
      key: 'config', title: 'Konfigurasi Periode Lengkap', icon: Settings, tint: 'emerald', scoped: true,
      desc: <>Seluruh pengaturan HRD per kuartal — <strong>6 lembar</strong>: Ringkasan · Bobot Penilai · Bulan KPI · Aspek &amp; Indikator · Pertanyaan Esai · <strong>Pemetaan 360°</strong>.</>,
      go: () => run('config', async () => {
        const cfg = await exportPeriodConfig(pid());
        if (!cfg.ok) throw new Error(cfg.error);
        const map = rowsOf(await exportMappings(pid()));
        return { sheets: [...cfg.sheets, { name: 'Pemetaan', rows: map }], filename: `konfigurasi-periode-${suffix}.xlsx` };
      }),
    },
    {
      key: 'kinerja', title: 'Kinerja Lengkap per Periode', icon: BarChart3, tint: 'indigo', scoped: true,
      desc: <><strong>4 lembar</strong>: Rekap (KPI rerata · Skor 360° · punishment · Skor Akhir · kategori · 4-Box) · KPI Bulanan · Audit KPI · Punishment.</>,
      go: () => run('kinerja', async () => {
        const [rekap, kpi, audit, pen] = await Promise.all([exportRekap(pid()), exportKpi(pid()), exportKpiAudit(pid()), exportPenalties(pid())]);
        const sheets: Sheet[] = [
          { name: 'Rekap', rows: rowsOf(rekap) },
          { name: 'KPI Bulanan', rows: rowsOf(kpi) },
          { name: 'Audit KPI', rows: rowsOf(audit) },
          { name: 'Punishment', rows: rowsOf(pen) },
        ];
        return { sheets, filename: `kinerja-lengkap-${suffix}.xlsx` };
      }),
    },
    {
      key: 'f360', title: 'Penilaian 360° Lengkap', icon: MessageSquareText, tint: 'violet', scoped: true,
      desc: <><strong>5 lembar</strong> (semua <strong>anonim penilai</strong>): <strong>Ringkasan per Pegawai</strong> (jml penilai per kelas · Nilai Atasan/Internal/Self · Nilai 360° · Gap · Skala 100) · <strong>Rekap Aspek</strong> (Skor 360° terbobot &amp; Nilai Diri per aspek budaya) · Kuantitatif (rating per indikator) · Kualitatif (esai) · Ringkasan Naratif HRD.</>,
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
      key: 'log', title: 'Log Aktivitas HRD', icon: ScrollText, tint: 'amber', scoped: false,
      desc: <>Jejak audit aksi sensitif HRD (append-only, <strong>lintas periode</strong>): waktu · pelaku · kategori · aksi · ringkasan · target · detail. Terbaru di atas.</>,
      go: () => run('log', async () => {
        const log = rowsOf(await exportHrdAuditLog());
        return { sheets: [{ name: 'Log Aktivitas HRD', rows: log }], filename: 'log-aktivitas-hrd.xlsx' };
      }),
    },
  ];

  // Ikon monokrom on-token — kartu dibedakan lewat judul/ikon bentuk, bukan pelangi warna.
  const TINT: Record<string, string> = {
    slate: 'text-ink-soft', emerald: 'text-brand', indigo: 'text-brand', violet: 'text-brand', amber: 'text-warn-ink',
  };

  return (
    <div className="space-y-4">
      {/* Filter periode */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-bold text-ink-soft">Periode:</label>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
          className="text-xs px-3 py-2 border border-line rounded-control bg-surface text-ink focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint min-w-[200px]">
          <option value="">Semua Periode</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}{p.active ? ' (aktif)' : ''}</option>)}
        </select>
        <span className="text-[11px] text-ink-faint">Berlaku untuk dataset ber-periode (Pegawai selalu lintas periode).</span>
      </div>

      <p className="text-[11px] text-ink-soft bg-neutral-tint border border-line rounded-control px-3 py-2">
        Tiap unduhan = <strong>satu file Excel dengan beberapa lembar (sheet)</strong> yang setema — buka file, pindah antar-lembar di bawah. Tak perlu mengunduh berkali-kali untuk data yang berkaitan.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="border border-line rounded-panel bg-surface p-4 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${TINT[c.tint]}`} />
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-ink">{c.title}</h3>
                  <p className="text-[11px] text-ink-soft leading-snug">{c.desc}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button type="button" disabled={busy !== null} onClick={c.go}
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-control bg-brand hover:bg-brand-ink text-white disabled:opacity-50">
                  <Download className="w-4 h-4" /> {busy === c.key ? 'Menyiapkan…' : 'Unduh Excel'}
                </button>
                <span className="text-[10px] text-ink-faint">{c.scoped ? (selected ? selected.label : 'Semua periode') : 'Master'}</span>
              </div>
              {msg?.key === c.key && <p className={`text-[11px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
