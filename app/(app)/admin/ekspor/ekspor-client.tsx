'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { exportEmployees, exportKpi, exportRekap, exportAssessments, exportMappings, type ExportResult } from './actions';

type Item = { key: string; title: string; desc: string; file: string; sheet: string; load: () => Promise<ExportResult> };

const ITEMS: Item[] = [
  { key: 'pegawai', title: 'Pegawai (Master)', desc: 'Kode, nama, divisi, peran, status, atasan, email.', file: 'pegawai', sheet: 'Pegawai', load: exportEmployees },
  { key: 'kpi', title: 'KPI Bulanan', desc: 'Skor KPI per pegawai per bulan (format panjang).', file: 'kpi-bulanan', sheet: 'KPI', load: exportKpi },
  { key: 'rekap', title: 'Rekap Kinerja per Periode', desc: 'KPI rerata, Skor 360°, punishment, Skor Akhir, kategori, A/B/C/D.', file: 'rekap-kinerja', sheet: 'Rekap', load: exportRekap },
  { key: 'asmt', title: 'Penilaian 360° Detail', desc: 'Raw feedback: penilai, target, relasi, indikator, rating, komentar.', file: 'penilaian-360-detail', sheet: 'Penilaian360', load: exportAssessments },
  { key: 'map', title: 'Pemetaan 360°', desc: 'Pasangan penilai → target, relasi, sifat (Wajib/Opsional).', file: 'pemetaan', sheet: 'Pemetaan', load: exportMappings },
];

export function EksporClient() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  async function download(it: Item) {
    setBusy(it.key); setMsg(null);
    try {
      const res = await it.load();
      if (!res.ok) { setMsg({ key: it.key, ok: false, text: res.error }); return; }
      if (res.rows.length === 0) { setMsg({ key: it.key, ok: false, text: 'Belum ada data untuk diekspor.' }); return; }
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(res.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, it.sheet);
      XLSX.writeFile(wb, `${it.file}.xlsx`);
      setMsg({ key: it.key, ok: true, text: `${res.rows.length} baris diunduh.` });
    } catch {
      setMsg({ key: it.key, ok: false, text: 'Gagal menyiapkan file.' });
    } finally { setBusy(null); }
  }

  return (
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
          <button type="button" disabled={busy !== null} onClick={() => download(it)}
            className="mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50">
            <Download className="w-4 h-4" /> {busy === it.key ? 'Menyiapkan…' : 'Unduh Excel'}
          </button>
          {msg?.key === it.key && <p className={`text-[11px] font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
        </div>
      ))}
    </div>
  );
}
