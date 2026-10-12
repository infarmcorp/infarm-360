/**
 * KUNCI LAPORAN FINAL (gelombang 2b) pada jalur 360° yang mengubah isi laporan pegawai yang DINILAI:
 *   - submitAssessment  (kirim pertama & Kirim Ulang oleh penilai)
 *   - forceComplete     (Progress 360 — HRD memaksa-selesai)
 *   - setAssessmentValidity (Batalkan / Pulihkan validitas)
 *   - reviewCorrection  (setujui permohonan 'relation' / 'add'; 'remove' & penolakan tetap boleh)
 * Tiap jalur: (a) target belum Final → jalan seperti biasa; (b) target Final → ditolak, tak ada
 * penulisan; (c) setelah Buka Kembali (helper kembali "belum Final") → jalan lagi.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Map()),
  cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })),
}));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/app/(app)/admin/360/actions', () => ({ computeResult360: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/backfill-guard', () => ({ backfillLockReason: vi.fn(async () => null), BACKFILL_LOCK_MSG: 'x' }));
vi.mock('@/lib/email/mailer', () => ({
  emailConfigured: vi.fn(() => false), sendEmail: vi.fn(), reminderHtml: vi.fn(), onboardingHtml: vi.fn(), panduanAttachment: vi.fn(),
}));
vi.mock('@/lib/final-lock', async (orig) => ({
  ...(await orig<typeof import('@/lib/final-lock')>()),
  finalLockError: vi.fn(async () => null),
  finalizedEmployees: vi.fn(async () => new Set<string>()),
}));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { finalLockError, finalizedEmployees, finalLockMsg, FINAL_CHECK_FAILED_MSG } from '@/lib/final-lock';
import { submitAssessment } from '@/app/(app)/penilaian/actions';
import { forceComplete } from '@/app/(app)/admin/progress/actions';
import { setAssessmentValidity, reviewCorrection } from '@/app/(app)/admin/pemetaan/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const mockLock = vi.mocked(finalLockError);
const mockFinalized = vi.mocked(finalizedEmployees);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); return c; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockAdmin.mockReturnValue(c as any); return c; }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TARGET = '11111111-1111-1111-1111-111111111111';
const MAP = '99999999-9999-9999-9999-999999999999';
const I1 = '22222222-2222-2222-2222-222222222221';
const EVID = 'Bukti perilaku yang cukup panjang untuk evidence.';
const HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const LOCK = finalLockMsg(['Andi']);
const RATER_MSG = 'Laporan Andi sudah Final, penilaian untuknya tidak dapat dikirim atau diubah lagi.';

const writes = (c: MockClient) => c.calls.filter((x) => x.op !== 'select');

beforeEach(() => {
  vi.clearAllMocks();
  mockLock.mockResolvedValue(null);
  mockFinalized.mockResolvedValue(new Set());
});

// ───────────────────────────── submitAssessment ─────────────────────────────
/** Klien penilai sampai validasi selesai; `asmt` = respons assessments berurutan. */
function raterClient(asmt: QResult[]): MockClient {
  return makeClient({ user: { id: UID }, tables: {
    periods: [{ data: { id: 'p1', has_360: true, form_open: true, assessment_deadline: null } }],
    mappings: [{ data: { id: 'm1', mandatory: true } }],
    assessments: asmt,
    culture_aspects: [{ data: [{ id: 'a1' }] }],
    indicators: [{ data: [{ id: I1 }] }],
    qualitative_questions: [{ data: [] }],
    assessment_indicator_scores: [{ error: null }],
  } });
}
const SUBMIT = { targetId: TARGET, status: 'submitted' as const, scores: [{ indicatorId: I1, rating: 4, comment: EVID }], answers: [] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nameAdmin = () => mockAdmin.mockReturnValue(makeClient({ tables: { employees: [{ data: { name: 'Andi' } }] } }) as any);

describe('submitAssessment — kunci laporan Final target', () => {
  it('target belum Final → kiriman pertama tetap jalan (draf lalu terkirim)', async () => {
    const c = use(raterClient([{ data: null }, { data: { id: 'x1' } }, { error: null }]));
    nameAdmin();
    const r = await submitAssessment(SUBMIT);
    expect(r).toEqual({ ok: true, status: 'submitted' });
    expect(mockFinalized).toHaveBeenCalledWith(expect.anything(), 'p1', [TARGET]);
    expect(writes(c).filter((x) => x.table === 'assessments').map((x) => x.op)).toEqual(['insert', 'update']);
  });

  it('target Final → kiriman pertama DITOLAK dengan pesan untuk penilai, tak ada penulisan', async () => {
    mockFinalized.mockResolvedValue(new Set([TARGET]));
    const c = use(raterClient([{ data: null }]));
    nameAdmin();
    const r = await submitAssessment(SUBMIT);
    expect(r).toEqual({ ok: false, error: RATER_MSG });
    expect(writes(c)).toHaveLength(0);
  });

  it('target Final → Kirim Ulang (sudah terkirim) DITOLAK, tak ada penulisan', async () => {
    mockFinalized.mockResolvedValue(new Set([TARGET]));
    const c = use(raterClient([{ data: { id: 'x1', status: 'submitted' } }]));
    nameAdmin();
    const r = await submitAssessment(SUBMIT);
    expect(r).toEqual({ ok: false, error: RATER_MSG });
    expect(writes(c)).toHaveLength(0);
  });

  it('target Final → Simpan Draf (belum pernah terkirim) TETAP boleh — draf tak masuk laporan', async () => {
    mockFinalized.mockResolvedValue(new Set([TARGET]));
    const c = use(raterClient([{ data: null }, { data: { id: 'x1' } }]));
    const r = await submitAssessment({ ...SUBMIT, status: 'draft' });
    expect(r).toEqual({ ok: true, status: 'draft' });
    expect(mockFinalized).not.toHaveBeenCalled();
    expect(writes(c).filter((x) => x.table === 'assessments').map((x) => x.op)).toEqual(['insert']);
  });

  it('status laporan gagal dibaca → ditolak (gagal tertutup), tak ada penulisan', async () => {
    mockFinalized.mockRejectedValue(new Error('boom'));
    const c = use(raterClient([{ data: null }]));
    nameAdmin();
    const r = await submitAssessment(SUBMIT);
    expect(r).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(writes(c)).toHaveLength(0);
  });

  it('setelah Buka Kembali (tak lagi Final) → Kirim Ulang jalan lagi', async () => {
    mockFinalized.mockResolvedValueOnce(new Set([TARGET]));
    use(raterClient([{ data: { id: 'x1', status: 'submitted' } }]));
    nameAdmin();
    expect((await submitAssessment(SUBMIT)).ok).toBe(false);
    // HRD membuka kembali → helper tak lagi melaporkan Final.
    const c = use(raterClient([{ data: { id: 'x1', status: 'submitted' } }, { data: { id: 'x1' } }]));
    const r = await submitAssessment(SUBMIT);
    expect(r).toEqual({ ok: true, status: 'submitted' });
    expect(writes(c).filter((x) => x.table === 'assessments').map((x) => x.op)).toEqual(['update']);
  });
});

// ───────────────────────────── forceComplete ─────────────────────────────
function progressClient(withUpsert: boolean): MockClient {
  return makeClient({ user: { id: UID }, tables: {
    employees: [{ data: HRD }],
    periods: [{ data: { id: 'p1' } }],
    mappings: [{ data: { id: 'm1' } }],
    assessments: withUpsert ? [{ error: null }] : [],
  } });
}

describe('forceComplete — kunci laporan Final target', () => {
  it('target belum Final → penilaian ditandai selesai', async () => {
    const c = use(progressClient(true));
    useAdmin(makeClient({}));
    const r = await forceComplete(ASR, TARGET);
    expect(r.ok).toBe(true);
    expect(mockLock).toHaveBeenCalledWith(expect.anything(), 'p1', [TARGET]);
    expect(writes(c).map((x) => x.op)).toEqual(['upsert']);
  });

  it('target Final → ditolak dengan pesan kunci, tak ada upsert', async () => {
    mockLock.mockResolvedValue(LOCK);
    const c = use(progressClient(false));
    useAdmin(makeClient({}));
    expect(await forceComplete(ASR, TARGET)).toEqual({ ok: false, error: LOCK });
    expect(writes(c)).toHaveLength(0);
  });

  it('setelah Buka Kembali → jalan lagi', async () => {
    mockLock.mockResolvedValueOnce(LOCK);
    use(progressClient(false));
    useAdmin(makeClient({}));
    expect((await forceComplete(ASR, TARGET)).ok).toBe(false);
    const c = use(progressClient(true));
    expect((await forceComplete(ASR, TARGET)).ok).toBe(true);
    expect(writes(c).map((x) => x.op)).toEqual(['upsert']);
  });
});

// ───────────────────────────── setAssessmentValidity ─────────────────────────────
const MAPPING = { data: { assessor_id: ASR, target_id: TARGET, period_id: 'p1' } };
function validityAdmin(status: string | null): MockClient {
  return makeClient({ tables: {
    mappings: [MAPPING],
    periods: [{ data: { status: 'active' } }],
    assessments: status
      ? [{ data: { id: 'a1', status } }, { error: null }, { data: null, error: null, count: 2 } as QResult]
      : [],
    employees: [{ data: [{ id: ASR, name: 'Budi' }, { id: TARGET, name: 'Andi' }] }],
  } });
}
const hrdClient = () => makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } });

