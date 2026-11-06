import { describe, it, expect } from 'vitest';
import { perfCategoryOf } from '@/lib/scoring';
import { CAT_COLOR } from '@/components/infarm-ui';
import { SCORE_CATS, bandScoreStyle } from '@/app/(app)/admin/dashboard/dashboard-visual';
import { catOf } from '@/app/(app)/monitor/dist-bars';

// Grafik Dashboard & Monitor memakai golongan yang SAMA dengan laporan (perfCategoryOf: ambang atas
// nilai TERBULAT). Dulu dihitung dari rerata mentah → 79,996 (tampil 80,00 "Memenuhi") masuk
// irisan "Perlu Peningkatan".
const BOUNDARY = [69.994, 69.995, 69.999, 70, 79.994, 79.995, 79.996, 79.999, 80, 89.994, 89.995, 89.999, 90, 0, 100, 55.5, 85.25];
const scoreCat = (v: number) => SCORE_CATS.find((c) => c.test(v))!.key;

describe('Kategori grafik = kategori laporan (termasuk nilai tepat di batas)', () => {
  it.each(BOUNDARY)('donut Dashboard (SCORE_CATS) — %s', (v) => {
    expect(scoreCat(v)).toBe(perfCategoryOf(v));
    expect(SCORE_CATS.filter((c) => c.test(v))).toHaveLength(1); // tepat satu irisan
  });

  it.each(BOUNDARY)('batang distribusi Monitor (dist-bars) — %s', (v) => {
    expect(catOf(v)).toBe(perfCategoryOf(v));
  });

  it('contoh nyata: 79,996 → "Memenuhi", 89,995 → "Melampaui", 69,994 → "Di Bawah"', () => {
    expect(scoreCat(79.996)).toBe('meet');
    expect(catOf(89.995)).toBe('exceed');
    expect(scoreCat(69.994)).toBe('below');
  });
});

describe('Warna angka peringkat Dashboard: dari nilai terbulat yang sama & cocok dengan keterangannya', () => {
  it.each(BOUNDARY)('%s', (v) => {
    const cat = perfCategoryOf(v)!;
    expect(bandScoreStyle(v)?.backgroundColor).toBe(CAT_COLOR[cat]);
    // warna keterangan (SCORE_CATS) = warna angka
    expect(SCORE_CATS.find((c) => c.key === cat)?.color).toBe(bandScoreStyle(v)?.backgroundColor);
  });
  it('null → tanpa warna', () => expect(bandScoreStyle(null)).toBeNull());
});
