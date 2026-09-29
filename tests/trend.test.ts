import { describe, it, expect } from 'vitest';
import { trendOf } from '@/lib/trend';

describe('trendOf — trend KPI 3 bulan (kosong = belum ditetapkan, 0 = nilai sungguhan)', () => {
  it('ketiga bulan kosong → empty', () => {
    expect(trendOf([null, null, null])).toBe('empty');
    expect(trendOf([])).toBe('empty');
  });

  it('dua bulan kosong (1 bulan terisi) → unread (Belum terbaca)', () => {
    expect(trendOf([null, null, 85])).toBe('unread'); // pegawai masuk bulan ke-3
    expect(trendOf([80, null, null])).toBe('unread'); // kuartal baru berjalan 1 bulan
    expect(trendOf([null, null, 0])).toBe('unread');
  });

  it('angka 0 = nilai sungguhan, BUKAN belum terbaca', () => {
    expect(trendOf([0, 0, 0])).toBe('stable');
    expect(trendOf([0, 0, 90])).toBe('volatile'); // |0-0|≤2 tapi |0-90|>2, tak naik konsisten (0=0)
    expect(trendOf([0, 3, 6])).toBe('up');
    expect(trendOf([null, 0, 0])).toBe('stable');
  });

  describe('bulan-1 kosong (pegawai baru) → dinilai dari bulan-2 & bulan-3', () => {
    it('selisih ≤ 2 → stable', () => {
      expect(trendOf([null, 80, 82])).toBe('stable');
      expect(trendOf([null, 82, 80])).toBe('stable');
    });
    it('naik > 2 → up', () => {
      expect(trendOf([null, 80, 83])).toBe('up');
    });
    it('turun > 2 → down', () => {
      expect(trendOf([null, 90, 70])).toBe('down');
    });
  });

  describe('bulan-3 kosong (resign / kuartal berjalan) → dinilai dari bulan-1 & bulan-2', () => {
    it('selisih ≤ 2 → stable', () => {
      expect(trendOf([80, 82, null])).toBe('stable');
    });
    it('naik > 2 → up', () => {
      expect(trendOf([70, 80, null])).toBe('up');
    });
    it('turun > 2 → down', () => {
      expect(trendOf([90, 80, null])).toBe('down');
    });
  });

  describe('ketiga bulan terisi', () => {
    it('selisih ≤ 2 di kedua sisi → stable (dicek sebelum naik/turun)', () => {
      expect(trendOf([80, 81, 82])).toBe('stable');
      expect(trendOf([82, 81, 80])).toBe('stable');
      expect(trendOf([80, 80, 80])).toBe('stable');
      expect(trendOf([80, 82, 80])).toBe('stable');
    });

    it('b1 < b2 < b3 dengan selisih > 2 → up', () => {
      expect(trendOf([70, 80, 90])).toBe('up');
      expect(trendOf([60, 75, 78])).toBe('up'); // |75-78|=3 >2 → bukan stabil → naik
    });

    it('b1 > b2 > b3 dengan selisih > 2 → down', () => {
      expect(trendOf([90, 80, 70])).toBe('down');
    });

    it('pola tak konsisten → volatile (hanya mungkin bila 3 bulan terisi)', () => {
      expect(trendOf([70, 90, 75])).toBe('volatile');
      expect(trendOf([90, 70, 85])).toBe('volatile');
    });
  });
});