describe('setAssessmentValidity — kunci laporan Final target', () => {
  it.each(['invalidate', 'restore'] as const)('%s: target belum Final → status berubah', async (action) => {
    use(hrdClient());
    const admin = useAdmin(validityAdmin(action === 'invalidate' ? 'submitted' : 'invalidated'));
    const r = await setAssessmentValidity(MAP, action, 'Penilai salah orang');
    expect(r.ok).toBe(true);
    expect(mockLock).toHaveBeenCalledWith(admin, 'p1', [TARGET]);
    expect(admin.calls.filter((x) => x.table === 'assessments' && x.op === 'update')).toHaveLength(1);
  });

  it.each(['invalidate', 'restore'] as const)('%s: target Final → ditolak, status tak berubah', async (action) => {
    mockLock.mockResolvedValue(LOCK);
    use(hrdClient());
    const admin = useAdmin(validityAdmin(null));
    expect(await setAssessmentValidity(MAP, action, 'Penilai salah orang')).toEqual({ ok: false, error: LOCK });
    expect(writes(admin)).toHaveLength(0);
  });

  it('setelah Buka Kembali → pembatalan validitas jalan lagi', async () => {
    mockLock.mockResolvedValueOnce(LOCK);
    use(hrdClient());
    useAdmin(validityAdmin(null));
    expect((await setAssessmentValidity(MAP, 'invalidate', 'Penilai salah orang')).ok).toBe(false);
    use(hrdClient());
    const admin = useAdmin(validityAdmin('submitted'));
    expect((await setAssessmentValidity(MAP, 'invalidate', 'Penilai salah orang')).ok).toBe(true);
    expect(admin.calls.filter((x) => x.table === 'assessments' && x.op === 'update')).toHaveLength(1);
  });
});

