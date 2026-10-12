import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';
import { fakeDb } from './helpers/fake-postgrest';

// Sisa celah kunci laporan Final (gelombang 2b): (1) rekonsiliasi Skor 360° setelah Hapus Pemetaan tak
// boleh menghapus Skor 360° pegawai Final; (2) daftar "potongan belum diterapkan" tak menghitung
// pegawai Final (potongannya memang sengaja tak diterapkan — kalau dihitung, peringatannya abadi).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/app/(app)/admin/360/actions', () => ({ computeResult360: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/backfill-guard', async (orig) => ({ ...(await orig()), backfillLockReason: vi.fn(async () => null) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { deleteMapping } from '@/app/(app)/admin/pemetaan/actions';
import { loadPendingLatePenalties } from '@/lib/late-server';

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASR = '11111111-1111-1111-1111-111111111111';
const TGT = '22222222-2222-2222-2222-222222222222';
const withCount = (n: number): QResult => ({ data: null, error: null, count: n } as QResult);

beforeEach(() => vi.clearAllMocks());

describe('Hapus Pemetaan → rekonsiliasi Skor 360° target', () => {
  /** Target tanpa penilaian terkirim tersisa → biasanya Skor 360°-nya dihapus. */
  function setup(targetFinal: boolean) {
    const user = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'hrd', is_hrd_admin: false, hrd_sections: null } }],
      mappings: [{ data: { assessor_id: ASR, target_id: TGT, period_id: 'p1' } }, { error: null }],
    } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createClient).mockResolvedValue(user as any);
    const admin = makeClient({ tables: {
      assessments: [{ data: { status: 'draft' } }, { data: [] }, withCount(0)],
      final_reports: [{ data: targetFinal ? [{ employee_id: TGT }] : [], error: null }],
      result_360: [{ error: null }],
      employees: [{ data: [] }],
    } });
    // mock bersama tak punya .range() (dipakai fetchAllByIds pada cek Final) → tambahkan di sini saja.
    const origFrom = admin.from;
    admin.from = (t: string) => { const b = origFrom(t); return Object.assign(b, { range: () => b }); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(admin as any);
    return admin;
  }
  const r360Deletes = (c: MockClient) => c.calls.filter((x) => x.table === 'result_360' && x.op === 'delete');

  it('target belum Final → Skor 360° yang tak berdasar lagi dihapus (seperti sebelumnya)', async () => {
    const admin = setup(false);
    expect((await deleteMapping('m1', 'salah pasang penilai')).ok).toBe(true);
    expect(r360Deletes(admin)).toHaveLength(1);
  });

  it('target sudah Final → Skor 360°-nya TIDAK dihapus', async () => {
    const admin = setup(true);
    expect((await deleteMapping('m1', 'salah pasang penilai')).ok).toBe(true);
    expect(r360Deletes(admin)).toHaveLength(0);
  });
});

describe('loadPendingLatePenalties — pegawai Final tak dihitung "belum diterapkan"', () => {
  const by = new Map([[ASR, { penalty: 3 }], [TGT, { penalty: 3 }]]) as unknown as Parameters<typeof loadPendingLatePenalties>[1];
  function db(final: string[], fail = false) {
    return fakeDb({
      result_360: [{ employee_id: ASR, period_id: 'p1', late_penalty: 0 }, { employee_id: TGT, period_id: 'p1', late_penalty: 0 }],
      final_reports: final.map((id) => ({ employee_id: id, period_id: 'p1', status: 'finalized' })),
    }, fail ? { failOn: ['final_reports'] } : {});
  }

  it('belum ada yang Final → keduanya tertunda (seperti sebelumnya)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(db([]) as any);
    expect((await loadPendingLatePenalties('p1', by)).map((p) => p.employeeId).sort()).toEqual([ASR, TGT].sort());
  });

  it('pegawai Final dikecualikan', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(db([TGT]) as any);
    expect((await loadPendingLatePenalties('p1', by)).map((p) => p.employeeId)).toEqual([ASR]);
  });

  it('status Final gagal dibaca → tetap tampil semua (hanya peringatan, bukan perubahan data)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createAdminClient).mockReturnValue(db([TGT], true) as any);
    expect((await loadPendingLatePenalties('p1', by))).toHaveLength(2);
  });
});
