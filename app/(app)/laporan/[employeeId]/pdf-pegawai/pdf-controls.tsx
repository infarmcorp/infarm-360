'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Settings2, Check } from 'lucide-react';
import { Button } from '@/components/button';
import { DatePicker } from '@/components/date-picker';
import { CARD, CardTitle, FIELD, FIELD_LABEL, Note } from '@/components/infarm-ui';
import { savePaPdfSettings } from '@/app/(app)/admin/laporan/actions';
import { callAction } from '@/lib/call-action';
import { followUpRows, type PaPdfSettings } from '@/lib/pa-pdf';

/** Tombol cetak — jendela cetak browser (pilih "Simpan sebagai PDF"). */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="w-4 h-4" aria-hidden /> Cetak / Simpan PDF
    </Button>
  );
}

/**
 * Pengaturan PDF Pegawai per periode (tanggal laporan + tenggat tindak lanjut) — berlaku untuk
 * PDF semua pegawai periode itu. Tersimpan di server (periods.pa_pdf).
 */
export function PdfSettingsForm({
  periodId, periodLabel, initial, isDefault,
}: { periodId: string; periodLabel: string; initial: PaPdfSettings; isDefault: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reportDate, setReportDate] = useState(initial.reportDate);
  const [tenggat, setTenggat] = useState<string[]>([...initial.tenggat]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rows = followUpRows('', tenggat);

  async function save(reset: boolean) {
    setBusy(true); setMsg(null);
    const res = await callAction(() => savePaPdfSettings(periodId, reset ? null : { reportDate, tenggat }));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: reset ? 'Dikembalikan ke bawaan' : 'Tersimpan' });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  return (
    <div className={`${CARD} mb-4 no-print`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon={Settings2}>Tanggal & jadwal tindak lanjut — {periodLabel}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Tutup' : 'Ubah'}
        </Button>
      </div>
      <div className="mt-2"><Note>
        Berlaku untuk PDF Pegawai semua pegawai di periode ini.{' '}
        {isDefault ? 'Saat ini memakai bawaan yang dihitung dari tanggal akhir periode.' : 'Sudah diatur HRD.'}
      </Note></div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="max-w-xs">
            <span className={FIELD_LABEL}>Tanggal laporan</span>
            <DatePicker value={reportDate} onChange={setReportDate} ariaLabel="Tanggal laporan" className="w-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r, i) => (
              <label key={r.no} className="block">
                <span className={FIELD_LABEL}>Tenggat {r.no}. {r.aksi.replace(/ bagian \d+/, '')}</span>
                <input type="text" maxLength={80} className={`${FIELD} w-full`} value={tenggat[i] ?? ''}
                  onChange={(e) => setTenggat((t) => t.map((x, j) => (j === i ? e.target.value : x)))} />
              </label>
            ))}
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
