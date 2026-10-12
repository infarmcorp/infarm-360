/**
 * Uji KARAKTERISASI `setAssessmentValidity` (app/(app)/admin/pemetaan/actions.ts):
 * Batalkan / Pulihkan validitas penilaian 360° (status 'submitted' ⇄ 'invalidated'), lalu
 * rekonsiliasi Skor 360° target (hapus result_360 bila tak ada penilaian terkirim tersisa,
 * atau hitung ulang). Mengunci perilaku SAAT INI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'spv' }) })) }));
vi.mock('@/app/(app)/admin/360/actions', () => ({ computeResult360: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/backfill-guard', () => ({ backfillLockReason: vi.fn(async () => null), BACKFILL_LOCK_MSG: 'x' }));

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { computeResult360 } from '@/app/(app)/admin/360/actions';
import { backfillLockReason } from '@/lib/backfill-guard';
import { setAssessmentValidity } from '@/app/(app)/admin/pemetaan/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const mockCompute = vi.mocked(computeResult360);
const mockBackfill = vi.mocked(backfillLockReason);
const mockLog = vi.mocked(logHrdAction);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockAdmin.mockReturnValue(c as any); }
/** Respons query `select('*', { count: 'exact', head: true })` — mock bersama tak punya field count. */
function withCount(n: number | null): QResult { return { data: null, error: null, count: n } as QResult; }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASR = '11111111-1111-1111-1111-111111111111';
const TGT = '22222222-2222-2222-2222-222222222222';
const MAP = '99999999-9999-9999-9999-999999999999';
const HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const REASON = 'Penilai salah orang';
const MAPPING = { data: { assessor_id: ASR, target_id: TGT, period_id: 'p1' } };
const PERIOD_ACTIVE = { data: { status: 'active' } };
const NAMES = { data: [{ id: ASR, name: 'Budi' }, { id: TGT, name: 'Andi' }] };

function hrdClient(): MockClient {
  return makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } });
}
/** Klien service_role untuk alur sukses lengkap. `remaining` = sisa penilaian submitted target. */
function adminFlow(status: string, remaining: number, extra: Record<string, QResult[]> = {}): MockClient {
  return makeClient({ user: { id: UID }, tables: {
    mappings: [MAPPING],
    periods: [PERIOD_ACTIVE],
    assessments: [{ data: { id: 'a1', status } }, { error: null }, withCount(remaining)],
    result_360: [{ error: null }],
    employees: [NAMES],
    ...extra,
  } });
}
const assessmentUpdates = (c: MockClient) => c.calls.filter((x) => x.table === 'assessments' && x.op === 'update');

beforeEach(() => { vi.clearAllMocks(); mockBackfill.mockResolvedValue(null); mockCompute.mockResolvedValue({ ok: true } as never); });

describe('setAssessmentValidity — otorisasi & validasi input', () => {
  it('tolak bila sesi berakhir', async () => {
    use(makeClient({ user: null }));
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('tolak non-HRD (SPV)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false } }] } }));
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: false, error: 'Hanya HRD yang dapat mengelola pemetaan' });
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it("tolak HRD Admin yang hrd_sections-nya tak memuat 'pemetaan'", async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_hrd_admin: true, hrd_sections: ['laporan'] } }] } }));
    const r = await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(r.ok).toBe(false);
  });

  it("izinkan HRD Admin dgn hrd_sections memuat 'pemetaan'", async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_hrd_admin: true, hrd_sections: ['pemetaan'] } }] } }));
    useAdmin(adminFlow('submitted', 1));
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: true });
  });

  it('TIDAK sadar-mode: tak membaca cookie hrd_mode (HRD di Mode-SPV tetap boleh)', async () => {
    use(hrdClient());
    useAdmin(adminFlow('submitted', 1));
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: true });
    expect(vi.mocked(cookies)).not.toHaveBeenCalled();
  });

  it('alasan < 5 karakter (setelah trim) ditolak SEBELUM membuat klien service_role', async () => {
    use(hrdClient());
    expect(await setAssessmentValidity(MAP, 'invalidate', '  abc   ')).toEqual({ ok: false, error: 'Alasan minimal 5 karakter' });
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('alasan > 300 karakter ditolak', async () => {
    use(hrdClient());
    expect(await setAssessmentValidity(MAP, 'invalidate', 'x'.repeat(301))).toEqual({ ok: false, error: 'Alasan maksimal 300 karakter' });
  });

  it('alasan null/undefined → diperlakukan string kosong → ditolak (tidak melempar)', async () => {
    use(hrdClient());
    const r = await setAssessmentValidity(MAP, 'invalidate', undefined as unknown as string);
    expect(r).toEqual({ ok: false, error: 'Alasan minimal 5 karakter' });
  });

  it('mappingId tidak divalidasi format UUID — langsung dicari (tak ditemukan → error)', async () => {
    use(hrdClient());
    const admin = makeClient({ user: { id: UID }, tables: { mappings: [{ data: null }] } });
    useAdmin(admin);
    expect(await setAssessmentValidity('bukan-uuid', 'invalidate', REASON)).toEqual({ ok: false, error: 'Pemetaan tidak ditemukan' });
    expect(admin.calls[0].filters).toEqual([['eq', 'id', 'bukan-uuid']]);
  });
});

