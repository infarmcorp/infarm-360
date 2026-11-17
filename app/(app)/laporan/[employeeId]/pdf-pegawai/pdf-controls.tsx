'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings2, Check, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/button';
import { DatePicker } from '@/components/date-picker';
import { CARD, CardTitle, FIELD, FIELD_LABEL, Note } from '@/components/infarm-ui';
import { savePaPdfSettings } from '@/app/(app)/admin/laporan/actions';
import { callAction } from '@/lib/call-action';
import { FOLLOW_MAX_ROWS, type FollowRow, type PaPdfSettings } from '@/lib/pa-pdf';

const COLS: [keyof FollowRow, string, number][] = [
  ['aksi', 'Aksi', 120], ['target', 'Target', 200], ['tenggat', 'Tenggat', 120], ['pendamping', 'Pendamping', 120], ['selesai', 'Indikator Selesai', 200],
];
const EMPTY: FollowRow = { aksi: '', target: '', tenggat: '', pendamping: '', selesai: '' };

/**
 * Pengaturan PDF Pegawai per periode: tanggal laporan + tabel "Tindak Lanjut Setelah Menerima Laporan Ini"
 * (semua kolom bisa diubah, baris bisa ditambah/dihapus/diurutkan). Berlaku untuk PDF semua pegawai periode itu.
 */
export function PdfSettingsForm({
  periodId, periodLabel, initial, isDefault,
}: { periodId: string; periodLabel: string; initial: PaPdfSettings; isDefault: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reportDate, setReportDate] = useState(initial.reportDate);
  const [rows, setRows] = useState<FollowRow[]>(initial.rows.map((r) => ({ ...r })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCell = (i: number, k: keyof FollowRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const j = i + d; if (j < 0 || j >= rs.length) return rs;
    const n = [...rs]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  async function save(reset: boolean) {
    setBusy(true); setMsg(null);
    const res = await callAction(() => savePaPdfSettings(periodId, reset ? null : { reportDate, rows }));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: reset ? 'Dikembalikan ke bawaan' : 'Tersimpan — pratinjau diperbarui' });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon={Settings2}>Tanggal laporan & tindak lanjut — {periodLabel}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>{open ? 'Tutup' : 'Ubah'}</Button>
      </div>
      <div className="mt-2">
        <Note>
          Berlaku untuk PDF Pegawai semua pegawai di periode ini.{' '}
          {isDefault ? 'Saat ini memakai bawaan yang dihitung dari tanggal akhir periode.' : 'Sudah diatur HRD.'}
        </Note>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="max-w-xs">
            <span className={FIELD_LABEL}>Tanggal laporan</span>
            <DatePicker value={reportDate} onChange={setReportDate} ariaLabel="Tanggal laporan" className="w-full" />
          </div>
          <div>
            <span className={FIELD_LABEL}>Tabel tindak lanjut ({rows.length} baris)</span>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="rounded-xl border border-line p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-ink">Baris {i + 1}</span>
                    <div className="flex items-center gap-1">
                      <IconBtn label="Naikkan" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
                      <IconBtn label="Turunkan" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
                      <IconBtn label="Hapus baris" disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {COLS.map(([k, label, max]) => (
                      <label key={k} className="block">
                        <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
                        <textarea rows={2} maxLength={max} value={r[k]} onChange={(e) => setCell(i, k, e.target.value)}
                          className={`${FIELD} w-full py-1.5 resize-y leading-snug`} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {rows.length < FOLLOW_MAX_ROWS && (
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setRows((rs) => [...rs, { ...EMPTY }])}>
                <Plus className="w-4 h-4" aria-hidden /> Tambah baris
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy} onClick={() => save(false)}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
            {!isDefault && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => save(true)}>Kembalikan ke bawaan</Button>
            )}
            {msg && (
              <span className={`text-xs font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>
                {msg.ok && <Check className="inline w-3.5 h-3.5 mr-0.5" aria-hidden />}{msg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} disabled={disabled} onClick={onClick}
      className="inline-flex items-center justify-center w-7 h-7 rounded-control border border-line text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-40">
      {children}
    </button>
  );
}
