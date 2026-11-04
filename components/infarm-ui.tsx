import { AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import type { PlayerClass } from '@/lib/scoring';
import type { Trend } from '@/lib/trend';
import { infarmFontVars } from '@/app/infarm-fonts';

/*
 * Primitif tampilan Design System Infarm (diekstrak dari Dashboard Organisasi, 2026-11-04) — dipakai semua halaman
 * yang sudah di-redesign. Tanpa hook → aman di Server maupun Client Component. Prinsip (permintaan pengguna):
 * bagian JELAS terpisah — judul bagian bergaris aksen + pemisah, kartu metrik terpisah berikon (hanya angka utama
 * yang hijau), judul kartu berikon, catatan penjelas kecil & netral. Skala & aturan → CLAUDE.md §8.
 */

/** Pembungkus kanvas halaman: font Design System + latar hijau keputihan. Tempel di <main> halaman. */
export const INFARM_PAGE = `infarm-ds ${infarmFontVars} bg-infarm-surface`;

/** Palet skor diskrit = jangkar heatColorInfarm: ≥90 cokelat · 80–89 hijau · 70–79 kuning · <70 merah. */
export const CAT_COLOR = { exceed: '#6b4e3d', meet: '#388e3c', improve: '#ffc107', below: '#b71c1c' } as const;
/** Teks di atas segmen berwarna kategori (kuning terang → teks gelap). */
export const CAT_TEXT = { exceed: '#ffffff', meet: '#ffffff', improve: '#1b1f1c', below: '#ffffff' } as const;

/** Warna kelas 4-Box (titik grafik) + chip badge. Pengganti warna PLAYER_BOXES (lib) di halaman ber-redesign. */
export const PLAYER_TONE: Record<PlayerClass, { color: string; chip: string }> = {
  A: { color: '#00843b', chip: 'bg-brand text-white border-brand' },
  B_CULTURE: { color: '#96d296', chip: 'bg-infarm-light text-ink border-infarm-light' },
  B_KPI: { color: '#6b4e3d', chip: 'bg-infarm-cream text-infarm-soil border-infarm-cream' },
  C: { color: '#a23c33', chip: 'bg-danger-tint text-danger-ink border-danger-tint' },
  HRD_REVIEW: { color: '#f08c00', chip: 'bg-warn-tint text-warn-ink border-warn-tint' },
};

/** Chip tren KPI (pengganti warna TREND_META di halaman ber-redesign; label & panah tetap dari lib). */
export const TREND_CHIP: Record<Exclude<Trend, 'empty'>, string> = {
  up: 'bg-brand-tint text-brand-ink',
  down: 'bg-danger-tint text-danger-ink',
  stable: 'bg-neutral-tint text-ink-soft',
  volatile: 'bg-infarm-cream text-infarm-soil',
  unread: 'bg-neutral-tint text-ink-soft',
};

/** Kartu standar: putih, garis tepi tipis + bayangan tipis (kontras dengan latar hijau keputihan). */
export const CARD = 'bg-surface border border-line rounded-card shadow-card p-5';

/** Judul halaman (h1 Montserrat 30px) + subjudul. */
export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-[30px] leading-tight font-bold tracking-[-0.01em] text-ink">{title}</h1>
      {children && <div className="text-sm text-ink-soft mt-1.5">{children}</div>}
    </div>
  );
}

/** Judul kartu (Montserrat via .infarm-ds h3, 18px bold) + ikon garis di kotak hijau pucat sebagai jangkar mata. */
export function CardTitle({ icon: Icon, className = '', children }: { icon: LucideIcon; className?: string; children: React.ReactNode }) {
  return (
    <h3 className={`flex items-center gap-2.5 text-lg font-bold text-ink leading-snug ${className}`}>
      <span className="w-8 h-8 rounded-lg bg-brand-tint text-brand-ink flex items-center justify-center shrink-0" aria-hidden>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="min-w-0">{children}</span>
    </h3>
  );
}

/** Judul pengelompok bagian: garis pemisah atas + garis aksen hijau + label kapital tebal + petunjuk abu. */
export function SectionHeader({ label, hint }: { label: string; hint?: string; tone?: string }) {
  return (
    <div className="mt-8 pt-6 border-t border-line flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="w-1 h-[18px] rounded-full bg-brand shrink-0" aria-hidden />
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">{label}</h2>
      {hint && <span className="text-xs text-ink-soft">· {hint}</span>}
    </div>
  );
}

