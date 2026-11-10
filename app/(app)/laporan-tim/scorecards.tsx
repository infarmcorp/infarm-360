import { Award, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import { fmt2 } from '@/lib/scoring';
import { CARD } from '@/components/infarm-ui';
/**
 * Kartu skor ringkas Laporan Kinerja Tim: Total Pegawai · Avg KPI Tim · Avg 360° Tim.
 * Avg KPI & 360° menyertakan selisih terhadap rata-rata perusahaan (▲ hijau di atas, ▼ merah
 * di bawah). Rata-rata = mean dari rerata per-pegawai (bukan mean baris mentah) agar selaras
 * dengan kolom tabel. Komponen presentasional murni (dihitung di server).
 * Gaya = StatCard Design System Infarm (kartu putih terpisah berikon); dipakai juga di Monitor Kinerja.
 */
import { FilledNote } from '@/app/(app)/monitor/completeness';

function Delta({ team, company }: { team: number | null; company: number | null }) {
  if (team == null || company == null) return <span className="text-xs text-ink-soft">— vs rata-rata perusahaan</span>;
  const d = team - company;
  const up = d >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-brand-ink' : 'text-danger-ink'}`}>
      {up ? '▲' : '▼'} <span className="font-mono">{fmt2(Math.abs(d))}</span> vs rata-rata perusahaan
    </span>
  );
}

/**
 * Kartu metrik — meniru StatCard (components/infarm-ui.tsx), tetapi baris keterangannya `<div>`
 * (bukan `<span>`) karena memuat blok (FilledNote).
 */
function Card({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className={`${CARD} flex items-center gap-4 min-w-0`}>
      <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-brand-tint text-brand-ink" aria-hidden>
        <Icon className="w-6 h-6" />
      </span>
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="font-mono text-lg font-bold text-ink leading-tight truncate">{value}</span>
        <span className="text-[13px] text-ink-soft">{label}</span>
        {sub && <div className="flex flex-col gap-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export function TeamScorecards({
  total, teamKpi, companyKpi, team360, company360, has360,
  fillTotal, kpiFilled, s360Filled,
}: {
  total: number;
  teamKpi: number | null; companyKpi: number | null;
  team360: number | null; company360: number | null;
  has360: boolean;
  // Kelengkapan data (opsional) — ditampilkan sebagai baris ringkas di bawah kartu KPI & 360°.
  fillTotal?: number; kpiFilled?: number; s360Filled?: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
      <Card icon={Users} label="Total Pegawai" value={total} />
      <Card
        icon={Award}
        label="Avg KPI Tim"
        value={teamKpi != null ? fmt2(teamKpi) : '—'}
        sub={<>
          <Delta team={teamKpi} company={companyKpi} />          {fillTotal != null && kpiFilled != null && <FilledNote n={kpiFilled} total={fillTotal} />}
        </>}
      />
      {has360 && (
        <Card
          icon={TrendingUp}
          label="Avg 360° Tim"
          value={team360 != null ? fmt2(team360) : '—'}
          sub={<>
            <Delta team={team360} company={company360} />
            {fillTotal != null && s360Filled != null && <FilledNote n={s360Filled} total={fillTotal} />}
          </>}
        />
      )}
    </div>
  );
}
