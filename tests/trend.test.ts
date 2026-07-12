import { describe, it, expect } from 'vitest';
import { trendOf } from '@/lib/trend';

describe('trendOf — trend KPI 3 bulan', () => {
  it('bulan-1 kosong → empty (hasil dikosongkan)', () => {
    expect(trendOf([null, 80, 82])).toBe('empty');
    expect(trendOf([null, null, null])).toBe('empty');
    expect(trendOf([])).toBe('empty');
  });

  it('bulan-1 = 0 dan bulan-2 = 0 → unread (Belum terbaca)', () => {
    expect(trendOf([0, 0, 0])).toBe('unread');
    expect(trendOf([0, 0, 90])).toBe('unread');
  });

  it('selisih ≤ 2 di kedua sisi → stable (dicek sebelum naik/turun)', () => {
    expect(trendOf([80, 81, 82])).toBe('stable');   // naik tapi masih toleransi → Stabil
    expect(trendOf([82, 81, 80])).toBe('stable');   // turun tapi toleransi → Stabil
    expect(trendOf([80, 80, 80])).toBe('stable');
    expect(trendOf([80, 82, 80])).toBe('stable');
  });

  it('b1 < b2 < b3 dengan selisih > 2 → up (Naik)', () => {
    expect(trendOf([70, 80, 90])).toBe('up');
    expect(trendOf([60, 75, 78])).toBe('up'); // |75-78|=3 >2 → bukan stabil → naik
  });

  it('b1 > b2 > b3 dengan selisih > 2 → down (Turun)', () => {
    expect(trendOf([90, 80, 70])).toBe('down');
  });

  it('pola tak konsisten → volatile (Fluktuatif)', () => {
    expect(trendOf([70, 90, 75])).toBe('volatile'); // naik lalu turun
    expect(trendOf([90, 70, 85])).toBe('volatile'); // turun lalu naik
  });

  it('bulan-2/3 belum terisi (mid-kuartal) → volatile, kecuali bulan-1 kosong', () => {
    expect(trendOf([80, null, null])).toBe('volatile');
    expect(trendOf([80, 82, null])).toBe('volatile');
  });

  it('0 di bulan-1 tapi bulan-2 bukan 0 → tetap dievaluasi (bukan unread)', () => {
    expect(trendOf([0, 3, 6])).toBe('up'); // |0-3|=3, |3-6|=3 → naik konsisten
  });
});
