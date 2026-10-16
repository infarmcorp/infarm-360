/**
 * KUNCI LAPORAN FINAL (lib/final-lock) pada jalur:
 *   - Kelola Pertanyaan (semua aksi tulis lewat ctx()) → pengaturan seluruh periode;
 *   - Kelola Periode: toggleHas360 & deletePeriod → pengaturan seluruh periode;
 *   - Review & Finalisasi: saveOrFinalizeReport → finalisasi ULANG laporan Final ditolak,
 *     sedangkan "Buka Kembali (ke Draf)" (finalize=false) tetap boleh.
 * Tiap jalur: (a) belum ada Final → berjalan seperti biasa; (b) ada Final → ditolak tanpa tulis;
 * (c) setelah dibuka kembali (helper → null) → berjalan lagi.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })) }));
vi.mock('@/lib/final-lock', async (orig) => ({
  ...(await orig<typeof import('@/lib/final-lock')>()),
  periodLockError: vi.fn(async () => null),
  finalLockError: vi.fn(async () => null),
}));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { refreshLatePenalties } from '@/lib/late-server';
import {
  periodLockError, finalLockError, periodFinalLockMsg, finalLockMsg, FINAL_CHECK_FAILED_MSG,
} from '@/lib/final-lock';
import {
  toggleIndicator, addQualQuestion, deleteQualQuestion, importQuestionsFromPeriod,
} from '@/app/(app)/admin/pertanyaan/actions';
import { toggleHas360, deletePeriod } from '@/app/(app)/admin/periode/actions';
import { saveOrFinalizeReport } from '@/app/(app)/admin/laporan/actions';

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const PID = '22222222-2222-2222-2222-222222222222';
const SRC = '33333333-3333-3333-3333-333333333333';
const IND = '44444444-4444-4444-4444-444444444444';
const HRD = { data: { role: 'hrd', is_hrd_admin: false, hrd_sections: null } };
const ADMIN_SENTINEL = { __admin: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => vi.mocked(createClient).mockResolvedValue(c as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (c: unknown) => vi.mocked(createAdminClient).mockReturnValue(c as any);
const writes = (c: MockClient) => c.calls.filter((x) => x.op !== 'select');
const mockPeriodLock = vi.mocked(periodLockError);
const mockFinalLock = vi.mocked(finalLockError);

beforeEach(() => {
  vi.clearAllMocks();
  mockPeriodLock.mockResolvedValue(null);
  mockFinalLock.mockResolvedValue(null);
  useAdmin(ADMIN_SENTINEL);
});

// ── Kelola Pertanyaan ─────────────────────────────────────────────────────────────────────────
describe('Kelola Pertanyaan — dikunci bila periode aktif sudah punya laporan Final', () => {
  const ACTIVE = { data: { id: PID } };
  const LOCK = periodFinalLockMsg(3, 'pertanyaan & indikator');

  it('(a) belum ada Final → toggleIndicator berjalan seperti biasa', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [HRD], periods: [ACTIVE], indicators: [{ data: { id: IND } }, { error: null }],
    } });
    use(c);
    expect(await toggleIndicator(IND, false)).toEqual({ ok: true });
    expect(mockPeriodLock).toHaveBeenCalledWith(ADMIN_SENTINEL, PID, 'pertanyaan & indikator');
    expect(writes(c)).toHaveLength(1);
  });

  it('(b) ada Final → toggleIndicator ditolak dgn pesan helper, tanpa tulis & tanpa audit', async () => {
    mockPeriodLock.mockResolvedValue(LOCK);
    const c = makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [ACTIVE] } });
    use(c);
    expect(await toggleIndicator(IND, false)).toEqual({ ok: false, error: LOCK });
    expect(LOCK).toBe('Sudah ada 3 laporan Final di periode ini. Buka Kembali laporan-laporan itu dulu untuk mengubah pertanyaan & indikator.');
    expect(writes(c)).toHaveLength(0);
    expect(logHrdAction).not.toHaveBeenCalled();
  });

  it('(b) ada Final → addQualQuestion, deleteQualQuestion, importQuestionsFromPeriod juga ditolak', async () => {
    mockPeriodLock.mockResolvedValue(LOCK);
    for (const run of [
      () => addQualQuestion('Apa kekuatan utama pegawai?'),
      () => deleteQualQuestion(IND),
      () => importQuestionsFromPeriod(SRC),
    ]) {
      const c = makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [ACTIVE] } });
      use(c);
      expect(await run()).toEqual({ ok: false, error: LOCK });
      expect(writes(c)).toHaveLength(0);
    }
    expect(logHrdAction).not.toHaveBeenCalled();
  });

  it('gagal membaca status Final → ditolak (gagal tertutup)', async () => {
    mockPeriodLock.mockResolvedValue(FINAL_CHECK_FAILED_MSG);
    const c = makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [ACTIVE] } });
    use(c);
    expect(await addQualQuestion('Apa kekuatan utama pegawai?')).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(writes(c)).toHaveLength(0);
  });

  it('bukan HRD → ditolak otorisasi lebih dulu (kunci tak diperiksa)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee' } }] } }));
    const r = await toggleIndicator(IND, true);
    expect(r.ok).toBe(false);
    expect(mockPeriodLock).not.toHaveBeenCalled();
  });

  it('(c) setelah laporan dibuka kembali (helper → null) → addQualQuestion berjalan lagi', async () => {
    mockPeriodLock.mockResolvedValueOnce(LOCK);
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [ACTIVE] } }));
    expect((await addQualQuestion('Apa kekuatan utama pegawai?')).ok).toBe(false);

    const c = makeClient({ user: { id: UID }, tables: {
      employees: [HRD], periods: [ACTIVE], qualitative_questions: [{ data: { order_idx: 1 } }, { error: null }],
    } });
    use(c);
    expect(await addQualQuestion('Apa kekuatan utama pegawai?')).toEqual({ ok: true });
    expect(writes(c)).toEqual([expect.objectContaining({ table: 'qualitative_questions', op: 'insert' })]);
  });
});

// ── Kelola Periode: toggleHas360 ─────────────────────────────────────────────────────────────
describe('toggleHas360 — dikunci bila periode punya laporan Final', () => {
  const LABEL: QResult = { data: { label: 'Q3 2026' } };
  const LOCK = periodFinalLockMsg(1, 'pengaturan 360° periode');

  it('(a) belum ada Final → update has_360 seperti biasa', async () => {
    const c = makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [{ error: null }, LABEL] } });
    use(c);
    expect(await toggleHas360(PID, false)).toEqual({ ok: true });
    expect(mockPeriodLock).toHaveBeenCalledWith(ADMIN_SENTINEL, PID, 'pengaturan 360° periode');
    expect(writes(c)).toEqual([expect.objectContaining({ table: 'periods', op: 'update', payload: { has_360: false } })]);
  });

  it('(b) ada Final → ditolak dgn pesan helper, has_360 tak diubah, tanpa audit', async () => {
    mockPeriodLock.mockResolvedValue(LOCK);
    const c = makeClient({ user: { id: UID }, tables: { employees: [HRD] } });
    use(c);
    expect(await toggleHas360(PID, true)).toEqual({ ok: false, error: LOCK });
    expect(LOCK).toBe('Sudah ada 1 laporan Final di periode ini. Buka Kembali laporan-laporan itu dulu untuk mengubah pengaturan 360° periode.');
    expect(writes(c)).toHaveLength(0);
    expect(logHrdAction).not.toHaveBeenCalled();
  });

  it('gagal membaca status Final → ditolak (gagal tertutup)', async () => {
    mockPeriodLock.mockResolvedValue(FINAL_CHECK_FAILED_MSG);
    const c = makeClient({ user: { id: UID }, tables: { employees: [HRD] } });
    use(c);
    expect(await toggleHas360(PID, false)).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(writes(c)).toHaveLength(0);
  });

  it('(c) setelah dibuka kembali (helper → null) → boleh lagi', async () => {
    mockPeriodLock.mockResolvedValueOnce(LOCK);
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    expect((await toggleHas360(PID, false)).ok).toBe(false);
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [{ error: null }, LABEL] } }));
    expect(await toggleHas360(PID, false)).toEqual({ ok: true });
  });
});

// ── Kelola Periode: deletePeriod ─────────────────────────────────────────────────────────────
describe('deletePeriod — dikunci bila periode punya laporan Final', () => {
  const ENDED = { data: { label: 'Q1 2026', status: 'ended' } };
  type Rpc = { fn: string; args: unknown };
  function adminWith(tables: Record<string, QResult[]>) {
    const c = makeClient({ tables });
    const rpcs: Rpc[] = [];
    return Object.assign(c, {
      rpcs,
      rpc: async (fn: string, args: unknown) => {
        rpcs.push({ fn, args });
        return { data: { label: 'Q1 2026', months: ['2026-01'], kpi_deleted: 0, kpi_audit_deleted: 0 }, error: null };
      },
    });
  }

  it('(a) belum ada Final → period_delete dipanggil seperti biasa', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    const admin = adminWith({ periods: [ENDED] });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: true });
    expect(mockPeriodLock).toHaveBeenCalledWith(admin, PID, 'periode ini');
    expect(admin.rpcs).toHaveLength(1);
  });

  it('(b) ada Final → ditolak dgn kalimat "untuk menghapus periode ini", tanpa RPC/hapus/audit', async () => {
    mockPeriodLock.mockResolvedValue(periodFinalLockMsg(4, 'periode ini'));
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    const admin = adminWith({ periods: [ENDED] });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({
      ok: false,
      error: 'Sudah ada 4 laporan Final di periode ini. Buka Kembali laporan-laporan itu dulu untuk menghapus periode ini.',
    });
    expect(admin.rpcs).toHaveLength(0);
    expect(writes(admin)).toHaveLength(0);
    expect(logHrdAction).not.toHaveBeenCalled();
  });

  it('periode AKTIF tetap ditolak dgn pesan lama (cek aktif didahulukan)', async () => {
    mockPeriodLock.mockResolvedValue(periodFinalLockMsg(4, 'periode ini'));
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    useAdmin(adminWith({ periods: [{ data: { label: 'Q3 2026', status: 'active' } }] }));
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: false, error: 'Periode aktif tidak bisa dihapus. "Kunci & Akhiri" dulu.' });
    expect(mockPeriodLock).not.toHaveBeenCalled();
  });

  it('gagal membaca status Final → ditolak (gagal tertutup), pesan apa adanya', async () => {
    mockPeriodLock.mockResolvedValue(FINAL_CHECK_FAILED_MSG);
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    const admin = adminWith({ periods: [ENDED] });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(admin.rpcs).toHaveLength(0);
  });

  it('(c) setelah dibuka kembali (helper → null) → boleh dihapus', async () => {
    mockPeriodLock.mockResolvedValueOnce(periodFinalLockMsg(1, 'periode ini'));
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    useAdmin(adminWith({ periods: [ENDED] }));
    expect((await deletePeriod(PID, 'HAPUS')).ok).toBe(false);
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    const admin = adminWith({ periods: [ENDED] });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: true });
    expect(admin.rpcs).toHaveLength(1);
  });
});

// ── Review & Finalisasi: saveOrFinalizeReport ───────────────────────────────────────────────
describe('saveOrFinalizeReport — finalisasi ULANG laporan Final ditolak; Buka Kembali tetap boleh', () => {
  const ACTIVE = { data: { id: PID, has_360: true, status: 'active' } };
  const COMPUTE: Record<string, QResult[]> = {
    period_months: [{ data: [{ ym: '2026-01' }] }],
    kpi_scores: [{ data: [{ score: 90 }] }],
    result_360: [{ data: { score: 70 } }],
  };
  const LOCK = finalLockMsg(['Andi']);

  it('(a) belum Final → finalisasi berjalan seperti biasa', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [HRD, { data: { name: 'Andi' } }], periods: [ACTIVE], ...COMPUTE,
      final_reports: [{ data: { id: 'r1', status: 'draft' } }, { error: null }],
    } });
    use(c);
    expect(await saveOrFinalizeReport(EMP, true)).toEqual({ ok: true, finalScore: 80, finalized: true });
    expect(mockFinalLock).toHaveBeenCalledWith(ADMIN_SENTINEL, PID, [EMP]);
    expect(writes(c)).toEqual([expect.objectContaining({ table: 'final_reports', op: 'update', payload: expect.objectContaining({ status: 'finalized' }) })]);
  });

  it('(b) sudah Final → finalisasi ulang DITOLAK dgn pesan helper; tak ada tulis, potongan telat tak diterapkan', async () => {
    mockFinalLock.mockResolvedValue(LOCK);
    const c = makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [ACTIVE] } });
    use(c);
    expect(await saveOrFinalizeReport(EMP, true)).toEqual({ ok: false, error: LOCK });
    expect(LOCK).toBe('Laporan Andi sudah Final. Buka Kembali laporannya dulu untuk mengubah data ini.');
    expect(writes(c)).toHaveLength(0);
    expect(refreshLatePenalties).not.toHaveBeenCalled();
    expect(logHrdAction).not.toHaveBeenCalled();
  });

  it('gagal membaca status Final → finalisasi ditolak (gagal tertutup)', async () => {
    mockFinalLock.mockResolvedValue(FINAL_CHECK_FAILED_MSG);
    const c = makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [ACTIVE] } });
    use(c);
    expect(await saveOrFinalizeReport(EMP, true)).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(writes(c)).toHaveLength(0);
  });

  it('"Buka Kembali (ke Draf)" (finalize=false) atas laporan Final TETAP boleh: status draf + ACC gugur', async () => {
    mockFinalLock.mockResolvedValue(LOCK); // walau Final — jalur ini tak memeriksa kunci
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [HRD, { data: { name: 'Andi' } }], periods: [ACTIVE], ...COMPUTE,
      final_reports: [{ data: { id: 'r1', status: 'finalized' } }, { error: null }],
    } });
    use(c);
    expect(await saveOrFinalizeReport(EMP, false)).toEqual({ ok: true, finalScore: 80, finalized: false });
    expect(mockFinalLock).not.toHaveBeenCalled();
    expect(writes(c)).toEqual([expect.objectContaining({
      table: 'final_reports', op: 'update',
      payload: expect.objectContaining({ status: 'draft', spv_acc: false, finalized_by: null }),
    })]);
  });

  it('(c) setelah dibuka kembali (helper → null) → finalisasi lagi boleh', async () => {
    mockFinalLock.mockResolvedValueOnce(LOCK);
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD], periods: [ACTIVE] } }));
    expect((await saveOrFinalizeReport(EMP, true)).ok).toBe(false);

    use(makeClient({ user: { id: UID }, tables: {
      employees: [HRD, { data: { name: 'Andi' } }], periods: [ACTIVE], ...COMPUTE,
      final_reports: [{ data: { id: 'r1', status: 'draft' } }, { error: null }],
    } }));
    expect(await saveOrFinalizeReport(EMP, true)).toEqual({ ok: true, finalScore: 80, finalized: true });
  });
});
