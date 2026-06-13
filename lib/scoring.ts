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

export type PlayerClass = 'A' | 'B' | 'C' | 'D';

export const PLAYER_BOXES: { key: PlayerClass; label: string; color: string }[] = [
  { key: 'A', label: 'A Player', color: '#059669' },
  { key: 'B', label: 'B Player', color: '#2563eb' },
  { key: 'C', label: 'C Player', color: '#d97706' },
  { key: 'D', label: 'D Player', color: '#dc2626' },
];

/** A: final≥90 & kpi≥90 & 360≥80 (butuh 360 aktif) · B: ≥80 · C: ≥70 · D: <70. */
export function playerClassOf(final: number, kpi: number, s360: number | null, has360: boolean): PlayerClass {
  if (has360 && s360 != null && final >= 90 && kpi >= 90 && s360 >= 80) return 'A';
  if (final >= 80) return 'B';
  if (final >= 70) return 'C';
  return 'D';
}

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
