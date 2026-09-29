/**
 * Trend KPI 3 bulan (Laporan Kinerja Tim). Input = skor KPI bulanan kuartal, urut kronologis
 * (bulan-1, bulan-2, bulan-3); nilai `null` = KPI belum ditetapkan (KOSONG). Angka 0 = nilai
 * SUNGGUHAN (dihitung apa adanya), bukan penanda "belum ada data".
 *
 * Aturan (definisi HRD 2026-09-29) — ditentukan oleh JUMLAH bulan terisi:
 *  - 0 bulan terisi                    → 'empty'      (tak ada data, hasil dikosongkan)
 *  - 1 bulan terisi (2 bulan kosong)   → 'unread'     ("Belum terbaca" — mis. pegawai masuk bulan
 *                                                       ke-3, atau kuartal baru berjalan 1 bulan)
 *  - 2 bulan terisi (1 bulan kosong — di AWAL: pegawai baru; di AKHIR: resign / kuartal berjalan):
 *      |x−y| ≤ 2 → 'stable' · x < y → 'up' · x > y → 'down'   (x, y = dua bulan terisi, kronologis)
 *  - 3 bulan terisi:
 *      |b1−b2| ≤ 2 DAN |b2−b3| ≤ 2 → 'stable' (dicek SEBELUM naik/turun)
 *      b1 < b2 < b3 → 'up' · b1 > b2 > b3 → 'down' · selain itu → 'volatile' ("Fluktuatif")
 * Fluktuatif hanya mungkin bila ketiga bulan terisi.
 */
export type Trend = 'empty' | 'unread' | 'stable' | 'up' | 'down' | 'volatile';

/** Toleransi selisih antar-bulan yang masih dianggap "Stabil" (poin KPI). */
const STABLE_TOL = 2;

export function trendOf(months: (number | null)[]): Trend {
  const filled = [months[0], months[1], months[2]].filter((v): v is number => v != null);
  if (filled.length === 0) return 'empty';
  if (filled.length === 1) return 'unread';
  if (filled.length === 2) {
    const [x, y] = filled;
    if (Math.abs(x - y) <= STABLE_TOL) return 'stable';
    return x < y ? 'up' : 'down';
  }
  const [b1, b2, b3] = filled;
  if (Math.abs(b1 - b2) <= STABLE_TOL && Math.abs(b2 - b3) <= STABLE_TOL) return 'stable';
  if (b1 < b2 && b2 < b3) return 'up';
  if (b1 > b2 && b2 > b3) return 'down';
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
