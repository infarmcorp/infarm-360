'use client';

import { useEffect, useMemo, useState } from 'react';
import { FolderUp, X } from 'lucide-react';
import { Button } from '@/components/button';
import { Note } from '@/components/infarm-ui';
import { callAction } from '@/lib/call-action';
import { transferPdfsToDrive } from './drive-actions';

/** Satu laporan Final + folder tujuannya (dihitung server; server menghitung ulang saat transfer). */
export type DriveTransferRow = { id: string; name: string; folders: string[] };
export type DriveTransferProps = { periodId: string; periodLabel: string; configured: boolean; rows: DriveTransferRow[] };

const BATCH = 5; // selaras MAX_BATCH di server

/**
 * Transfer PDF ke Drive — langkah ③ kokpit Review & Finalisasi (HRD Mode Admin). Membuka dialog pratinjau susunan
 * folder (divisi → atasan langsung), lalu mengirim per gelombang kecil dengan progres. Tanpa konfigurasi Drive
 * di server, tombol nonaktif dengan keterangan.
 */
export function DriveTransferButton({ drive }: { drive: DriveTransferProps }) {
  const [open, setOpen] = useState(false);
  const none = drive.rows.length === 0;
  const title = !drive.configured ? 'Transfer ke Drive belum aktif. Hubungi admin aplikasi.' : none ? 'Belum ada laporan Final' : undefined;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => setOpen(true)}
        disabled={none || !drive.configured} title={title}>
        <FolderUp className="w-3.5 h-3.5" /> Transfer PDF ke Drive
      </Button>
      {!drive.configured && <span className="text-xs text-ink-soft">Transfer ke Drive belum aktif.</span>}
      {open && <DriveTransferDialog drive={drive} onClose={() => setOpen(false)} />}
    </>
  );
}

function DriveTransferDialog({ drive, onClose }: { drive: DriveTransferProps; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details: string[] } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Pratinjau: folder → nama pegawai (pegawai dengan dua atasan muncul di dua folder).
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    drive.rows.forEach((r) => r.folders.forEach((f) => m.set(f, [...(m.get(f) ?? []), r.name])));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'id'));
  }, [drive.rows]);
  const fileCount = groups.reduce((n, [, names]) => n + names.length, 0);

  async function start() {
    setBusy(true); setMsg(null);
    const ids = drive.rows.map((r) => r.id);
    let ok = 0;
    const details: string[] = [];
    setProgress({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += BATCH) {
      const res = await callAction(() => transferPdfsToDrive({ periodId: drive.periodId, employeeIds: ids.slice(i, i + BATCH) }));
      if (!res.ok) { details.push(res.error); break; }
      ok += res.done.length;
      res.skipped.forEach((s) => details.push(`${s.name}: dilewati — ${s.reason}`));
      res.failed.forEach((f) => details.push(`${f.name}: gagal — ${f.reason}`));
      setProgress({ done: Math.min(ids.length, i + BATCH), total: ids.length });
    }
    setBusy(false); setProgress(null);
    setMsg({ ok: details.length === 0, text: `${ok} dari ${ids.length} PDF tersimpan di Drive.`, details });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={() => { if (!busy) onClose(); }}>
      <div className="my-6 w-full max-w-2xl rounded-panel border border-line bg-surface p-5 text-left shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">Transfer PDF ke Drive — <span className="data-value">{drive.periodLabel}</span></h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              PDF Pegawai semua laporan Final dibuat lalu disimpan ke Shared Drive, per divisi dan per atasan langsung.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-ink-soft hover:text-ink disabled:opacity-50" title="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-4 text-xs font-bold uppercase tracking-[0.08em] text-ink-soft">
          Susunan folder · <span className="data-value">{drive.rows.length}</span> pegawai · <span className="data-value">{fileCount}</span> berkas
        </p>
        <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-line">
          <ul className="divide-y divide-line-soft">
            {groups.map(([folder, names]) => (
              <li key={folder} className="px-3 py-2">
                <p className="text-[13px] font-semibold text-ink">{drive.periodLabel} / {folder} <span className="data-value font-normal text-ink-soft">({names.length})</span></p>
                <p className="mt-0.5 text-xs text-ink-soft">{names.join(', ')}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3"><Note>
          Isi PDF sama dengan yang diunduh pegawai: tanpa komentar asli dan tanpa nama penilai. Bila ditekan lagi, PDF yang
          sudah ada diganti versi terbaru, dipindah bila atasannya berganti, dan salinan yang tak lagi punya folder dibuang
          ke Sampah Drive. Folder diserahkan ke koordinator/SPV di Drive, di luar aplikasi.
        </Note></div>

        {progress && (
          <p className="mt-3 text-[13px] font-semibold text-ink">
            Memproses <span className="data-value">{progress.done}</span> / <span className="data-value">{progress.total}</span> pegawai… Jangan tutup jendela ini.
          </p>
        )}
        {msg && (
          <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-xs ${msg.ok ? 'bg-brand-tint text-brand-ink' : 'bg-warn-tint text-warn-ink'}`}>
            <p className="font-semibold">{msg.text}</p>
            {msg.details.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">{msg.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={onClose} disabled={busy}>Tutup</Button>
          <Button type="button" variant="primary" size="sm" className="min-h-9" onClick={start} disabled={busy || drive.rows.length === 0}>
            <FolderUp className="w-3.5 h-3.5" /> {busy ? 'Mentransfer…' : `Mulai Transfer (${fileCount} PDF)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
