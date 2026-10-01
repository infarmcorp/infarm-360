import { describe, it, expect } from 'vitest';
import {
  kpiBandOf, s360BandOf, talentBoxOf, playerClassOf, playerLabelOf, finalScoreOf, roundScore, kpiAvgOf, displayedFinalOf, perfCategoryOf, fmt2,
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
  it('BR-11: satu sumbu kosong → HRD Review (tak dianggap <80)', () => {
    expect(playerClassOf(85, null)).toBe('HRD_REVIEW'); // contoh HRD Decision: KPI 85, 360 No Score
    expect(playerClassOf(70, null)).toBe('HRD_REVIEW');
    expect(playerClassOf(null, 90)).toBe('HRD_REVIEW'); // KPI kosong pun HRD Review
    expect(playerClassOf(null, 70)).toBe('HRD_REVIEW');
    expect(playerLabelOf('HRD_REVIEW')).toBe('HRD Review');
  });
});

describe('finalScoreOf — Skor Akhir resmi (satu rumus semua halaman), 2 desimal', () => {
  it('KPI & 360 ada → rerata 50/50', () => {
    expect(finalScoreOf(80, 90, true)).toBe(85);
  });
  it('360 nonaktif → 100% KPI (s360 diabaikan)', () => {
    expect(finalScoreOf(80, 90, false)).toBe(80);
  });
  it('360 aktif tapi s360 null → 100% KPI', () => {
    expect(finalScoreOf(80, null, true)).toBe(80);
  });
  it('KPI kosong + 360 ada → 360° saja (mis. Direksi) — berlaku di semua halaman', () => {
    expect(finalScoreOf(null, 90, true)).toBe(90);
  });
  it('tak ada dasar skor → null', () => {
    expect(finalScoreOf(null, null, true)).toBeNull();
    expect(finalScoreOf(null, 90, false)).toBeNull(); // 360 nonaktif & KPI kosong
  });
  it('dibulatkan 2 desimal SEBELUM dipakai klasifikasi (batas 80)', () => {
    expect(finalScoreOf(79.99, 80, true)).toBe(80);     // 79.995 → 80.00 (sama dgn numeric(5,2))
    expect(finalScoreOf(79.98, 80, true)).toBe(79.99);
    expect(finalScoreOf(85.333333, null, true)).toBe(85.33);
  });
});

describe('roundScore — pembulatan 2 desimal selaras numeric(5,2) Postgres', () => {
  it('setengah dibulatkan ke atas (atas angka desimal, bukan galat biner)', () => {
    expect(roundScore(79.995)).toBe(80);
    expect(roundScore(1.005)).toBe(1.01);
    expect(roundScore(12.344)).toBe(12.34);
    expect(roundScore(12.345)).toBe(12.35);
    expect(roundScore(80)).toBe(80);
    expect(roundScore(0)).toBe(0);
  });
  it('null tetap null', () => {
    expect(roundScore(null)).toBeNull();
  });
});

describe('kpiAvgOf — satu definisi rerata KPI kuartal', () => {
  it('rata-rata bulan terisi; kosong tak dihitung; 0 = nilai sungguhan', () => {
    expect(kpiAvgOf([80, 90, null])).toBe(85);
    expect(kpiAvgOf([null, null, 85])).toBe(85);
    expect(kpiAvgOf([0, 90, 90])).toBe(60);
  });
  it('presisi penuh (pembulatan hanya di akhir — tak menggeser Skor Akhir tersimpan)', () => {
    expect(kpiAvgOf([100, 90, 90])).toBeCloseTo(93.3333, 4);
    // KPI 77.0667 & 360 77 → Skor Akhir 77.03 (dari presisi penuh), BUKAN 77.04 (dari KPI terbulat 77.07).
    expect(finalScoreOf(kpiAvgOf([77.2, 77, 77]), 77, true)).toBe(77.03);
  });
  it('tak ada bulan terisi → null', () => {
    expect(kpiAvgOf([null, null, null])).toBeNull();
    expect(kpiAvgOf([])).toBeNull();
  });
});

describe('klasifikasi memakai nilai TERBULAT (kategori = angka yang tampil)', () => {
  it('KPI 79.9966 (tampil 80.00) → dianggap ≥ 80', () => {
    const k = kpiAvgOf([80, 80, 79.99])!;          // 79.99666…
    expect(playerClassOf(k, 85)).toBe('A');
    expect(kpiBandOf(k)).toBe('mid');
    expect(perfCategoryOf(k)).toBe('meet');
  });
  it('79.994 (tampil 79.99) tetap < 80', () => {
    expect(playerClassOf(79.994, 85)).toBe('B_CULTURE');
    expect(perfCategoryOf(79.994)).toBe('improve');
    expect(s360BandOf(69.996)).toBe('mid');       // tampil 70.00 → mid
  });
});

describe('displayedFinalOf — angka Skor Akhir yang ditampilkan (opsi 1)', () => {
  it('laporan FINAL → angka tersimpan (yang dilihat pegawai)', () => {
    expect(displayedFinalOf(90, { status: 'finalized', final_score: 85 })).toBe(85);
  });
  it('laporan belum final / tanpa laporan → angka hidup', () => {
    expect(displayedFinalOf(90, { status: 'in_review', final_score: 85 })).toBe(90);
    expect(displayedFinalOf(90, { status: 'draft', final_score: 85 })).toBe(90);
    expect(displayedFinalOf(90, null)).toBe(90);
    expect(displayedFinalOf(null, undefined)).toBeNull();
  });
  it('final tapi final_score kosong → angka hidup', () => {
    expect(displayedFinalOf(90, { status: 'finalized', final_score: null })).toBe(90);
  });
});

describe('fmt2 — tampilan 2 desimal selaras klasifikasi', () => {
  it('84.925 tampil "84.93" (toFixed bawaan memberi "84.92" akibat galat biner)', () => {
    expect((84.925).toFixed(2)).toBe('84.92'); // perilaku bawaan yang keliru
    expect(fmt2(84.925)).toBe('84.93');
    expect(fmt2(1.005)).toBe('1.01');
    expect(fmt2(79.995)).toBe('80.00');
    expect(fmt2(80)).toBe('80.00');
    expect(fmt2(85.333333)).toBe('85.33');
  });
});
