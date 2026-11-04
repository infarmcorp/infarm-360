'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileUp, X } from 'lucide-react';
import { CARD, CardTitle, TABLE_HEAD } from '@/components/infarm-ui';
import { importSummaries } from './actions';
import {
  classifySummaryRows, buildSummaryPayload, SUMMARY_SHEET, SUMMARY_KIND_LABEL,
  type SummaryEmp, type SummaryRow,
} from '@/lib/import/summaries';

export type ImportSummaryEmp = SummaryEmp & {
  dept: string;
  aspectSummaries: Record<string, string>;
  qualSummaries: Record<string, string>;
};

const STATUS_LABEL: Record<string, string> = { draft: 'Draf', in_review: 'Ditinjau SPV', finalized: 'Final' };

/**
 * Impor Ringkasan Aspek & Pertanyaan Kualitatif dari Excel (format lembar "Ringkasan Naratif" Ekspor).
 * Pratinjau dulu → server menegakkan ulang semua aturan (importSummaries).
 */
export function ImportSummaries({ employees, aspects, questions, periodLabel, selfId }: {
  employees: ImportSummaryEmp[]; aspects: string[]; questions: string[]; periodLabel: string; selfId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SummaryRow[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; detail?: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setParseErr(null); setRows(null); setMsg(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      // File Ekspor lengkap punya banyak lembar → pakai "Ringkasan Naratif" bila ada.
      const sheet = wb.SheetNames.includes(SUMMARY_SHEET) ? SUMMARY_SHEET : wb.SheetNames[0];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: '' });
      const out = classifySummaryRows(raw, { employees, aspects, questions, periodLabel, selfId });
      if (out.length === 0) { setParseErr('Tidak menemukan baris ringkasan. Pastikan kolom kode, jenis, aspek_atau_pertanyaan, ringkasan ada.'); return; }
      setRows(out);
    } catch {
      setParseErr('Gagal membaca file. Pastikan .xlsx/.xls/.csv valid.');
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  const payload = useMemo(() => buildSummaryPayload(rows ?? []), [rows]);
  const counts = useMemo(() => {
    const c = { ok: 0, empty: 0, skip: 0, bad: 0 };
    (rows ?? []).forEach((r) => {
      if (r.status === 'ok') c.ok += 1; else if (r.status === 'empty') c.empty += 1;
      else if (r.status === 'skip') c.skip += 1; else c.bad += 1;
    });
    return c;
  }, [rows]);

  function apply() {
    if (payload.length === 0) { setMsg({ ok: false, text: 'Tidak ada ringkasan valid untuk diimpor.' }); return; }
    setMsg(null);
    start(async () => {
      const res = await importSummaries(payload);
      if (!res.ok) { setMsg({ ok: false, text: res.error }); return; }
      const notes = [
        ...res.skipped.map((s) => `${s.name}: ${s.reason}`),
        ...res.failed.map((f) => `${f.name}: gagal — ${f.reason}`),
      ];
      setMsg({
        ok: res.failed.length === 0,
        text: `Ringkasan ${res.saved} pegawai diperbarui${notes.length ? ` · ${notes.length} tidak diproses` : ''}.`,
        detail: notes.length ? notes.join('; ') : undefined,
      });
      setRows(null);
      router.refresh();
    });
  }

  /** Template = format Ekspor, terisi ringkasan saat ini (baris kosong untuk item yang belum diisi). */
  async function template() {
    const XLSX = await import('xlsx');
    const data = employees.filter((e) => e.status !== 'finalized' && e.id !== selfId).flatMap((e) => {
      const base = { periode: periodLabel, kode: e.code, nama: e.name, divisi: e.dept, status_laporan: STATUS_LABEL[e.status ?? ''] ?? 'Belum ada' };
      return [
        ...aspects.map((a) => ({ ...base, jenis: SUMMARY_KIND_LABEL.aspect, aspek_atau_pertanyaan: a, ringkasan: e.aspectSummaries[a] ?? '' })),
        ...questions.map((q) => ({ ...base, jenis: SUMMARY_KIND_LABEL.qual, aspek_atau_pertanyaan: q, ringkasan: e.qualSummaries[q] ?? '' })),
      ];
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, SUMMARY_SHEET);
    XLSX.writeFile(wb, `ringkasan-naratif-${periodLabel.replace(/\s+/g, '-')}.xlsx`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold min-h-9 px-3.5 rounded-control border border-line bg-surface text-ink-soft hover:text-ink hover:border-line-strong">
        <FileUp className="w-3.5 h-3.5" /> Impor Ringkasan dari Excel
      </button>
    );
  }

  const code = (s: string) => <code className="data-value text-ink-soft bg-neutral-tint px-1 rounded">{s}</code>;
  return (
    <div className={`${CARD} space-y-2.5 w-full`}>
      <div className="flex items-center justify-between">
        <CardTitle icon={FileUp}>Impor Ringkasan Aspek &amp; Kualitatif</CardTitle>
        <button type="button" onClick={() => { setOpen(false); setRows(null); setMsg(null); }} className="inline-flex items-center gap-1 text-ink-soft hover:text-ink text-xs font-semibold">Tutup <X className="w-3.5 h-3.5" aria-hidden /></button>
      </div>
      <p className="text-[13px] text-ink-soft leading-relaxed">
        Format sama dengan lembar <strong>Ringkasan Naratif</strong> di Ekspor: {code('kode')}, {code('jenis')} (Aspek / Pertanyaan Kualitatif),
        {' '}{code('aspek_atau_pertanyaan')}, {code('ringkasan')}. <button type="button" onClick={template} className="text-brand-ink font-semibold hover:underline">Unduh template (berisi ringkasan saat ini)</button>.
      </p>
      <p className="text-xs text-ink-soft leading-relaxed">
        Per pegawai, ringkasan jenis yang ada di file <strong>menggantikan</strong> seluruh ringkasan jenis itu — item yang tidak tercantum akan terhapus.
        Sel ringkasan kosong dilewati (isi lama tetap). Laporan Final tidak diubah.
      </p>
      <p className="text-xs text-ink-soft leading-relaxed">
        Format di dalam sel (pindah baris = Alt+Enter): {code('**teks**')} = tebal · baris diawali {code('- ')} atau {code('* ')} = poin
        (baris berikutnya tanpa tanda = lanjutan poin) · baris kosong = paragraf baru. Bila sel <strong>diawali</strong> poin,
        pakai {code('* ')} — Excel menganggap sel berawalan “-” sebagai rumus.
      </p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
        className="block text-xs file:mr-3 file:rounded-control file:border-0 file:bg-brand file:px-3 file:py-2 file:text-white file:font-bold" />
      {parseErr && <p className="text-xs text-danger-ink font-semibold">{parseErr}</p>}

      {rows && (
        <>
          <p className="text-xs text-ink-soft">
            <span className="data-value font-semibold text-ink">{counts.ok}</span> ringkasan akan diimpor ·{' '}
            <span className="data-value">{counts.empty}</span> kosong (isi lama tetap) ·{' '}
            <span className="data-value">{counts.skip}</span> dilewati ·{' '}
            <span className={`data-value ${counts.bad ? 'text-danger-ink font-semibold' : ''}`}>{counts.bad}</span> bermasalah
          </p>
          <div className="overflow-x-auto border border-line rounded-control max-h-72 overflow-y-auto bg-surface">
            <table className="w-full text-left text-xs">
              <thead><tr className={TABLE_HEAD}>
                <th className="py-2 px-2 font-semibold">Baris</th><th className="py-2 px-2 font-semibold">Pegawai</th><th className="py-2 px-2 font-semibold">Jenis</th>
                <th className="py-2 px-2 font-semibold">Aspek / Pertanyaan</th><th className="py-2 px-2 font-semibold">Ringkasan</th><th className="py-2 px-2 font-semibold">Keterangan</th>
              </tr></thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.line} className={r.status === 'invalid' || r.status === 'blocked' ? 'bg-danger-tint/50' : r.status === 'skip' ? 'bg-warn-tint/60' : ''}>
                    <td className="py-1.5 px-2 text-ink-soft data-value">{r.line}</td>
                    <td className="py-1.5 px-2 text-ink whitespace-nowrap">{r.emp?.name ?? <span className="text-danger-ink data-value">{r.code || '?'}</span>}</td>
                    <td className="py-1.5 px-2 text-ink-soft whitespace-nowrap">{r.kind ? SUMMARY_KIND_LABEL[r.kind] : '?'}</td>
                    <td className="py-1.5 px-2 text-ink-soft max-w-[220px] truncate" title={r.item}>{r.item || '?'}</td>
                    <td className="py-1.5 px-2 text-ink-soft max-w-[280px] truncate" title={r.text}>{r.text || <span className="text-ink-faint">—</span>}</td>
                    <td className="py-1.5 px-2">
                      {r.status === 'ok'
                        ? <span className="inline-flex items-center gap-1 text-brand-ink font-semibold"><Check className="w-3 h-3" aria-hidden />Akan diimpor</span>
                        : <span className={r.status === 'empty' ? 'text-ink-faint' : r.status === 'skip' ? 'text-warn-ink' : 'text-danger-ink'}>{r.status !== 'empty' && <X className="mr-0.5 inline w-3 h-3 -mt-0.5" aria-hidden />}{r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={apply} disabled={pending || payload.length === 0} className="rounded-xl bg-brand hover:bg-brand-ink min-h-9 px-4 text-white text-[13px] font-bold disabled:opacity-50">
              {pending ? 'Mengimpor…' : `Impor ringkasan ${payload.length} pegawai`}
            </button>
            <button onClick={() => setRows(null)} disabled={pending} className="text-[13px] font-semibold text-ink-soft hover:text-ink">Batal</button>
          </div>
        </>
      )}
      {msg && (
        <div className={`text-[13px] ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>
          <p className="font-semibold">{msg.text}</p>
          {msg.detail && <p className="text-xs text-ink-soft mt-1 leading-relaxed">{msg.detail}</p>}
        </div>
      )}
    </div>
  );
}
