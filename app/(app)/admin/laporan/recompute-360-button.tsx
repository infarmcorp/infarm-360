'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/button';
import { OverflowMenu } from '@/components/overflow-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { computeResult360 } from '@/app/(app)/admin/360/actions';

/**
 * Langkah ① "Hitung Ulang Skor 360°" (kokpit Review & Finalisasi). Memakai action yang sama dengan
 * halaman Bobot (computeResult360) — memproses seluruh penilaian terkirim periode aktif sekaligus.
 *  - `stale` > 0 → tombol aktif (hijau bila `primary`, yaitu langkah yang sedang perlu dikerjakan).
 *  - `stale` = 0 → tombol nonaktif "Mutakhir" agar HRD tak menekan tanpa alasan; jalan darurat
 *    "Hitung ulang paksa" tetap ada di menu ⋯ (bila ada perubahan yang tak tertangkap pendeteksi).
 *  - `blocked` → bobot periode belum disimpan; server pasti menolak, jadi tombol dimatikan.
 */
export function Recompute360Button({ stale, primary, blocked = false }: { stale: number; primary: boolean; blocked?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true); setMsg(null); setConfirmForce(false);
    const res = await computeResult360();
    setBusy(false);
    // Pegawai yang laporannya sudah Final tak dihitung ulang (kunci laporan Final) — disebutkan jumlahnya.
    const skipped = res.ok && res.skippedFinal > 0 ? ` ${res.skippedFinal} pegawai dilewati karena laporannya sudah Final.` : '';
    setMsg(res.ok ? { ok: true, text: `Skor 360° dihitung ulang untuk ${res.computed} pegawai.${skipped}` } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  const spin = <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {stale > 0 ? (
          <Button type="button" size="sm" variant={primary ? 'primary' : 'ghost'} onClick={run} disabled={busy || blocked}>
            {spin} {busy ? 'Menghitung…' : 'Hitung Ulang Skor 360°'}
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="ghost" disabled title="Tidak ada perubahan sejak terakhir dihitung">
              {busy ? <>{spin} Menghitung…</> : '✓ Mutakhir'}
            </Button>
            {!blocked && (
              <OverflowMenu label="Opsi hitung ulang" items={[{
                label: 'Hitung ulang paksa', onSelect: () => setConfirmForce(true), disabled: busy,
                title: 'Hitung ulang semua Skor 360° walau tak terdeteksi perubahan',
              }]} />
            )}
          </>
        )}
      </div>
      {msg && <span className={`text-[11px] font-semibold ${msg.ok ? 'text-brand-ink' : 'text-danger-ink'}`}>{msg.text}</span>}

      <ConfirmDialog
        open={confirmForce} icon="🔄" tone="primary"
        title="Hitung ulang paksa Skor 360°?"
        confirmLabel="Ya, hitung ulang" busy={busy}
        onConfirm={run} onCancel={() => setConfirmForce(false)}
      >
        <p>Aplikasi tidak mendeteksi perubahan sejak Skor 360° terakhir dihitung, jadi biasanya ini <strong>tidak perlu</strong>.</p>
        <p>Pakai hanya bila Anda yakin ada perubahan yang belum masuk. Laporan Final tidak ikut berubah — bila angkanya
          berbeda, akan muncul di langkah ② sebagai &quot;laporan Final yang berubah&quot;.</p>
      </ConfirmDialog>
    </div>
  );
}
