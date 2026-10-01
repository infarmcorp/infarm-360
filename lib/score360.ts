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
 * - 2class_auto (BR-10, Q3 2026 dst.): sama dgn 2class, tetapi bobot dari `autoWeights2class`
 *   menurut jumlah penilai internal (40/60 atau 60/40), bukan isian HRD.
 * Mengembalikan skor mentah (belum dibulatkan) atau null bila tak ada data terbobot.
 */
/**
 * Model bobot. '4class'/'2class' = model yang tersimpan di DB (dipilih HRD per periode).
 * '2class_auto' = model 2 kelas dengan bobot OTOMATIS BR-10 (Q3 2026 dst., lihat `effectiveModel`) —
 * tak pernah disimpan di DB, hanya hasil terjemahan di sisi kode.
 */
export type Model360 = '4class' | '2class' | '2class_auto';

/** Satu skema bobot (model + nilai). Dipakai untuk memilih bobot per pegawai. */
export type WeightScheme = { model: Model360; weights: WeightValues };

/**
 * BR-10 (Q3 2026, keputusan HRD 2026-10-01): periode yang MULAI pada/sesudah tanggal ini dan memakai
 * model 2 kelas → bobot Atasan/Internal OTOMATIS sesuai jumlah penilai internal (isian % HRD diabaikan).
 * Q1–Q2 2026 tetap memakai bobot tersimpan agar skor final lama tak bergeser.
 */
export const AUTO_WEIGHT_FROM = '2026-07-01';

/** Terjemahkan model skema PERIODE (dari DB) ke model efektif. 4 kelas tak tersentuh. */
export function effectiveModel(model: Model360, periodStart: string | null | undefined): Model360 {
  if (model === '2class' && !!periodStart && String(periodStart).slice(0, 10) >= AUTO_WEIGHT_FROM) return '2class_auto';
  return model;
}

/**
 * Bobot otomatis BR-10 bila ADA Atasan dan ada penilai Internal (dihitung PER ORANG yang mengirim):
 * ≥2 Internal → Atasan 40 / Internal 60 · tepat 1 Internal → Atasan 60 / Internal 40.
 * (Hanya Atasan → 100% Atasan; hanya Internal → 100% Internal — ditangani di weightedScore360.)
 */
export function autoWeights2class(nInternal: number): { atasan: number; internal: number } {
  return nInternal >= 2 ? { atasan: 40, internal: 60 } : { atasan: 60, internal: 40 };
}

/**
 * Pilih skema bobot untuk seorang pegawai: pakai OVERRIDE khusus bila ada (migrasi 0031
 * employee_weight_overrides), else skema DEFAULT periode (weight_schemes). Rumus tak berubah —
 * hanya memilih model+weights mana yang disuapkan ke `weightedScore360`. Diuji tanpa DB.
 */
export function resolveWeightScheme(def: WeightScheme, override: WeightScheme | null | undefined): WeightScheme {
  return override ?? def;
}

/**
 * Skema efektif seorang pegawai di suatu periode: bobot KHUSUS (override) dipakai apa adanya
 * (keputusan 2026-10-01: tetap berlaku); selain itu skema periode dgn model diterjemahkan
 * `effectiveModel` (2 kelas Q3 dst. → bobot otomatis BR-10).
 */
export function schemeFor(def: WeightScheme, override: WeightScheme | null | undefined, periodStart: string | null | undefined): WeightScheme {
  if (override) return override;
  return { model: effectiveModel(def.model, periodStart), weights: def.weights };
}

export function weightedScore360(g: Groups360, model: Model360, w: WeightValues): number | null {
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

  // 2class: Atasan vs Internal (peer+cross+bawahan). Internal = rerata SEMUA penilai internal per orang
  // (tanpa dikelompokkan dulu per Peer/Cross/Bawahan). Satu entri grup = satu penilai yang mengirim.
  const internalScores = [...g.peer, ...g.cross, ...g.bawahan];
  const internal = avg(internalScores);
  const auto = model === '2class_auto' ? autoWeights2class(internalScores.length) : null;
  const wA = auto ? auto.atasan : (w.atasan ?? 0), wI = auto ? auto.internal : (w.internal ?? 0);
  if (aAvg != null && internal != null && wA + wI > 0) return (aAvg * wA + internal * wI) / (wA + wI);
  if (aAvg != null) return aAvg;
  if (internal != null) return internal;
  return null;
}
