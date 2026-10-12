import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

// Aktifkan & Hapus Periode lewat fungsi database 0048 (satu transaksi), dengan cadangan ke cara lama
// bila migrasi belum diterapkan (audit gelombang 2b, poin 2d).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { activatePeriod, deletePeriod } from '@/app/(app)/admin/periode/actions';

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PID = '22222222-2222-2222-2222-222222222222';
const HRD = { data: { role: 'hrd', is_hrd_admin: false, hrd_sections: null } };

type Rpc = { fn: string; args: unknown };
/** Klien service_role: antrean tabel + jawaban RPC per nama fungsi. */
function adminWith(rpcRes: Record<string, { data: unknown; error: unknown }>, tables: Record<string, { data?: unknown; error?: unknown }[]> = {}) {
  const c = makeClient({ tables });
  const rpcs: Rpc[] = [];
  return Object.assign(c, { rpcs, rpc: async (fn: string, args: unknown) => { rpcs.push({ fn, args }); return rpcRes[fn]; } });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => vi.mocked(createClient).mockResolvedValue(c as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (c: unknown) => vi.mocked(createAdminClient).mockReturnValue(c as any);
const updates = (c: MockClient) => c.calls.filter((x) => x.op === 'update' || x.op === 'delete');

beforeEach(() => vi.clearAllMocks());

describe('activatePeriod — satu transaksi lewat period_activate', () => {
  it('fungsi ada → dipanggil sekali, TANPA pembaruan bertahap; label dari fungsi masuk Log', async () => {
    const user = makeClient({ user: { id: UID }, tables: { employees: [HRD] } });
    use(user);
    const admin = adminWith({ period_activate: { data: 'Q4 2026', error: null } });
    useAdmin(admin);
    expect(await activatePeriod(PID)).toEqual({ ok: true });
    expect(admin.rpcs).toEqual([{ fn: 'period_activate', args: { p_period: PID } }]);
    expect(updates(user)).toHaveLength(0);
    expect(vi.mocked(logHrdAction).mock.calls[0][0]).toMatchObject({ action: 'period.activate', targetLabel: 'Q4 2026' });
  });

  it('fungsi gagal (mis. periode tak ditemukan) → error, cara lama TIDAK dijalankan', async () => {
    const user = makeClient({ user: { id: UID }, tables: { employees: [HRD] } });
    use(user);
    useAdmin(adminWith({ period_activate: { data: null, error: { code: 'P0002', message: 'Periode tidak ditemukan' } } }));
    expect(await activatePeriod(PID)).toEqual({ ok: false, error: 'Gagal: Periode tidak ditemukan' });
    expect(updates(user)).toHaveLength(0);
    expect(logHrdAction).not.toHaveBeenCalled();
  });

  // Jalur cadangan (fungsi belum ada → cara lama dua langkah) dikunci di tests/actions-periode.test.ts
  // (mock lokal di sana mendukung .neq & merespons "fungsi belum ada").
});

describe('deletePeriod — satu transaksi lewat period_delete', () => {
  const ENDED = { data: { label: 'Q1 2026', status: 'ended' } };

  it('fungsi ada → dipanggil sekali, tanpa hapus bertahap; jumlah dari fungsi masuk Log', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    const admin = adminWith(
      { period_delete: { data: { label: 'Q1 2026', months: ['2026-01'], kpi_deleted: 12, kpi_audit_deleted: 15 }, error: null } },
      { periods: [ENDED] },
    );
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: true });
    expect(admin.rpcs).toEqual([{ fn: 'period_delete', args: { p_period: PID } }]);
    expect(updates(admin)).toHaveLength(0);
    expect(vi.mocked(logHrdAction).mock.calls[0][0]).toMatchObject({
      action: 'period.delete', meta: { kpi_deleted: 12, kpi_audit_deleted: 15, months: ['2026-01'] },
    });
  });

  it('fungsi gagal → error, tak ada penghapusan bertahap & tanpa Log', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [HRD] } }));
    const admin = adminWith({ period_delete: { data: null, error: { code: '23503', message: 'masih dirujuk' } } }, { periods: [ENDED] });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: false, error: 'Gagal menghapus periode: masih dirujuk' });
    expect(updates(admin)).toHaveLength(0);
    expect(logHrdAction).not.toHaveBeenCalled();
  });

  // Jalur cadangan dikunci di tests/actions-periode.test.ts (blok deletePeriod).
});
