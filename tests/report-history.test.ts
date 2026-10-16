import { describe, it, expect } from 'vitest';
import { describeHistory, type HistoryRow } from '@/lib/report-history';

const base: HistoryRow = {
  changed_at: '2026-10-15T07:20:00Z', actor_id: 'u1', actor_name: 'Ekki',
  kind: 'change', old_status: 'in_review', new_status: 'in_review',
  old_acc: false, new_acc: false, old_score: 84.9, new_score: 84.9,
};
const texts = (r: Partial<HistoryRow>) => describeHistory({ ...base, ...r }).map((i) => i.text);

describe('describeHistory — riwayat laporan dalam bahasa HRD', () => {
  it('ACC diberikan', () => {
    expect(describeHistory({ ...base, new_acc: true })).toEqual([{ text: '✔ ACC diberikan', tone: 'brand' }]);
  });

  it('ACC dibatalkan langsung (tombol batalkan)', () => {
    expect(texts({ old_acc: true, new_acc: false })).toEqual(['✖ ACC dibatalkan']);
  });

  it('ACC gugur karena Simpan Draf → disebut sebabnya + perubahan status', () => {
    expect(texts({ old_acc: true, new_acc: false, new_status: 'draft' }))
      .toEqual(['✖ ACC dibatalkan — karena laporan disimpan sebagai Draf', 'Status: Ditinjau → Draf']);
  });

  it('ACC gugur karena rilis ulang dengan skor berbeda', () => {
    expect(texts({ old_acc: true, new_acc: false, old_score: 84.9, new_score: 85.1 }))
      .toEqual(['✖ ACC dibatalkan — karena dirilis ulang dengan Skor Akhir berbeda', 'Skor Akhir 84.90 → 85.10']);
  });

  it('finalisasi: status berubah, ACC tetap', () => {
    expect(texts({ old_acc: true, new_acc: true, new_status: 'finalized' })).toEqual(['Status: Ditinjau → Final']);
  });

  it('skor sama (angka dari database bisa string/number) → tak dianggap berubah', () => {
    expect(texts({ old_score: 84.9, new_score: Number('84.90'), new_status: 'finalized' })).toEqual(['Status: Ditinjau → Final']);
  });

  it('baris awal (snapshot) & laporan dibuat', () => {
    expect(texts({ kind: 'snapshot', old_status: null, new_status: 'in_review', old_acc: null, new_acc: true, old_score: null }))
      .toEqual(['Awal pencatatan riwayat: Ditinjau · ✔ sudah ACC · Skor Akhir 84.90']);
    expect(texts({ kind: 'created', old_status: null, new_status: 'draft', old_acc: null, new_acc: false, old_score: null }))
      .toEqual(['Laporan dibuat: Draf · belum ACC · Skor Akhir 84.90']);
  });
});