describe('setAssessmentValidity — prasyarat periode & status', () => {
  it.each([
    ['locked', { data: { status: 'locked' } }],
    ['draft', { data: { status: 'draft' } }],
    ['periode tak ada', { data: null }],
  ])('tolak bila periode pemetaan bukan aktif (%s)', async (_l, per) => {
    use(hrdClient());
    const admin = makeClient({ user: { id: UID }, tables: { mappings: [MAPPING], periods: [per as QResult] } });
    useAdmin(admin);
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON))
      .toEqual({ ok: false, error: 'Hanya penilaian pada periode aktif yang dapat diubah validitasnya' });
    expect(admin.calls.find((x) => x.table === 'periods')?.filters).toEqual([['eq', 'id', 'p1']]);
    expect(admin.calls.some((x) => x.table === 'assessments')).toBe(false);
  });

  it('penilaian dicari berdasarkan periode + penilai + target dari pemetaan', async () => {
    use(hrdClient());
    const admin = adminFlow('submitted', 1);
    useAdmin(admin);
    await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(admin.calls.find((x) => x.table === 'assessments')?.filters)
      .toEqual([['eq', 'period_id', 'p1'], ['eq', 'assessor_id', ASR], ['eq', 'target_id', TGT]]);
  });

  it.each(['draft', 'invalidated'])("batalkan: tolak status '%s' (hanya Terkirim)", async (status) => {
    use(hrdClient());
    const admin = makeClient({ user: { id: UID }, tables: { mappings: [MAPPING], periods: [PERIOD_ACTIVE], assessments: [{ data: { id: 'a1', status } }] } });
    useAdmin(admin);
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON))
      .toEqual({ ok: false, error: 'Hanya penilaian berstatus Terkirim yang dapat dibatalkan validitasnya' });
    expect(assessmentUpdates(admin)).toHaveLength(0);
  });

  it('batalkan: tolak bila belum ada penilaian (Belum Mulai)', async () => {
    use(hrdClient());
    useAdmin(makeClient({ user: { id: UID }, tables: { mappings: [MAPPING], periods: [PERIOD_ACTIVE], assessments: [{ data: null }] } }));
    const r = await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(r.ok).toBe(false);
  });

  it.each(['submitted', 'draft'])("pulihkan: tolak status '%s' (hanya yang dibatalkan)", async (status) => {
    use(hrdClient());
    useAdmin(makeClient({ user: { id: UID }, tables: { mappings: [MAPPING], periods: [PERIOD_ACTIVE], assessments: [{ data: { id: 'a1', status } }] } }));
    expect(await setAssessmentValidity(MAP, 'restore', REASON))
      .toEqual({ ok: false, error: 'Penilaian ini tidak dalam status dibatalkan' });
  });
});

