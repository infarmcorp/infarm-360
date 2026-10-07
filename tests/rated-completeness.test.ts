import { describe, it, expect } from 'vitest';
import { ratedCompletion, type RatedMapping } from '@/lib/rated-completeness';

const m = (assessor: string, target: string, over: Partial<RatedMapping> = {}): RatedMapping =>
  ({ assessor_id: assessor, target_id: target, mandatory: true, is_active: true, is_adhoc: false, ...over });
const pairs = (...xs: string[]) => new Set(xs);

describe('ratedCompletion — "Dinilai oleh" selaras Progress 360 (2026-10-08)', () => {
  it('menghitung penilai WAJIB yang sudah mengirim', () => {
    const r = ratedCompletion([m('a', 'T'), m('b', 'T'), m('c', 'T')], pairs('a|T', 'b|T'), pairs(), pairs());
    expect(r.total.get('T')).toBe(3);
    expect(r.done.get('T')).toBe(2);
  });

  it('opsional & ad-hoc tidak dihitung', () => {
    const r = ratedCompletion([m('a', 'T'), m('b', 'T', { mandatory: false }), m('c', 'T', { is_adhoc: true })], pairs('a|T'), pairs(), pairs());
    expect(r.total.get('T')).toBe(1);
    expect(r.done.get('T')).toBe(1);
  });

  it('pemetaan NONAKTIF (mis. penilai resign) tidak dihitung → 9/10 jadi 9/9', () => {
    const maps = [...Array.from({ length: 9 }, (_, i) => m(`a${i}`, 'T')), m('resign', 'T', { is_active: false })];
    const done = pairs(...Array.from({ length: 9 }, (_, i) => `a${i}|T`));
    const r = ratedCompletion(maps, done, pairs(), pairs());
    expect(r.total.get('T')).toBe(9);
    expect(r.done.get('T')).toBe(9);
  });

  it('pegawai yang DINILAI nonaktif (resign) → pemetaan nonaktifnya tetap dihitung', () => {
    const r = ratedCompletion([m('a', 'T', { is_active: false }), m('b', 'T', { is_active: false })], pairs('a|T'), pairs(), pairs('T'));
    expect(r.total.get('T')).toBe(2);
    expect(r.done.get('T')).toBe(1);
  });

  it('penilaian DIBATALKAN validitasnya → kewajiban gugur', () => {
    const r = ratedCompletion([m('a', 'T'), m('b', 'T')], pairs('a|T'), pairs('b|T'), pairs());
    expect(r.total.get('T')).toBe(1);
    expect(r.done.get('T')).toBe(1);
  });

  it('pegawai tanpa kewajiban tersisa → tidak ada entri', () => {
    const r = ratedCompletion([m('a', 'T', { is_active: false })], pairs(), pairs(), pairs());
    expect(r.total.has('T')).toBe(false);
  });
});
