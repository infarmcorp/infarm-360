import { fmt2 } from '@/lib/scoring';
/**
 * Kartu skor ringkas Laporan Kinerja Tim: Total Pegawai · Avg KPI Tim · Avg 360° Tim.
 * Avg KPI & 360° menyertakan selisih terhadap rata-rata perusahaan (▲ hijau di atas, ▼ merah
 * di bawah). Rata-rata = mean dari rerata per-pegawai (bukan mean baris mentah) agar selaras
 * dengan kolom tabel. Komponen presentasional murni (dihitung di server).
 */
import { FilledNote } from '@/app/(app)/monitor/completeness';

function Delta({ team, company }: { team: number | null; company: number | null }) {
  if (team == null || company == null) return <span className="text-[11px] text-ink-faint">— vs rata-rata perusahaan</span>;
  const d = team - company;
  const up = d >= 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? 'text-brand-ink' : 'text-danger-ink'}`}>
      {up ? '▲' : '▼'} <span className="data-value">{Math.abs(d).toFixed(2)}</span> vs rata-rata perusahaan
    </span>
  );
}

function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[150px] rounded-panel border border-line bg-surface px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-faint">{label}</div>
      <div className="text-2xl font-semibold data-value text-ink mt-1">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

export function TeamScorecards({
  total, teamKpi, companyKpi, team360, company360, has360, kpiUnread = 0,
  fillTotal, kpiFilled, s360Filled,
}: {
  total: number;
  teamKpi: number | null; companyKpi: number | null;
  team360: number | null; company360: number | null;
  has360: boolean;
  kpiUnread?: number; // jumlah pegawai KPI "belum terbaca" — dikecualikan dari Avg KPI Tim
  // Kelengkapan data (opsional) — ditampilkan sebagai baris ringkas di bawah kartu KPI & 360°.
  fillTotal?: number; kpiFilled?: number; s360Filled?: number;
}) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <Card label="Total Pegawai" value={total} />
      <Card
        label="Avg KPI Tim"
        value={teamKpi != null ? fmt2(teamKpi) : '—'}
        sub={<>
          <Delta team={teamKpi} company={companyKpi} />
          {kpiUnread > 0 && <div className="text-[10px] text-ink-faint">· <span className="data-value">{kpiUnread}</span> belum terbaca (dikecualikan)</div>}
          {fillTotal != null && kpiFilled != null && <FilledNote n={kpiFilled} total={fillTotal} />}
        </>}
      />
      {has360 && (
        <Card
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
