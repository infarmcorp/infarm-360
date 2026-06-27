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

describe('playerClassOf — 4-Box A/B-Culture/B-KPI/C (KPI × 360°, ambang 80, tanpa D)', () => {
  it('keduanya kosong → null', () => {
    expect(playerClassOf(null, null)).toBeNull();
  });
  it('A: KPI≥80 & 360≥80', () => {
    expect(playerClassOf(80, 80)).toBe('A');
    expect(playerClassOf(90, 85)).toBe('A');
    expect(playerClassOf(100, 100)).toBe('A');
  });
  it('B Player (High Culture): KPI<80 & 360≥80', () => {
    expect(playerClassOf(79.99, 80)).toBe('B_CULTURE');
    expect(playerClassOf(60, 95)).toBe('B_CULTURE');
  });
  it('B Player (High KPI): KPI≥80 & 360<80', () => {
    expect(playerClassOf(80, 79.99)).toBe('B_KPI');
    expect(playerClassOf(95, 60)).toBe('B_KPI');
  });
  it('C: keduanya <80', () => {
    expect(playerClassOf(79.99, 79.99)).toBe('C');
    expect(playerClassOf(50, 50)).toBe('C');
    expect(playerClassOf(0, 0)).toBe('C');
  });
  it('nilai hilang diperlakukan <80 (kecuali keduanya kosong)', () => {
    expect(playerClassOf(90, null)).toBe('B_KPI');     // KPI tinggi, 360 belum ada
    expect(playerClassOf(null, 90)).toBe('B_CULTURE');  // 360 tinggi, KPI belum ada
    expect(playerClassOf(70, null)).toBe('C');          // KPI rendah, 360 belum ada
    expect(playerClassOf(null, 70)).toBe('C');          // 360 rendah, KPI belum ada
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