describe('setAssessmentValidity — batalkan validitas (invalidate)', () => {
  it("menulis status 'invalidated' + jejak (waktu, HRD, alasan ter-trim) via service_role", async () => {
    use(hrdClient());
    const admin = adminFlow('submitted', 2);
    useAdmin(admin);
    const r = await setAssessmentValidity(MAP, 'invalidate', `  ${REASON}  `);
    expect(r).toEqual({ ok: true });
    const u = assessmentUpdates(admin);
    expect(u).toHaveLength(1);
    const p = u[0].payload as Record<string, unknown>;
    expect(p).toEqual({ status: 'invalidated', invalidated_at: expect.any(String), invalidated_by: UID, invalid_reason: REASON });
    expect(new Date(p.invalidated_at as string).toISOString()).toBe(p.invalidated_at);
    expect(u[0].filters).toEqual([['eq', 'id', 'a1']]);
  });

  it('masih ada penilaian terkirim lain → hitung ulang Skor 360° (computeResult360), result_360 tak dihapus', async () => {
    use(hrdClient());
    const admin = adminFlow('submitted', 2);
    useAdmin(admin);
    await setAssessmentValidity(MAP, 'invalidate', REASON);
    const cnt = admin.calls.filter((x) => x.table === 'assessments')[2];
    expect(cnt.op).toBe('select');
    expect(cnt.filters).toEqual([['eq', 'period_id', 'p1'], ['eq', 'target_id', TGT], ['eq', 'status', 'submitted']]);
    expect(mockCompute).toHaveBeenCalledTimes(1);
    expect(mockCompute).toHaveBeenCalledWith();
    expect(admin.calls.some((x) => x.table === 'result_360')).toBe(false);
  });

  it('tak ada penilaian terkirim tersisa → result_360 target DIHAPUS, tanpa hitung ulang', async () => {
    use(hrdClient());
    const admin = adminFlow('submitted', 0);
    useAdmin(admin);
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: true });
    const del = admin.calls.filter((x) => x.table === 'result_360');
    expect(del).toHaveLength(1);
    expect(del[0].op).toBe('delete');
    expect(del[0].filters).toEqual([['eq', 'period_id', 'p1'], ['eq', 'employee_id', TGT]]);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('count null dianggap 0 → result_360 dihapus', async () => {
    use(hrdClient());
    const admin = makeClient({ user: { id: UID }, tables: {
      mappings: [MAPPING], periods: [PERIOD_ACTIVE],
      assessments: [{ data: { id: 'a1', status: 'submitted' } }, { error: null }, withCount(null)],
      result_360: [{ error: null }], employees: [NAMES],
    } });
    useAdmin(admin);
    await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(admin.calls.some((x) => x.table === 'result_360' && x.op === 'delete')).toBe(true);
  });

  it('periode hasil impor (backfill) → status TETAP diubah, tetapi Skor 360° tak disentuh sama sekali', async () => {
    mockBackfill.mockResolvedValue('x'); // = BACKFILL_LOCK_MSG
    use(hrdClient());
    const admin = makeClient({ user: { id: UID }, tables: {
      mappings: [MAPPING], periods: [PERIOD_ACTIVE],
      assessments: [{ data: { id: 'a1', status: 'submitted' } }, { error: null }],
      employees: [NAMES],
    } });
    useAdmin(admin);
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: true });
    expect(mockBackfill).toHaveBeenCalledWith(admin, 'p1');
    expect(assessmentUpdates(admin)).toHaveLength(1);
    expect(admin.calls.filter((x) => x.table === 'assessments')).toHaveLength(2); // tanpa query count
    expect(admin.calls.some((x) => x.table === 'result_360')).toBe(false);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('gagal update → error, tanpa rekonsiliasi & tanpa log', async () => {
    use(hrdClient());
    useAdmin(makeClient({ user: { id: UID }, tables: {
      mappings: [MAPPING], periods: [PERIOD_ACTIVE],
      assessments: [{ data: { id: 'a1', status: 'submitted' } }, { error: { message: 'trigger menolak' } }],
    } }));
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: false, error: 'Gagal membatalkan validitas: trigger menolak' });
    expect(mockBackfill).not.toHaveBeenCalled();
    expect(mockCompute).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('log aktivitas assessment.invalidate (nama penilai → target, alasan) + revalidate', async () => {
    use(hrdClient());
    useAdmin(adminFlow('submitted', 1));
    await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'assessment.invalidate', category: 'pemetaan',
      summary: 'Membatalkan validitas penilaian Budi → Andi',
      targetType: 'mapping', targetId: MAP, meta: { reason: REASON },
    });
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/admin/pemetaan'], ['/admin/progress'], ['/penilaian'], ['/admin/laporan'], ['/', 'layout'],
    ]);
  });

  it("nama tak ditemukan → '—' di ringkasan log", async () => {
    use(hrdClient());
    useAdmin(adminFlow('submitted', 1, { employees: [{ data: [] }] }));
    await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Membatalkan validitas penilaian — → —' }));
  });

  it('Hitung Ulang gagal ({ok:false}) → status tersimpan, aksi memberi PERINGATAN (bukan "berhasil" polos)', async () => {
    mockCompute.mockResolvedValue({ ok: false, error: 'Tidak ada periode aktif' } as never);
    use(hrdClient());
    useAdmin(adminFlow('submitted', 1));
    const r = await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warning).toMatch(/Validitas penilaian Budi → Andi sudah dibatalkan/);
      expect(r.warning).toMatch(/BELUM diperbarui.*Hitung Ulang Skor 360°/);
      expect(r.warning).toContain('Tidak ada periode aktif');
    }
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ meta: { reason: REASON, skor_360_belum_diperbarui: 'Tidak ada periode aktif' } }));
  });

  it('Hitung Ulang melempar → status tersimpan, peringatan + log tetap ditulis (dulu aksi ikut melempar)', async () => {
    mockCompute.mockRejectedValue(new Error('crash'));
    use(hrdClient());
    const admin = adminFlow('submitted', 1);
    useAdmin(admin);
    const r = await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(r.ok && r.warning).toMatch(/BELUM diperbarui.*Hitung Ulang Skor 360°/);
    expect(assessmentUpdates(admin)).toHaveLength(1);
    expect(mockLog).toHaveBeenCalled();
  });

  it('gagal menghapus Skor 360° target (tak ada penilaian tersisa) → peringatan', async () => {
    use(hrdClient());
    useAdmin(adminFlow('submitted', 0, { result_360: [{ error: { message: 'rls' } }] }));
    const r = await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(r.ok && r.warning).toMatch(/BELUM diperbarui.*Hitung Ulang Skor 360°/);
  });

  it('status "periode hasil impor" gagal dibaca → peringatan (bukan diam-diam dilewati)', async () => {
    mockBackfill.mockResolvedValue('Tidak dapat memastikan …');
    use(hrdClient());
    useAdmin(adminFlow('submitted', 1));
    const r = await setAssessmentValidity(MAP, 'invalidate', REASON);
    expect(r.ok && r.warning).toMatch(/BELUM diperbarui.*Hitung Ulang Skor 360°/);
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it('Hitung Ulang berhasil → ok tanpa peringatan', async () => {
    use(hrdClient());
    useAdmin(adminFlow('submitted', 1));
    expect(await setAssessmentValidity(MAP, 'invalidate', REASON)).toEqual({ ok: true });
  });
});

