/**
 * Fungsi skoring murni — dipakai Dashboard HRD (data Supabase).
 * Rumus identik dengan SPA legacy (blend KPI+360 − punishment, klasifikasi 9-Box/4-Box).
 */
export type Band = 'hi' | 'mid' | 'lo';

// Semua ambang dicek atas nilai TERBULAT 2 desimal (roundScore) — kategori = angka yang tampil.
export const kpiBandOf = (k: number): Band => { const v = roundScore(k); return v >= 90 ? 'hi' : v >= 80 ? 'mid' : 'lo'; };
export const s360BandOf = (s: number): Band => { const v = roundScore(s); return v >= 80 ? 'hi' : v >= 70 ? 'mid' : 'lo'; };

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
  const k = kpi != null ? roundScore(kpi) : -1; // ambang atas nilai terbulat (= yang tampil)
  const s = s360 != null ? roundScore(s360) : -1;
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
  const v = roundScore(score); // ambang atas nilai terbulat (= yang tampil)
  if (v >= 90) return 'exceed';
  if (v >= 80) return 'meet';
  if (v >= 70) return 'improve';
  return 'below';
}

/** Label klasifikasi dari skor (—  bila null). */
export const perfLabelOf = (score: number | null): string => {
  const c = perfCategoryOf(score);
  return c ? PERF_LABEL[c] : '—';
};

/**
 * Pembulatan skor ke 2 desimal, SAMA dengan cara database menyimpan `numeric(5,2)` (setengah
 * dibulatkan menjauhi nol, atas representasi desimal angka). Memakai notasi eksponen string agar
 * 79.995 → 80 (bukan 79.99 akibat galat biner `79.995*100 = 7999.4999…`). Null tetap null.
 * WAJIB dipakai sebelum klasifikasi (ambang 70/80/90) agar kategori = angka yang TAMPIL/TERSIMPAN.
 */
export function roundScore(n: number): number;
export function roundScore(n: number | null): number | null;
export function roundScore(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return n;
  const sign = n < 0 ? -1 : 1;
  return sign * Number(Math.round(Number(`${Math.abs(n)}e2`)) + 'e-2');
}

/**
 * SATU definisi rerata KPI (per pegawai per kuartal): rata-rata bulan yang TERISI. Bulan kosong
 * (null/undefined) tidak dihitung; angka 0 = nilai sungguhan (ikut dihitung). Tak ada bulan → null.
 * SENGAJA presisi penuh (tak dibulatkan): pembulatan hanya di AKHIR (Skor Akhir di finalScoreOf) &
 * saat klasifikasi (ambang dicek atas nilai terbulat) — hindari pembulatan bertingkat yang menggeser
 * Skor Akhir 0.01 dari angka yang sudah tersimpan/difinalisasi.
 */
export function kpiAvgOf(months: (number | null | undefined)[]): number | null {
  const vals = months.filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Skor Akhir RESMI (satu rumus untuk SEMUA halaman), dibulatkan 2 desimal:
 *  - KPI & 360° ada (360 aktif)          → KPI×0.5 + 360×0.5
 *  - KPI ada, 360° nonaktif/kosong       → KPI
 *  - KPI kosong, 360° aktif & ada        → 360° saja (keputusan HRD 2026-09-29, mis. Direksi)
 *  - selain itu                          → null
 * Lalu − punishment kepatuhan kuartal, lantai 0.
 */
export function finalScoreOf(
  kpiAvg: number | null,
  s360: number | null,
  has360: boolean,
  penalty: number,
): number | null {
  const s = has360 ? s360 : null;
  let base: number;
  if (kpiAvg != null && s != null) base = kpiAvg * 0.5 + s * 0.5;
  else if (kpiAvg != null) base = kpiAvg;
  else if (s != null) base = s;
  else return null;
  return roundScore(Math.max(0, base - penalty));
}

/**
 * Skor Akhir yang DITAMPILKAN di semua halaman (keputusan HRD 2026-09-29, "opsi 1"): bila laporan
 * pegawai sudah FINAL → angka TERSIMPAN (`final_reports.final_score`, yang juga dilihat pegawai);
 * selain itu → angka hidup (`live`). Hanya Review Hasil Akhir yang menampilkan selisihnya
 * ("berubah → N") agar HRD bisa memutuskan finalisasi ulang — deteksi selisihnya = `hasScoreDrift`
 * (beda ≥ 0.01 setelah pembulatan; satu definisi untuk badge, pengingat sidebar, & Finalisasi Ulang).
 */
export function hasScoreDrift(live: number | null, stored: number | null): boolean {
  return live != null && stored != null && roundScore(live) !== roundScore(Number(stored));
}

export function displayedFinalOf(
  live: number | null,
  report: { status: string | null; final_score: number | null } | null | undefined,
): number | null {
  if (report?.status === 'finalized' && report.final_score != null) return Number(report.final_score);
  return live;
}
