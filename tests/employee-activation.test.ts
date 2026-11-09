import { describe, it, expect } from 'vitest';
import { mappingsToReactivate, pairKey } from '@/lib/employee-activation';

const ME = 'me';
const maps = [
  { id: 'm-q4-out', period_id: 'Q4', assessor_id: ME, target_id: 'rekan1' },
  { id: 'm-q4-in', period_id: 'Q4', assessor_id: 'rekan2', target_id: ME },
  { id: 'm-q4-removed', period_id: 'Q4', assessor_id: ME, target_id: 'rekan3' },
  { id: 'm-q4-other-inactive', period_id: 'Q4', assessor_id: ME, target_id: 'keluar' },
  { id: 'm-q3-old', period_id: 'Q3', assessor_id: ME, target_id: 'rekan1' },
];
const base = {
  openPeriodIds: new Set(['Q4']),
  activeOthers: new Set(['rekan1', 'rekan2', 'rekan3']),
  removedPairs: new Set([pairKey('Q4', ME, 'rekan3')]),
};

describe('Aktif kembali: pemetaan yang dihidupkan lagi', () => {
  it('hanya periode yang belum berakhir, sisi lawan aktif, dan bukan hasil permohonan hapus', () => {
    expect(mappingsToReactivate(maps, ME, base)).toEqual(['m-q4-out', 'm-q4-in']);
  });

  it('periode yang sudah lewat tidak tersentuh (tanggal aktif di luar periode berjalan)', () => {
    expect(mappingsToReactivate(maps, ME, { ...base, openPeriodIds: new Set() })).toEqual([]);
  });

  it('permohonan hapus berlaku per periode: pasangan sama di periode lain tetap boleh hidup', () => {
    const q4b = [{ id: 'x', period_id: 'Q4', assessor_id: ME, target_id: 'rekan1' }];
    expect(mappingsToReactivate(q4b, ME, { ...base, removedPairs: new Set([pairKey('Q3', ME, 'rekan1')]) })).toEqual(['x']);
  });
});
