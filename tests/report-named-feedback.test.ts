import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { withoutNamedFeedback, type ReportData } from '@/lib/report';

// Opsi A (cek 2026-10-14): tampilan HRD di detail laporan tak pernah menampilkan umpan balik BERNAMA
// per penilai (L3), tetapi dulu tetap mengirimnya ke browser. Kini dibuang di server; komentar mentah
// ANONIM tetap utuh (HRD butuh untuk meringkas, termasuk laporannya sendiri — keputusan pemilik).
const full = () => ({
  s360: 81.2, kpiAvg: 86.33, finalScore: 83.77, status: 'in_review',
  aspects: [{ name: 'X', score: 80, self: null }],
  aspectSummaries: { X: 'ringkasan' },
  assessors: [{ assessorId: 'a', assessorName: 'Siti', relation: 'Bawahan', isSelf: false, comments: [{ indicator: 'i', rating: 2, comment: 'c' }], answers: [] }],
  byAspect: [{ name: 'X', indicators: [{ num: 1, text: 't', ratings: [4], entries: [{ rating: 4, comment: 'ok' }] }] }],
  essays: [{ question: 'q', answers: ['a'] }],
}) as unknown as ReportData;

describe('withoutNamedFeedback — L3 dibuang, sisanya utuh', () => {
  it('assessors (nama penilai) kosong', () => {
    expect(withoutNamedFeedback(full()).assessors).toEqual([]);
  });
  it('komentar mentah anonim, skor, dan ringkasan tidak berubah', () => {
    const src = full();
    expect(withoutNamedFeedback(src)).toEqual({ ...src, assessors: [] });
  });
  it('tidak memutasi data sumber', () => {
    const src = full();
    withoutNamedFeedback(src);
    expect(src.assessors).toHaveLength(1);
  });
});
