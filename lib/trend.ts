/**
 * Trend KPI 3 bulan (Laporan Kinerja Tim). Input = skor KPI bulanan kuartal, urut kronologis
 * (bulan-1, bulan-2, bulan-3); nilai `null` = belum diisi (kosong), berbeda dari 0.
 *
 * Aturan (urut prioritas — sesuai definisi HRD):
 *  1. Bulan-1 kosong (null)            → 'empty'      (hasil dikosongkan)
 *  2. Bulan-1 = 0 DAN bulan-2 = 0      → 'unread'     ("Belum terbaca", belum ada pembacaan)
 *  3. |b1−b2| ≤ 2 DAN |b2−b3| ≤ 2      → 'stable'     ("Stabil", dalam toleransi) — dicek SEBELUM naik/turun
 *  4. b1 < b2 < b3                     → 'up'         ("Naik", konsisten 3 bulan)
 *  5. b1 > b2 > b3                     → 'down'       ("Turun", konsisten 3 bulan)
 *  6. selain itu                       → 'volatile'   ("Fluktuatif", tak berpola)
 *
 * Catatan: aturan 3–5 butuh ketiga bulan bernilai; bila bulan-2/3 belum terisi (mid-kuartal) →
 * jatuh ke 'volatile' sesuai catch-all (aturan 6). Bulan-1 kosong selalu 'empty' lebih dulu.
 */
export type Trend = 'empty' | 'unread' | 'stable' | 'up' | 'down' | 'volatile';

export function trendOf(months: (number | null)[]): Trend {
  const b1 = months[0] ?? null;
  const b2 = months[1] ?? null;
  const b3 = months[2] ?? null;
  if (b1 == null) return 'empty';
  if (b1 === 0 && b2 === 0) return 'unread';
  if (b2 != null && b3 != null) {
    if (Math.abs(b1 - b2) <= 2 && Math.abs(b2 - b3) <= 2) return 'stable';
    if (b1 < b2 && b2 < b3) return 'up';
    if (b1 > b2 && b2 > b3) return 'down';
  }
  return 'volatile';
}

/** Label + warna + panah per status trend (untuk badge). 'empty' tak ditampilkan (—). */
export const TREND_META: Record<Exclude<Trend, 'empty'>, { label: string; color: string; arrow: string }> = {
  unread:   { label: 'Belum terbaca', color: '#6b7280', arrow: '·' },
  stable:   { label: 'Stabil',        color: '#2563eb', arrow: '→' },
  up:       { label: 'Naik',          color: '#059669', arrow: '↗' },
  down:     { label: 'Turun',         color: '#dc2626', arrow: '↘' },
  volatile: { label: 'Fluktuatif',    color: '#d97706', arrow: '↕' },
};
