import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { inSpvDivisionScope, withoutRaw, reportForGrantViewer, type ReportData } from '@/lib/report';

describe('inSpvDivisionScope — SPV meninjau seluruh divisinya (2026-10-07)', () => {
  const me = { dept: 'Sales' };
  it('sedivisi (termasuk koordinator & timnya) → boleh', () => {
    expect(inSpvDivisionScope(me, { dept: 'Sales', role: 'employee' })).toBe(true);
    expect(inSpvDivisionScope(me, { dept: 'Sales', role: 'spv' })).toBe(true);
  });
  it('beda divisi → ditolak', () => {
    expect(inSpvDivisionScope(me, { dept: 'Finance', role: 'employee' })).toBe(false);
  });
  it('Direksi → ditolak walau sedivisi', () => {
    expect(inSpvDivisionScope(me, { dept: 'Sales', role: 'direksi' })).toBe(false);
  });
  it('fail-closed bila divisi pelaku/target kosong', () => {
    expect(inSpvDivisionScope({ dept: null }, { dept: null, role: 'employee' })).toBe(false);
    expect(inSpvDivisionScope(me, null)).toBe(false);
    expect(inSpvDivisionScope(null, { dept: 'Sales', role: 'employee' })).toBe(false);
  });
});

describe('withoutRaw — laporan diri sendiri tanpa umpan balik mentah', () => {
  it('membuang byAspect/essays/assessors, mempertahankan skor & ringkasan', () => {
    const data = {
      s360: 82, aspects: [{ name: 'X', score: 80, self: null }],
      aspectSummaries: { X: 'ringkasan' },
      assessors: [{ assessorId: 'a' }],
      byAspect: [{ name: 'X', indicators: [{ num: 1, text: 't', ratings: [4], entries: [{ rating: 4, comment: 'ok' }] }] }],
      essays: [{ question: 'q', answers: ['a'] }],
    } as unknown as ReportData;
    const r = withoutRaw(data);
    expect(r.byAspect).toEqual([]);
    expect(r.essays).toEqual([]);
    expect(r.assessors).toEqual([]);
    expect(r.s360).toBe(82);
    expect(r.aspectSummaries).toEqual({ X: 'ringkasan' });
  });
});

describe('reportForGrantViewer — jalur grant Review & Finalisasi tak pernah menerima L3', () => {
  const full = () => ({
    s360: 82, aspects: [{ name: 'X', score: 80, self: null }],
    aspectSummaries: { X: 'ringkasan' },
    assessors: [{ assessorId: 'a', assessorName: 'Siti', relation: 'Bawahan', isSelf: false, comments: [], answers: [] }],
    byAspect: [{ name: 'X', indicators: [{ num: 1, text: 't', ratings: [4], entries: [{ rating: 4, comment: 'ok' }] }] }],
    essays: [{ question: 'q', answers: ['a'] }],
  }) as unknown as ReportData;

  it('laporan orang lain → assessors dibuang, raw anonim (byAspect/essays) tetap utuh', () => {
    const src = full();
    const r = reportForGrantViewer(src, { isSelf: false, isDireksi: false });
    expect(r.assessors).toEqual([]);
    expect(r.byAspect).toEqual(src.byAspect);
    expect(r.essays).toEqual(src.essays);
    expect(r.s360).toBe(82);
    expect(r.aspectSummaries).toEqual({ X: 'ringkasan' });
  });

  it('laporan diri sendiri (non-Direksi) → withoutRaw (tanpa raw & tanpa assessors)', () => {
    const r = reportForGrantViewer(full(), { isSelf: true, isDireksi: false });
    expect(r).toEqual(withoutRaw(full()));
    expect(r.byAspect).toEqual([]);
    expect(r.essays).toEqual([]);
  });

  it('Direksi membuka laporannya sendiri → raw anonim tetap, assessors tetap dibuang', () => {
    const src = full();
    const r = reportForGrantViewer(src, { isSelf: true, isDireksi: true });
    expect(r.assessors).toEqual([]);
    expect(r.byAspect).toEqual(src.byAspect);
    expect(r.essays).toEqual(src.essays);
  });

  it('tidak memutasi objek sumber', () => {
    const src = full();
    reportForGrantViewer(src, { isSelf: false, isDireksi: false });
    expect(src.assessors).toHaveLength(1);
  });
});
