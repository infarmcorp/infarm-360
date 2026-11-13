import Link from 'next/link';
import { Check as CheckIcon, Rocket } from 'lucide-react';
import { StatusChip } from '@/components/status-chip';
import { CardTitle } from '@/components/infarm-ui';

// Komponen kecil di tingkat modul (bukan di dalam ReadinessPanel) agar tak dibuat ulang tiap render.
const Check = ({ ok }: { ok: boolean }) => (
  ok
    ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-white"><CheckIcon className="w-3 h-3" strokeWidth={3} /></span>
    : <span className="flex h-4 w-4 shrink-0 rounded-full border border-line-strong" />
);

const Item = ({ ok, value, label, href, linkLabel }: {
  ok: boolean; value?: string; label: string; href?: string; linkLabel: string;
}) => (
  <div className="flex items-center gap-2.5 text-[13px]">
    <Check ok={ok} />
    {value && <span className="data-value font-semibold text-ink">{value}</span>}
    <span className="text-ink-soft">{label}</span>
    {href && (
      <Link href={href} className="ml-auto shrink-0 text-[12px] font-semibold text-brand-ink hover:underline">
        {linkLabel}
      </Link>
    )}
  </div>
);

/**
 * Kesiapan Peluncuran 360° — strip terbagi (signature): area utama (checklist prasyarat + urutan
 * tutup) + panel samping "Aksi Periode" (bedakan 2 saklar). Read-only. Menggantikan panel lama
 * yang nested + microcopy panjang.
 */
export function ReadinessPanel({
  periodLabel, indCount, mapCount, hasWeights, has360, backfilled = false,
}: {
  periodLabel: string;
  indCount: number;
  mapCount: number;
  hasWeights: boolean;
  has360: boolean;
  /** Skor 360° hasil impor Looker (mis. Q1 2026) — bobot tak diperlukan, ① dikunci. */
  backfilled?: boolean;
}) {
  const ready = indCount > 0 && mapCount > 0;

  return (
    <div className="mb-4 flex flex-col lg:flex-row items-stretch overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex-1 p-4 lg:border-r border-line-soft">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <CardTitle icon={Rocket}>Kesiapan Peluncuran 360° — {periodLabel}</CardTitle>
          <StatusChip tone={has360 ? 'brand' : ready ? 'brand' : 'warn'}>
            {has360 ? 'Formulir terbuka' : ready ? 'Siap diluncurkan' : 'Belum lengkap'}
          </StatusChip>
        </div>

        <div className="flex flex-col gap-2.5">
          <Item ok={indCount > 0} value={`${indCount}`} label="pertanyaan aktif" href="/admin/pertanyaan" linkLabel="Kelola Pertanyaan" />
          <Item ok={mapCount > 0} value={`${mapCount}`} label="pasangan penilai → target" href="/admin/pemetaan" linkLabel="Kelola Pemetaan" />
          {/* Tanpa skema bobot TERSIMPAN, ① Hitung Ulang Skor 360° ditolak server — jadi ini WAJIB,
              bukan "pakai default" (label lama menyesatkan; audit 2026-10-02). */}
          {backfilled
            ? <Item ok label="Skor 360° hasil impor resmi (Looker) — bobot tidak diperlukan, hitung ulang dikunci" linkLabel="" />
            : <Item ok={hasWeights} label={hasWeights ? 'Bobot penilai tersimpan' : 'Bobot penilai belum disimpan — wajib sebelum Hitung Ulang Skor 360°'} href={hasWeights ? undefined : '/admin/bobot'} linkLabel="Simpan Bobot" />}
        </div>

        {/* Catatan alur (bukan link) — no-underline eksplisit + spasi terjamin agar tak
            ke-render seperti tautan/warna tautan dari konteks tetangga. */}
        <p className="mt-4 pt-3 border-t border-line-soft text-[12px] text-ink-soft no-underline">
          <span className="font-semibold text-ink-soft">Urutan tutup periode:</span>{' '}
          Hitung ulang skor 360° → finalisasi laporan → Kunci &amp; Akhiri.
        </p>
      </div>

      <div className="w-full lg:w-[270px] shrink-0 p-4 bg-infarm-surface flex flex-col justify-center">
        <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink mb-2">Aksi Periode</div>
        <p className="text-[12px] text-ink-soft leading-relaxed">
          <span className="font-semibold text-ink">Aktivasi / Kunci &amp; Akhiri</span> — menyalakan atau mematikan seluruh periode (KPI dan 360°).
        </p>
        <p className="mt-2.5 text-[12px] text-ink-soft leading-relaxed">
          <span className="font-semibold text-ink">Atur Tanpa 360°</span> — tutup sementara bagian 360° saja, KPI tetap berjalan.
        </p>
      </div>
    </div>
  );
}
