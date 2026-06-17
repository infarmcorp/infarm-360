'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import {
  exportEmployees, exportKpi, exportKpiAudit, exportPenalties, exportRekap, exportAssessments, exportMappings,
  type ExportResult,
} from './actions';

type PeriodOpt = { id: string; label: string; active: boolean };
type Item = {
  key: string; title: string; desc: string; file: string; sheet: string;
  scoped: boolean; // true → mengikuti filter periode; false → master (lintas periode)
  load: (periodId: string | null) => Promise<ExportResult>;
};

const ITEMS: Item[] = [
  { key: 'pegawai', title: 'Pegawai (Master)', desc: 'Kode, nama, divisi, peran, status, atasan, email. (Lintas periode.)', file: 'pegawai', sheet: 'Pegawai', scoped: false, load: () => exportEmployees() },
  { key: 'kpi', title: 'KPI Bulanan', desc: 'Skor KPI per pegawai per bulan (format panjang).', file: 'kpi-bulanan', sheet: 'KPI', scoped: true, load: (p) => exportKpi(p) },
  { key: 'kpiaudit', title: 'Log Audit KPI', desc: 'Jejak perubahan KPI: bulan, skor, pengubah, waktu, catatan.', file: 'log-audit-kpi', sheet: 'AuditKPI', scoped: true, load: (p) => exportKpiAudit(p) },
  { key: 'penalty', title: 'Kepatuhan / Punishment', desc: 'Poin punishment per pegawai, alasan, penetap.', file: 'kepatuhan-punishment', sheet: 'Punishment', scoped: true, load: (p) => exportPenalties(p) },
  { key: 'rekap', title: 'Rekap Kinerja per Periode', desc: 'KPI rerata, Skor 360°, punishment, Skor Akhir, kategori, A/B/C/D.', file: 'rekap-kinerja', sheet: 'Rekap', scoped: true, load: (p) => exportRekap(p) },
  { key: 'asmt', title: 'Penilaian 360° Detail (anonim penilai)', desc: 'Raw feedback per pegawai dinilai: relasi, indikator, rating, komentar — tanpa identitas penilai.', file: 'penilaian-360-detail', sheet: 'Penilaian360', scoped: true, load: (p) => exportAssessments(p) },
  { key: 'map', title: 'Pemetaan 360°', desc: 'Pasangan penilai → target, relasi, sifat (Wajib/Opsional).', file: 'pemetaan', sheet: 'Pemetaan', scoped: true, load: (p) => exportMappings(p) },
];

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'periode';

export function EksporClient({ periods }: { periods: PeriodOpt[] }) {
  const [periodId, setPeriodId] = useState<string>(''); // '' = semua periode
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  const selected = periods.find((p) => p.id === periodId) ?? null;
  const suffix = selected ? slug(selected.label) : 'semua-periode';

  async function download(it: Item) {
    setBusy(it.key); setMsg(null);
    try {
      const res = await it.load(it.scoped ? (periodId || null) : null);
      if (!res.ok) { setMsg({ key: it.key, ok: false, text: res.error }); return; }
      if (res.rows.length === 0) { setMsg({ key: it.key, ok: false, text: 'Belum ada data untuk diekspor.' }); return; }
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(res.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, it.sheet);
      XLSX.writeFile(wb, `${it.file}-${it.scoped ? suffix : 'master'}.xlsx`);
      setMsg({ key: it.key, ok: true, text: `${res.rows.length} baris diunduh.` });
    } catch {
      setMsg({ key: it.key, ok: false, text: 'Gagal menyiapkan file.' });
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      {/* Filter periode */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-bold text-gray-600">Periode:</label>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
          className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 min-w-[200px]">
          <option value="">Semua Periode</option>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}{p.active ? ' (aktif)' : ''}</option>)}
        </select>
        <span className="text-[11px] text-gray-400">Berlaku untuk dataset ber-periode (Pegawai selalu lintas periode).</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ITEMS.map((it) => (
          <div key={it.key} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-gray-800">{it.title}</h3>
                <p className="text-[11px] text-gray-500 leading-snug">{it.desc}</p>
              </div>
            </div>
            <div className="mt-auto flex items-center gap-2">
              <button type="button" disabled={busy !== null} onClick={() => download(it)}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
                <Download className="w-4 h-4" /> {busy === it.key ? 'Menyiapkan…' : 'Unduh Excel'}
              </button>
              {it.scoped && <span className="text-[10px] text-gray-400">{selected ? selected.label : 'Semua periode'}</span>}
            </div>
            {msg?.key === it.key && <p className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
