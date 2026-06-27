/**
 * Fungsi skoring murni — dipakai Dashboard HRD (data Supabase).
 * Rumus identik dengan SPA legacy (blend KPI+360 − punishment, klasifikasi 9-Box/4-Box).
 */
export type Band = 'hi' | 'mid' | 'lo';

export const kpiBandOf = (k: number): Band => (k >= 90 ? 'hi' : k >= 80 ? 'mid' : 'lo');
export const s360BandOf = (s: number): Band => (s >= 80 ? 'hi' : s >= 70 ? 'mid' : 'lo');

export type TalentBox = { key: string; label: string; kpiBand: Band; s360Band: Band; color: string };

export const TALENT_BOXES: TalentBox[] = [
  { key: 'star',     label: 'Star Talent',         kpiBand: 'hi',  s360Band: 'hi',  color: '#059669' },
  { key: 'highperf', label: 'High Performer',      kpiBand: 'hi',  s360Band: 'mid', color: '#16a34a' },
  { key: 'expert',   label: 'Expert / Lone Wolf',  kpiBand: 'hi',  s360Band: 'lo',  color: '#ca8a04' },
  { key: 'highpot',  label: 'High Potential',      kpiBand: 'mid', s360Band: 'hi',  color: '#2563eb' },
  { key: 'core',     label: 'Core Contributor',    kpiBand: 'mid', s360Band: 'mid', color: '#4f46e5' },
  { key: 'align',    label: 'Needs Align',         kpiBand: 'mid', s360Band: 'lo',  color: '#d97706' },
  { key: 'rough',    label: 'Rough Diamond',       kpiBand: 'lo',  s360Band: 'hi',  color: '#0891b2' },
  { key: 'incons',   label: 'Inconsistent Player', kpiBand: 'lo',  s360Band: 'mid', color: '#ea580c' },
  { key: 'under',    label: 'Underperformer',      kpiBand: 'lo',  s360Band: 'lo',  color: '#dc2626' },
];

export function talentBoxOf(kpi: number, s360: number): TalentBox | null {
  return TALENT_BOXES.find((b) => b.kpiBand === kpiBandOf(kpi) && b.s360Band === s360BandOf(s360)) ?? null;
}

export type PlayerClass = 'A' | 'B_CULTURE' | 'B_KPI' | 'C';

export const PLAYER_BOXES: { key: PlayerClass; label: string; color: string }[] = [
  { key: 'A',         label: 'A Player',                color: '#059669' },
  { key: 'B_CULTURE', label: 'B Player (High Culture)', color: '#2563eb' },
  { key: 'B_KPI',     label: 'B Player (High KPI)',     color: '#4f46e5' },
  { key: 'C',         label: 'C Player',                color: '#dc2626' },
];

/** Label penuh kelas pemain (untuk badge/ekspor). */
export const playerLabelOf = (p: PlayerClass | null): string =>
  PLAYER_BOXES.find((b) => b.key === p)?.label ?? '';

/**
 * 4-Box A/B/C berbasis KPI (rerata) × 360° LANGSUNG, ambang 80 — bukan Skor Akhir.
 * Mengikuti rumus:
 *   keduanya kosong            → null (tak terklasifikasi)
 *   KPI ≥80 & 360 ≥80          → A Player
 *   KPI <80 & 360 ≥80          → B Player (High Culture)
 *   KPI ≥80 & 360 <80          → B Player (High KPI)
 *   selain itu (keduanya <80)  → C Player
 * Nilai hilang (null) diperlakukan sebagai DI BAWAH 80 — kecuali KEDUANYA kosong (→ null).
 * Tidak ada D Player. (360 nonaktif → s360 null → otomatis jatuh ke B-KPI / C.)
 */
export function playerClassOf(kpi: number | null, s360: number | null): PlayerClass | null {
  if (kpi == null && s360 == null) return null;
  const k = kpi ?? -1;
  const s = s360 ?? -1;
  if (k >= 80 && s >= 80) return 'A';
  if (k < 80 && s >= 80) return 'B_CULTURE';
  if (k >= 80 && s < 80) return 'B_KPI';
  return 'C';
}

/**
 * SATU klasifikasi kinerja terpadu (dipakai di seluruh aplikasi — dashboard, rekap, ekspor).
 * Ambang skor (0–100): ≥90 Melampaui · 80–89,99 Memenuhi · 70–79,99 Perlu Peningkatan · <70 Di Bawah.
 * Hindari label lain (Sangat Baik/Baik/Cukup/Kurang) agar tak membingungkan.
 */
export type PerfCategory = 'exceed' | 'meet' | 'improve' | 'below';

export const PERF_LABEL: Record<PerfCategory, string> = {
  exceed: 'Melampaui Ekspektasi',
  meet: 'Memenuhi Ekspektasi',
  improve: 'Perlu Peningkatan',
  below: 'Di Bawah Ekspektasi',
};

export function perfCategoryOf(score: number | null): PerfCategory | null {
  if (score == null) return null;
  if (score >= 90) return 'exceed';
  if (score >= 80) return 'meet';
  if (score >= 70) return 'improve';
  return 'below';
}

/** Label klasifikasi dari skor (—  bila null). */
export const perfLabelOf = (score: number | null): string => {
  const c = perfCategoryOf(score);
  return c ? PERF_LABEL[c] : '—';
};

/** Skor Akhir = blend KPI+360 (50/50) bila 360 aktif & ada; jika tidak = KPI murni. Lalu − penalty (min 0). */
export function finalScoreOf(
  kpiAvg: number | null,
  s360: number | null,
  has360: boolean,
  penalty: number,
): number | null {
  if (kpiAvg == null) return null;
  let base: number;
  if (!has360 || s360 == null) base = kpiAvg;
  else base = kpiAvg * 0.5 + s360 * 0.5;
  return Math.max(0, base - penalty);
}