describe('setAssessmentValidity — pulihkan validitas (restore)', () => {
  it("menulis kembali status 'submitted' dan mengosongkan jejak pembatalan", async () => {
    use(hrdClient());
    const admin = adminFlow('invalidated', 1);
    useAdmin(admin);
    expect(await setAssessmentValidity(MAP, 'restore', REASON)).toEqual({ ok: true });
    const u = assessmentUpdates(admin);
    expect(u).toHaveLength(1);
    expect(u[0].payload).toEqual({ status: 'submitted', invalidated_at: null, invalidated_by: null, invalid_reason: null });
    expect(u[0].filters).toEqual([['eq', 'id', 'a1']]);
    expect(mockCompute).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'assessment.restore', summary: 'Memulihkan validitas penilaian Budi → Andi', meta: { reason: REASON },
    }));
  });

  it('alasan tetap WAJIB saat memulihkan', async () => {
    use(hrdClient());
    expect(await setAssessmentValidity(MAP, 'restore', '')).toEqual({ ok: false, error: 'Alasan minimal 5 karakter' });
  });

  it('gagal update → pesan "Gagal memulihkan validitas"', async () => {
    use(hrdClient());
    useAdmin(makeClient({ user: { id: UID }, tables: {
      mappings: [MAPPING], periods: [PERIOD_ACTIVE],
      assessments: [{ data: { id: 'a1', status: 'invalidated' } }, { error: { message: 'x' } }],
    } }));
    expect(await setAssessmentValidity(MAP, 'restore', REASON)).toEqual({ ok: false, error: 'Gagal memulihkan validitas: x' });
  });

  it("string aksi SELAIN 'invalidate' (mis. 'hapus') diperlakukan sebagai PULIHKAN", async () => {
    use(hrdClient());
    const admin = adminFlow('invalidated', 1);
    useAdmin(admin);
    const r = await setAssessmentValidity(MAP, 'hapus' as unknown as 'restore', REASON);
    expect(r).toEqual({ ok: true });
    expect(assessmentUpdates(admin)[0].payload).toEqual(expect.objectContaining({ status: 'submitted' }));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'assessment.restore' }));
  });

  it("string aksi asing pada penilaian 'submitted' → ditolak dgn pesan pulihkan", async () => {
    use(hrdClient());
    useAdmin(makeClient({ user: { id: UID }, tables: { mappings: [MAPPING], periods: [PERIOD_ACTIVE], assessments: [{ data: { id: 'a1', status: 'submitted' } }] } }));
    expect(await setAssessmentValidity(MAP, 'INVALIDATE' as unknown as 'restore', REASON))
      .toEqual({ ok: false, error: 'Penilaian ini tidak dalam status dibatalkan' });
  });
});