// ───────────────────────────── reviewCorrection ─────────────────────────────
const REQ_BASE = { id: 'r1', mapping_id: null, assessor_id: UID, target_id: TARGET, period_id: 'p1', status: 'pending' };
const REQ = {
  relation: { ...REQ_BASE, kind: 'relation', new_relation: 'Bawahan' },
  add: { ...REQ_BASE, kind: 'add', new_relation: 'Cross' },
  remove: { ...REQ_BASE, kind: 'remove', new_relation: null },
};
/** Klien HRD untuk persetujuan yang sukses (atau, bila `blocked`, hanya sampai cek kunci). */
function reviewClient(kind: 'relation' | 'add' | 'remove', blocked: boolean): MockClient {
  const pair = kind === 'add'
    ? { data: null }
    : { data: { id: MAP, relation: 'Peer', is_active: true, mandatory: true, is_adhoc: false } };
  return makeClient({ user: { id: UID }, tables: {
    employees: blocked || kind !== 'add'
      ? [{ data: HRD }]
      : [{ data: HRD }, { data: { role: 'employee', is_external: false, is_active: true } }],
    relation_correction_requests: blocked ? [{ data: REQ[kind] }] : [{ data: REQ[kind] }, { error: null }],
    periods: [{ data: { status: 'active' } }],
    mappings: blocked ? [] : [pair, { error: null }],
  } });
}

describe('reviewCorrection — kunci laporan Final target', () => {
  it.each(['relation', 'add'] as const)('setujui %s: target belum Final → pemetaan ditulis', async (kind) => {
    const c = use(reviewClient(kind, false));
    useAdmin(makeClient({}));
    expect(await reviewCorrection('r1', 'approved')).toEqual({ ok: true });
    expect(mockLock).toHaveBeenCalledWith(expect.anything(), 'p1', [TARGET]);
    expect(writes(c).filter((x) => x.table === 'mappings')).toHaveLength(1);
  });

  it.each(['relation', 'add'] as const)('setujui %s: target Final → ditolak, pemetaan & permohonan tak disentuh', async (kind) => {
    mockLock.mockResolvedValue(LOCK);
    const c = use(reviewClient(kind, true));
    useAdmin(makeClient({}));
    expect(await reviewCorrection('r1', 'approved')).toEqual({ ok: false, error: LOCK });
    expect(writes(c)).toHaveLength(0);
  });

  it("setujui 'remove' saat target Final → TETAP boleh (kunci tak diperiksa)", async () => {
    mockLock.mockResolvedValue(LOCK);
    const c = use(reviewClient('remove', false));
    useAdmin(makeClient({ tables: { assessments: [{ data: null }] } }));
    expect(await reviewCorrection('r1', 'approved')).toEqual({ ok: true });
    expect(mockLock).not.toHaveBeenCalled();
    expect(writes(c).filter((x) => x.table === 'mappings').map((x) => x.payload)).toEqual([{ is_active: false }]);
  });

  it('menolak permohonan saat target Final → TETAP boleh', async () => {
    mockLock.mockResolvedValue(LOCK);
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ.relation }, { error: null }],
    } }));
    expect(await reviewCorrection('r1', 'rejected', 'Tidak relevan untuk kuartal ini')).toEqual({ ok: true });
    expect(mockLock).not.toHaveBeenCalled();
    expect(writes(c).map((x) => x.table)).toEqual(['relation_correction_requests']);
  });

  it('setelah Buka Kembali → persetujuan relation jalan lagi', async () => {
    mockLock.mockResolvedValueOnce(LOCK);
    use(reviewClient('relation', true));
    useAdmin(makeClient({}));
    expect((await reviewCorrection('r1', 'approved')).ok).toBe(false);
    const c = use(reviewClient('relation', false));
    expect(await reviewCorrection('r1', 'approved')).toEqual({ ok: true });
    expect(writes(c).filter((x) => x.table === 'mappings').map((x) => x.payload)).toEqual([{ relation: 'Bawahan' }]);
  });
});
