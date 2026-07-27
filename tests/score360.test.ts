import { describe, it, expect } from 'vitest';
import { classOf, avg, round2, weightedScore360, resolveWeightScheme, type Groups360, type WeightScheme } from '@/lib/score360';

const G = (g: Partial<Groups360>): Groups360 => ({ atasan: [], peer: [], cross: [], bawahan: [], self: [], ...g });

describe('classOf — relasi → kelas bobot', () => {
  it('memetakan tiap relasi', () => {
    expect(classOf('Atasan')).toBe('atasan');
    expect(classOf('Cross')).toBe('cross');
    expect(classOf('Bawahan')).toBe('bawahan');
    expect(classOf('Self')).toBe('self');
    expect(classOf('Peer')).toBe('peer');
  });
});

describe('avg & round2', () => {
  it('avg kosong → null, lainnya rerata', () => {
    expect(avg([])).toBeNull();
    expect(avg([2, 4])).toBe(3);
  });
  it('round2 membulatkan 2 desimal', () => {
    expect(round2(12.344)).toBe(12.34);
    expect(round2(12.345)).toBe(12.35);
    expect(round2(80)).toBe(80);
  });
});

describe('weightedScore360 — model 4class (Atasan/Peer/Cross/Bawahan, Self dikecualikan)', () => {
  const W = { atasan: 40, peer: 30, cross: 20, bawahan: 10 };

  it('semua kelas hadir → rerata tertimbang penuh', () => {
    const g = G({ atasan: [90], peer: [80], cross: [70], bawahan: [60] });
    // 90*40 + 80*30 + 70*20 + 60*10 = 8000 ; total bobot 100 → 80
    expect(weightedScore360(g, '4class', W)).toBeCloseTo(80, 10);
  });

  it('kelas Bawahan diperhitungkan & dinormalisasi saat kelas lain kosong', () => {
    const g = G({ bawahan: [80] });
    expect(weightedScore360(g, '4class', W)).toBeCloseTo(80, 10); // hanya bawahan → 80
  });

  it('Self DIKECUALIKAN dari total (tak mengubah skor)', () => {
    const base = G({ atasan: [90], peer: [80], cross: [70], bawahan: [60] });
    const withSelf = G({ atasan: [90], peer: [80], cross: [70], bawahan: [60], self: [100] });
    expect(weightedScore360(withSelf, '4class', W)).toBe(weightedScore360(base, '4class', W));
  });

  it('kelas tanpa data diabaikan & bobot dinormalisasi ke kelas yang ada', () => {
    const g = G({ atasan: [90], peer: [70] }); // hanya atasan(40) & peer(30)
    // (90*40 + 70*30) / 70 = 5700/70 ≈ 81.4286
    expect(weightedScore360(g, '4class', W)).toBeCloseTo(81.4286, 3);
  });

  it('rerata per penilai dalam satu kelas', () => {
    const g = G({ atasan: [80, 100] }); // rerata atasan = 90 → skor 90
    expect(weightedScore360(g, '4class', W)).toBeCloseTo(90, 10);
  });

  it('tanpa data sama sekali → null', () => {
    expect(weightedScore360(G({}), '4class', W)).toBeNull();
  });
});

describe('weightedScore360 — model 2class (Atasan vs Internal = Peer+Cross+Bawahan)', () => {
  const W = { atasan: 60, internal: 40 };

  it('Internal = rerata SEMUA skor peer+cross+bawahan (bukan rerata-dari-rerata)', () => {
    const g = G({ atasan: [90], peer: [80, 80], cross: [20] });
    // internal = avg(80,80,20) = 60 (bukan avg(80,20)=50)
    // (90*60 + 60*40) / 100 = 78
    expect(weightedScore360(g, '2class', W)).toBeCloseTo(78, 10);
  });

  it('Bawahan termasuk dalam Internal', () => {
    const g = G({ atasan: [90], bawahan: [50] });
    // internal = 50 → (90*60 + 50*40)/100 = 74
    expect(weightedScore360(g, '2class', W)).toBeCloseTo(74, 10);
  });

  it('hanya Atasan (internal kosong) → skor = rerata atasan', () => {
    expect(weightedScore360(G({ atasan: [88] }), '2class', W)).toBeCloseTo(88, 10);
  });

  it('hanya Internal (atasan kosong) → skor = internal', () => {
    const g = G({ peer: [70], cross: [80] }); // internal = 75
    expect(weightedScore360(g, '2class', W)).toBeCloseTo(75, 10);
  });

  it('tanpa data → null', () => {
    expect(weightedScore360(G({}), '2class', W)).toBeNull();
  });
});

describe('resolveWeightScheme — pilih bobot per pegawai (override khusus vs default periode)', () => {
  const def: WeightScheme = { model: '4class', weights: { atasan: 40, peer: 25, cross: 15, bawahan: 20 } };
  const ovr: WeightScheme = { model: '2class', weights: { atasan: 70, internal: 30 } };

  it('override ADA → pakai override (model & weights)', () => {
    expect(resolveWeightScheme(def, ovr)).toBe(ovr);
  });
  it('override null/undefined → pakai default periode', () => {
    expect(resolveWeightScheme(def, null)).toBe(def);
    expect(resolveWeightScheme(def, undefined)).toBe(def);
  });
  it('skor akhir ikut skema terpilih (override 2class vs default 4class) untuk grup sama', () => {
    const g = G({ atasan: [90], peer: [80, 80], cross: [20], bawahan: [50] });
    const chosen = resolveWeightScheme(def, ovr);
    // 2class: internal = avg(80,80,20,50)=57.5 → (90*70 + 57.5*30)/100 = 80.25
    expect(weightedScore360(g, chosen.model, chosen.weights)).toBeCloseTo(80.25, 10);
  });
});
