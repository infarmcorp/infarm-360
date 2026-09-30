import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => {}) }));

import { createClient } from '@/lib/supabase/server';
import { submitAssessment } from '@/app/(app)/penilaian/actions';

const mockCreate = vi.mocked(createClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); return c; }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TARGET = '11111111-1111-1111-1111-111111111111';
const I1 = '22222222-2222-2222-2222-222222222221';
const I2 = '22222222-2222-2222-2222-222222222222';
const FOREIGN = '33333333-3333-3333-3333-333333333333';
const EVID = 'Bukti perilaku yang cukup panjang untuk evidence.';

/** Antrean baku sampai titik validasi indikator: periode, pemetaan, penilaian lama, aspek, indikator, esai. */
function base(extra: Record<string, unknown[]> = {}) {
  return makeClient({ user: { id: UID }, tables: {
    periods: [{ data: { id: 'p1', has_360: true, form_open: true, assessment_deadline: null } }],
    mappings: [{ data: { id: 'm1', mandatory: true } }],
    assessments: [{ data: null }],
    culture_aspects: [{ data: [{ id: 'a1' }] }],
    indicators: [{ data: [{ id: I1 }, { id: I2 }] }],
    qualitative_questions: [{ data: [] }],
    ...extra,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('submitAssessment — kelengkapan indikator (audit 2026-09-30)', () => {
  it('TOLAK kirim bila hanya sebagian indikator aktif yang dinilai', async () => {
    const c = use(base());
    const r = await submitAssessment({ targetId: TARGET, status: 'submitted', scores: [{ indicatorId: I1, rating: 5, comment: EVID }], answers: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Lengkapi seluruh rating/i);
    expect(c.calls.filter((x) => x.op !== 'select')).toHaveLength(0);
  });

  it('TOLAK indikator yang bukan milik periode aktif', async () => {
    const c = use(base());
    const r = await submitAssessment({ targetId: TARGET, status: 'draft', scores: [{ indicatorId: FOREIGN, rating: 3, comment: '' }], answers: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tidak termasuk periode/i);
    expect(c.calls.filter((x) => x.op !== 'select')).toHaveLength(0);
  });

  it('kiriman pertama lengkap → header ditulis draf dulu, lalu dinaikkan ke terkirim', async () => {
    const c = use(base({
      assessments: [{ data: null }, { data: { id: 'x1' } }, { error: null }],
      assessment_indicator_scores: [{ error: null }],
    }));
    const r = await submitAssessment({ targetId: TARGET, status: 'submitted', scores: [
      { indicatorId: I1, rating: 5, comment: EVID }, { indicatorId: I2, rating: 4, comment: EVID },
    ], answers: [] });
    expect(r.ok).toBe(true);
    const writes = c.calls.filter((x) => x.table === 'assessments' && x.op !== 'select');
    expect(writes[0]?.op).toBe('upsert');
    expect((writes[0]?.payload as { status: string }).status).toBe('draft');
    expect(writes[1]?.op).toBe('update');
    expect((writes[1]?.payload as { status: string }).status).toBe('submitted');
  });
});
