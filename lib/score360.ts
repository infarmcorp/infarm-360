/**
 * Logika murni kalkulasi Skor 360° terbobot — dipakai Server Action
 * `computeResult360` (app/(app)/admin/360/actions.ts). Dipisah agar bisa diuji unit
 * tanpa DB. Rumus mengikuti SPA legacy: rata-rata rating per penilai ×20, dikelompokkan
 * per kelas (Atasan/Peer/Cross/Bawahan/Self), Self DIKECUALIKAN dari total resmi,
 * lalu dibobot sesuai weight_scheme aktif (4class / 2class).
 */
import type { RelationKind, WeightValues } from '@/lib/database.types';

export type Class360 = 'atasan' | 'peer' | 'cross' | 'bawahan' | 'self';
export type Groups360 = { atasan: number[]; peer: number[]; cross: number[]; bawahan: number[]; self: number[] };

/** Pemetaan relasi mapping → kelas bobot. Cross & Bawahan terpisah; selain itu Peer. */
export const classOf = (rel: RelationKind): Class360 => {
  if (rel === 'Atasan') return 'atasan';
  if (rel === 'Cross') return 'cross';
  if (rel === 'Bawahan') return 'bawahan';
  if (rel === 'Self') return 'self';
  return 'peer';
};

export const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Skor 360° terbobot satu pegawai dari grup skor (skala 0–100, sudah ×20) per kelas.
 * - 4class: rata-rata tertimbang Atasan/Peer/Cross/Bawahan (kelas tanpa data diabaikan,
 *   bobot dinormalisasi ke kelas yang ada). Self DIKECUALIKAN.
 * - 2class: Atasan vs Internal (gabungan Peer+Cross+Bawahan; internal = rerata semua
 *   skornya, bukan rerata-dari-rerata). Bila salah satu sisi kosong → pakai sisi lain.
 * Mengembalikan skor mentah (belum dibulatkan) atau null bila tak ada data terbobot.
 */
export function weightedScore360(g: Groups360, model: '4class' | '2class', w: WeightValues): number | null {
  const aAvg = avg(g.atasan), pAvg = avg(g.peer), cAvg = avg(g.cross), bAvg = avg(g.bawahan);

  if (model === '4class') {
    const parts: [number | null, number][] = [
      [aAvg, w.atasan ?? 0],
      [pAvg, w.peer ?? 0],
      [cAvg, w.cross ?? 0],
      [bAvg, w.bawahan ?? 0],
      // self DIKECUALIKAN dari total resmi
    ];
    let wSum = 0, tW = 0;
    for (const [val, wt] of parts) if (val != null) { wSum += val * wt; tW += wt; }
    return tW > 0 ? wSum / tW : null;
  }

  // 2class: Atasan vs Internal (peer+cross+bawahan).
  const internal = avg([...g.peer, ...g.cross, ...g.bawahan]);
  const wA = w.atasan ?? 0, wI = w.internal ?? 0;
  if (aAvg != null && internal != null && wA + wI > 0) return (aAvg * wA + internal * wI) / (wA + wI);
  if (aAvg != null) return aAvg;
  if (internal != null) return internal;
  return null;
}
