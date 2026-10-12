import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pengaman Q1 2026 (Skor 360° hasil impor Looker): GAGAL MEMBACA = DIANGGAP TERKUNCI, dan penerapan
// potongan telat juga dilindungi (audit gelombang 2b, poin 2a).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { backfillLockReason, isBackfilledPeriod, BACKFILL_LOCK_MSG, BACKFILL_CHECK_FAILED_MSG } from '@/lib/backfill-guard';
import { refreshLatePenalties } from '@/lib/late-server';
import { applyLatePenalties, setLateWaiver } from '@/app/(app)/admin/kepatuhan/actions';

type Admin = Parameters<typeof backfillLockReason>[0];
const HRD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';

/** Client yang menjawab query hitung `hrd_audit_log` dengan hasil tertentu; tabel lain dicatat. */
function auditClient(res: { count?: number | null; error?: { message: string } | null; throws?: boolean }) {
  const touched: string[] = [];
  const chain = {
    select: () => chain, eq: () => chain, in: () => chain, order: () => chain, range: () => chain, limit: () => chain,
    update: () => chain, upsert: () => chain, delete: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f),
  };
  const audit = {
    select: () => audit, eq: () => audit,
    then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => (res.throws
      ? Promise.reject(new Error('fetch failed')).then(f, r)
      : Promise.resolve({ count: res.count ?? null, error: res.error ?? null }).then(f, r)),
  };
  return {
    touched,
    from: (t: string) => { touched.push(t); return t === 'hrd_audit_log' ? audit : chain; },
  };
}

describe('backfillLockReason / isBackfilledPeriod — gagal baca = terkunci', () => {
  it('periode hasil impor → pesan kunci impor', async () => {
    expect(await backfillLockReason(auditClient({ count: 1 }) as unknown as Admin, 'p')).toBe(BACKFILL_LOCK_MSG);
  });
  it('periode biasa → boleh (null)', async () => {
    expect(await backfillLockReason(auditClient({ count: 0 }) as unknown as Admin, 'p')).toBeNull();
  });
  it('query error → DITOLAK dengan pesan gagal-cek (bukan dianggap boleh)', async () => {
    expect(await backfillLockReason(auditClient({ error: { message: 'timeout' } }) as unknown as Admin, 'p')).toBe(BACKFILL_CHECK_FAILED_MSG);
  });
  it('jumlah tak terbaca (count null) → ditolak', async () => {
    expect(await backfillLockReason(auditClient({ count: null }) as unknown as Admin, 'p')).toBe(BACKFILL_CHECK_FAILED_MSG);
  });
  it('koneksi putus (melempar) → ditolak', async () => {
    expect(await backfillLockReason(auditClient({ throws: true }) as unknown as Admin, 'p')).toBe(BACKFILL_CHECK_FAILED_MSG);
  });
  it('isBackfilledPeriod: gagal baca → true (terkunci)', async () => {
    expect(await isBackfilledPeriod(auditClient({ error: { message: 'x' } }) as unknown as Admin, 'p')).toBe(true);
    expect(await isBackfilledPeriod(auditClient({ count: 0 }) as unknown as Admin, 'p')).toBe(false);
  });
  it('pesan gagal-cek jelas & berbahasa Indonesia', () => {
    expect(BACKFILL_CHECK_FAILED_MSG).toMatch(/Tidak dapat memastikan.*hasil impor resmi.*ditolak/);
  });
});

describe('refreshLatePenalties — Skor 360° periode hasil impor tak pernah disentuh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('periode hasil impor → 0 perubahan, result_360 tak dibaca/ditulis', async () => {
    const admin = auditClient({ count: 1 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(admin as any);
    expect(await refreshLatePenalties('p-q1')).toBe(0);
    expect(await refreshLatePenalties('p-q1', [EMP])).toBe(0);
    expect(admin.touched.filter((t) => t !== 'hrd_audit_log')).toEqual([]);
  });

  it('pengecekan gagal → melempar (bukan diam-diam menerapkan)', async () => {
    const admin = auditClient({ error: { message: 'timeout' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(admin as any);
    await expect(refreshLatePenalties('p')).rejects.toThrow(BACKFILL_CHECK_FAILED_MSG);
    expect(admin.touched.filter((t) => t !== 'hrd_audit_log')).toEqual([]);
  });
});

describe('Flag Kepatuhan — aksi HRD di periode hasil impor ditolak dengan pesan', () => {
  function asHrd(adminRes: Parameters<typeof auditClient>[0]) {
    const session = {
      auth: { getUser: async () => ({ data: { user: { id: HRD } } }) },
      from: (t: string) => {
        const q = {
          select: () => q, eq: () => q, limit: () => q,
          maybeSingle: async () => ({ data: t === 'employees' ? { role: 'hrd', is_hrd_admin: false, hrd_sections: null } : { id: 'p-q1' } }),
          upsert: vi.fn(() => { throw new Error('tak boleh menulis penetapan'); }),
          delete: vi.fn(() => { throw new Error('tak boleh menghapus penetapan'); }),
        };
        return q;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createClient).mockResolvedValue(session as any);
    const admin = auditClient(adminRes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(admin as any);
    return admin;
  }
  beforeEach(() => vi.clearAllMocks());

  it('Terapkan Potongan di periode hasil impor → ditolak', async () => {
    asHrd({ count: 1 });
    expect(await applyLatePenalties()).toEqual({ ok: false, error: BACKFILL_LOCK_MSG });
  });
  it('Terapkan Potongan saat pengecekan gagal → ditolak', async () => {
    asHrd({ error: { message: 'timeout' } });
    expect(await applyLatePenalties()).toEqual({ ok: false, error: BACKFILL_CHECK_FAILED_MSG });
  });
  it('Ubah potongan pegawai di periode hasil impor → ditolak sebelum menyimpan', async () => {
    asHrd({ count: 1 });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Sakit', points: 0 })).toEqual({ ok: false, error: BACKFILL_LOCK_MSG });
  });
  it('Ubah potongan saat pengecekan gagal → ditolak', async () => {
    asHrd({ error: { message: 'timeout' } });
    expect(await setLateWaiver({ employeeId: EMP, reason: null })).toEqual({ ok: false, error: BACKFILL_CHECK_FAILED_MSG });
  });
});
