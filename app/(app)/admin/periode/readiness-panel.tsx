import Link from 'next/link';
import { StatusChip } from '@/components/status-chip';

/**
 * Kesiapan Peluncuran 360° — strip terbagi (signature): area utama (checklist prasyarat + urutan
 * tutup) + panel samping "Aksi Periode" (bedakan 2 saklar). Read-only. Menggantikan panel lama
 * yang nested + microcopy panjang.
 */
export function ReadinessPanel({
  periodLabel, indCount, mapCount, hasWeights, has360,
}: {
  periodLabel: string;
  indCount: number;
  mapCount: number;
  hasWeights: boolean;
  has360: boolean;
}) {
  const ready = indCount > 0 && mapCount > 0;

  const Check = ({ ok }: { ok: boolean }) => (
    ok
      ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-brand text-[10px] text-white">✓</span>
      : <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border border-line-strong text-[10px] text-ink-faint">·</span>
  );

  const Item = ({ ok, value, label, href, linkLabel }: {
    ok: boolean; value?: string; label: string; href?: string; linkLabel: string;
  }) => (
    <div className="flex items-center gap-2.5 text-[13px]">
      <Check ok={ok} />
      {value && <span className="font-mono font-semibold text-ink">{value}</span>}
      <span className="text-ink-soft">{label}</span>
      {href && (
        <Link href={href} className="ml-auto text-[12px] text-ink-faint border-b border-dotted border-ink-faint hover:text-ink-soft">
          {linkLabel}
        </Link>
      )}
    </div>
  );

  return (
    <div className="mb-5 flex flex-col lg:flex-row items-stretch overflow-hidden rounded-panel border border-line bg-surface">
      <div className="flex-1 p-5 lg:p-6 lg:border-r border-line-soft">
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <h3 className="text-[14.5px] font-bold text-ink">Kesiapan Peluncuran 360° — {periodLabel}</h3>
          <StatusChip tone={has360 ? 'brand' : ready ? 'brand' : 'warn'}>
            {has360 ? 'Form terbuka' : ready ? 'Siap diluncurkan' : 'Belum lengkap'}
          </StatusChip>
        </div>

        <div className="flex flex-col gap-2.5">
          <Item ok={indCount > 0} value={`${indCount}`} label="pertanyaan aktif" href="/admin/pertanyaan" linkLabel="Kelola Pertanyaan" />
          <Item ok={mapCount > 0} value={`${mapCount}`} label="pasangan penilai → target" href="/admin/pemetaan" linkLabel="Kelola Pemetaan" />
          <Item ok={hasWeights} label={hasWeights ? 'Bobot penilai tersimpan' : 'Bobot penilai (pakai default)'} href={hasWeights ? undefined : '/admin/bobot'} linkLabel="Atur Bobot" />
        </div>

        <p className="mt-4 pt-3.5 border-t border-line-soft text-[12px] text-ink-faint">
          <span className="font-semibold text-ink-soft">Urutan tutup periode:</span> Hitung ulang skor 360° → finalisasi laporan → Kunci &amp; Akhiri.
        </p>
      </div>

      <div className="w-full lg:w-[270px] shrink-0 p-5 lg:p-6 bg-[#FBFBFA] flex flex-col justify-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint mb-2">Aksi Periode</div>
        <p className="text-[12.5px] text-ink-soft leading-relaxed">
          <span className="font-semibold text-ink">Aktivasi / Kunci &amp; Akhiri</span> — hidup-mati seluruh periode (KPI dan 360°).
        </p>
        <p className="mt-2.5 text-[12.5px] text-ink-soft leading-relaxed">
          <span className="font-semibold text-ink">Set Tanpa 360°</span> — tutup sementara bagian 360° saja, KPI tetap berjalan.
        </p>
      </div>
    </div>
  );
}
