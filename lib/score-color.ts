/**
 * Palet warna skor terpadu — dipakai lintas dashboard & monitor agar konsisten.
 *
 * Gradasi mulus (interpolasi linier RGB) antar 4 jangkar:
 *   ≤70 #b71c1c (merah) · 80 #ffc107 (kuning) · 90 #388e3c (hijau) · ≥97.5 #183c6c (biru tua).
 * Nilai di antara jangkar dicampur proporsional; di luar rentang di-clamp ke ujung terdekat.
 * Warna teks dipilih per-luminance sel (gelap di sel terang spt. kuning, putih di sel pekat)
 * agar nilai tetap terbaca — selaras audit kontras WCAG.
 *
 * Murni visual — tak ada kaitan dengan rumus skor (lihat lib/scoring.ts).
 */
const HEAT_STOPS: { v: number; rgb: [number, number, number] }[] = [
  { v: 70, rgb: [183, 28, 28] },   // #b71c1c
  { v: 80, rgb: [255, 193, 7] },   // #ffc107
  { v: 90, rgb: [56, 142, 60] },   // #388e3c
  { v: 97.5, rgb: [24, 60, 108] }, // #183c6c
];

/**
 * Varian Design System Infarm (Dashboard Organisasi, 2026-11-03): jangkar SAMA, hanya ujung atas
 * biru tua diganti cokelat tanah #6b4e3d (keputusan pengguna). Halaman lain tetap `heatColor`.
 */
const HEAT_STOPS_INFARM: typeof HEAT_STOPS = [
  ...HEAT_STOPS.slice(0, 3),
  { v: 97.5, rgb: [107, 78, 61] }, // #6b4e3d
];

export function heatColor(v: number | null): { bg: string; fg: string } {
  return heatColorWith(v, HEAT_STOPS);
}

export function heatColorInfarm(v: number | null): { bg: string; fg: string } {
  // Sel kosong = token neutral-tint / ink-soft (bukan abu bawaan Tailwind).
  if (v == null) return { bg: '#eeefec', fg: '#5b615c' };
  return heatColorWith(v, HEAT_STOPS_INFARM);
}

function heatColorWith(v: number | null, stops: typeof HEAT_STOPS): { bg: string; fg: string } {
  if (v == null) return { bg: '#f9fafb', fg: '#9ca3af' };
  const last = stops.length - 1;
  let rgb: [number, number, number];
  if (v <= stops[0].v) rgb = stops[0].rgb;
  else if (v >= stops[last].v) rgb = stops[last].rgb;
  else {
    let i = 0;
    while (v > stops[i + 1].v) i++;
    const a = stops[i], b = stops[i + 1];
    const t = (v - a.v) / (b.v - a.v);
    rgb = [
      Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
      Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
      Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
    ];
  }
  // Luminance perseptual (0–255): teks gelap bila sel terang (mis. di sekitar kuning).
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const fg = lum > 150 ? '#1f2937' : '#ffffff';
  return { bg: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, fg };
}

/** Gradien CSS legend (kiri→kanan) yang merepresentasikan jangkar palet. */
export const HEAT_LEGEND_GRADIENT =
  'linear-gradient(to right, #b71c1c 0%, #ffc107 36%, #388e3c 73%, #183c6c 100%)';
export const HEAT_LEGEND_GRADIENT_INFARM =
  'linear-gradient(to right, #b71c1c 0%, #ffc107 36%, #388e3c 73%, #6b4e3d 100%)';