/** Catatan penjelas — sengaja kecil & netral (sekunder), agar tak bersaing dengan isi utama. `warn` = peringatan. */
export function Note({ title, tone = 'neutral', children }: { title?: string; tone?: 'neutral' | 'warn'; children: React.ReactNode }) {
  const cls = tone === 'warn' ? 'bg-warn-tint text-warn-ink' : 'bg-neutral-tint text-ink-soft';
  return (
    <div className={`flex gap-2 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${cls}`}>
      {tone === 'warn'
        ? <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden />
        : <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />}
      <div>{title && <strong className="font-semibold text-ink">{title}: </strong>}{children}</div>
    </div>
  );
}

export type StatTone = 'brand' | 'danger' | 'warn' | 'soil';
export type StatItem = { value: string; label: string; sub?: React.ReactNode; icon: LucideIcon; tone?: StatTone };
const STAT_TONE: Record<StatTone, string> = {
  brand: 'bg-brand-tint text-brand-ink',
  danger: 'bg-danger-tint text-danger-ink',
  warn: 'bg-warn-tint text-warn-ink',
  soil: 'bg-infarm-cream text-infarm-soil',
};

/** Satu kartu metrik putih berikon (dipakai StatCards; boleh dipakai sendiri). */
export function StatCard({ item }: { item: StatItem }) {
  const Icon = item.icon;
  return (
    <div className={`${CARD} flex items-center gap-4 min-w-0`}>
      <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${STAT_TONE[item.tone ?? 'brand']}`} aria-hidden><Icon className="w-6 h-6" /></span>
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="font-mono text-xl font-bold text-ink leading-tight truncate" title={item.value}>{item.value}</span>
        <span className="text-sm text-ink-soft">{item.label}</span>
        {item.sub != null && (typeof item.sub === 'string'
          ? <span className="text-xs font-semibold text-ink truncate" title={item.sub}>{item.sub}</span>
          : <span className="text-xs">{item.sub}</span>)}
      </div>
    </div>
  );
}

/**
 * Kartu ringkasan TERPISAH (satu metrik per kartu, berikon). Hanya angka utama (`lead`) yang berlatar
 * hijau brand agar langsung menjadi titik fokus; sisanya kartu putih standar.
 * Angka ringkasan sengaja < judul halaman (30px): utama 24px, kartu lain 20px (pengguna 2026-11-04).
 */
export function StatCards({ lead, items }: { lead?: StatItem; items: StatItem[] }) {
  const LeadIcon = lead?.icon;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {lead && LeadIcon && (
        <div className="bg-brand text-white rounded-card shadow-card p-5 flex items-center gap-4 min-w-0">
          <span className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0" aria-hidden><LeadIcon className="w-6 h-6" /></span>
          <div className="min-w-0 flex flex-col gap-1">
            <span className="font-mono text-2xl leading-none font-bold">{lead.value}</span>
            <span className="text-sm font-semibold">{lead.label}</span>
            {lead.sub}
          </div>
        </div>
      )}
      {items.map((it) => <StatCard key={it.label} item={it} />)}
    </div>
  );
}

/** Kelas kontrol isian standar (input/select): latar hijau keputihan, tinggi ≥44px, fokus hijau. */
export const FIELD = 'text-sm min-h-11 px-3 border border-line rounded-control bg-infarm-surface text-ink placeholder:text-ink-soft focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint';
/** Label kontrol isian standar. */
export const FIELD_LABEL = 'block text-xs font-semibold text-ink-soft mb-1.5';
/** Kepala tabel standar (baris <tr> di <thead>). */
export const TABLE_HEAD = 'text-xs font-semibold text-ink-soft bg-infarm-surface';
/** Pil sub-tab: aktif hijau solid, lainnya putih bergaris. */
export const pillCls = (active: boolean) =>
  `flex items-center gap-2 min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${
    active ? 'bg-brand border-brand text-white' : 'bg-surface border-line text-ink-soft hover:text-brand hover:border-infarm-light'}`;
