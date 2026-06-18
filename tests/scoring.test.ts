import { describe, it, expect } from 'vitest';
import {
  kpiBandOf, s360BandOf, talentBoxOf, playerClassOf, finalScoreOf,
} from '@/lib/scoring';

describe('kpiBandOf — band KPI (≥90 hi · ≥80 mid · <80 lo)', () => {
  it('batas atas/bawah tepat', () => {
    expect(kpiBandOf(100)).toBe('hi');
    expect(kpiBandOf(90)).toBe('hi');
    expect(kpiBandOf(89.99)).toBe('mid');
    expect(kpiBandOf(80)).toBe('mid');
    expect(kpiBandOf(79.99)).toBe('lo');
    expect(kpiBandOf(0)).toBe('lo');
  });
});

describe('s360BandOf — band 360° (≥80 hi · ≥70 mid · <70 lo)', () => {
  it('batas atas/bawah tepat', () => {
    expect(s360BandOf(80)).toBe('hi');
    expect(s360BandOf(79.99)).toBe('mid');
    expect(s360BandOf(70)).toBe('mid');
    expect(s360BandOf(69.99)).toBe('lo');
    expect(s360BandOf(0)).toBe('lo');
  });
});

describe('talentBoxOf — 9-Box KPI×360', () => {
  it('memetakan tiap kombinasi band ke kotak yang benar', () => {
    expect(talentBoxOf(95, 85)?.key).toBe('star');     // hi×hi
    expect(talentBoxOf(95, 75)?.key).toBe('highperf');  // hi×mid
    expect(talentBoxOf(95, 60)?.key).toBe('expert');    // hi×lo
    expect(talentBoxOf(85, 85)?.key).toBe('highpot');   // mid×hi
    expect(talentBoxOf(85, 75)?.key).toBe('core');      // mid×mid
    expect(talentBoxOf(85, 60)?.key).toBe('align');     // mid×lo
    expect(talentBoxOf(50, 85)?.key).toBe('rough');     // lo×hi
    expect(talentBoxOf(50, 75)?.key).toBe('incons');    // lo×mid
    expect(talentBoxOf(50, 50)?.key).toBe('under');     // lo×lo
  });
});

describe('playerClassOf — 4-Box A/B/C/D (berbasis Skor Akhir)', () => {
  it('A hanya bila 360 aktif & final≥90 & kpi≥90 & 360≥80', () => {
    expect(playerClassOf(92, 92, 85, true)).toBe('A');
  });
  it('bukan A bila salah satu syarat gagal', () => {
    expect(playerClassOf(92, 88, 85, true)).toBe('B'); // kpi < 90
    expect(playerClassOf(92, 92, 79, true)).toBe('B'); // 360 < 80
    expect(playerClassOf(88, 92, 85, true)).toBe('B'); // final < 90
  });
  it('A nonaktif saat 360 tidak aktif (jatuh ke B walau angka tinggi)', () => {
    expect(playerClassOf(95, 95, 85, false)).toBe('B');
  });
  it('A nonaktif saat 360 null walau has360 true', () => {
    expect(playerClassOf(95, 95, null, true)).toBe('B');
  });
  it('ambang B/C/D', () => {
    expect(playerClassOf(80, 70, null, false)).toBe('B');
    expect(playerClassOf(79.99, 70, null, false)).toBe('C');
    expect(playerClassOf(70, 60, null, false)).toBe('C');
    expect(playerClassOf(69.99, 60, null, false)).toBe('D');
    expect(playerClassOf(0, 0, null, false)).toBe('D');
  });
});

describe('finalScoreOf — Skor Akhir = blend KPI+360 (50/50) − punishment, min 0', () => {
  it('KPI kosong → null', () => {
    expect(finalScoreOf(null, 90, true, 0)).toBeNull();
  });
  it('360 aktif & ada → rerata 50/50', () => {
    expect(finalScoreOf(80, 90, true, 0)).toBe(85);
  });
  it('360 nonaktif → 100% KPI (s360 diabaikan)', () => {
    expect(finalScoreOf(80, 90, false, 0)).toBe(80);
  });
  it('360 aktif tapi s360 null → 100% KPI', () => {
    expect(finalScoreOf(80, null, true, 0)).toBe(80);
  });
  it('punishment mengurangi skor', () => {
    expect(finalScoreOf(80, 90, true, 10)).toBe(75);
    expect(finalScoreOf(80, null, false, 5)).toBe(75);
  });
  it('punishment tak boleh membuat skor negatif (min 0)', () => {
    expect(finalScoreOf(10, 10, true, 50)).toBe(0);
  });
});
