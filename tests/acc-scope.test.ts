import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

// ACC Laporan Kinerja Tim — lingkup ditegakkan SERVER (audit no. 12, gelombang 2b poin 3):
// bukan laporan sendiri; HRD (Mode SPV) hanya pegawai sedivisi (bukan Direksi/eksternal); SPV hanya
// anggota timnya; disimpan via service_role (HRD tanpa akses bagian Laporan tetap bisa — paritas SPV).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/report', () => ({ isDireksiReviewSubject: vi.fn(async () => true) }));
vi.mock('@/lib/audit/log', () => ({ logAuditAsService: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logAuditAsService } from '@/lib/audit/log';
import { setSpvAcc } from '@/app/(app)/laporan-tim/actions';

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const AP = { data: { id: 'p1' } };
const SELF_MSG = 'Anda tidak dapat meng-ACC laporan Anda sendiri.';
const HRD_SCOPE_MSG = 'HRD (Mode SPV) hanya dapat meng-ACC pegawai di divisinya sendiri (bukan Direksi atau pegawai eksternal).';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (me: unknown) => vi.mocked(createClient).mockResolvedValue(makeClient({ user: { id: UID }, tables: { employees: [{ data: me }], periods: [AP] } }) as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (tables: Record<string, QResult[]>) => { const c = makeClient({ tables }); vi.mocked(createAdminClient).mockReturnValue(c as any); return c; };
/** Alur sukses setelah lingkup lolos: bukan berkoordinator → status in_review → update 1 baris → nama untuk log. */
const AFTER_SCOPE = {
  coordinator_team_members: [{ data: null }],
  final_reports: [{ data: { status: 'in_review' } }, { data: [{ employee_id: EMP }] }],
};
const accUpdates = (c: MockClient) => c.calls.filter((x) => x.table === 'final_reports' && x.op === 'update');

const SPV = { role: 'spv', is_coordinator: false, is_hrd_admin: false, hrd_sections: null, dept: 'Ops', name: 'Sinta' };
const HRD = { role: 'hrd', is_coordinator: false, is_hrd_admin: false, hrd_sections: null, dept: 'HRD-GA', name: 'Hana' };
const HRD_NO_LAPORAN = { ...HRD, hrd_sections: ['pegawai'] };

beforeEach(() => vi.clearAllMocks());

describe('setSpvAcc — anggota sah → berhasil', () => {
  it('SPV meng-ACC anggota timnya', async () => {
    use(SPV);
    const admin = useAdmin({ spv_team_members: [{ data: { employee_id: EMP } }], ...AFTER_SCOPE, employees: [{ data: { name: 'Budi' } }] });
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: true, acc: true });
    expect(accUpdates(admin)).toHaveLength(1);
    expect(vi.mocked(logAuditAsService)).toHaveBeenCalledWith(expect.objectContaining({ action: 'report.acc', meta: { acc: true, via: 'SPV' } }), { id: UID, name: 'Sinta' });
  });

  it('HRD (Mode SPV) meng-ACC pegawai sedivisi', async () => {
    use(HRD);
    const admin = useAdmin({ employees: [{ data: { dept: 'HRD-GA', role: 'employee', is_external: false } }, { data: { name: 'Budi' } }], ...AFTER_SCOPE });
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: true, acc: true });
    expect(accUpdates(admin)).toHaveLength(1);
    expect(vi.mocked(logAuditAsService)).toHaveBeenCalledWith(expect.objectContaining({ meta: { acc: true, via: 'HRD (Mode SPV)' } }), expect.anything());
  });

  it('HRD TANPA akses bagian Laporan tetap bisa meng-ACC anggota divisinya (paritas SPV)', async () => {
    use(HRD_NO_LAPORAN);
    const admin = useAdmin({ employees: [{ data: { dept: 'HRD-GA', role: 'employee', is_external: false } }, { data: { name: 'Budi' } }], ...AFTER_SCOPE });
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: true, acc: true });
    expect(accUpdates(admin)).toHaveLength(1);
  });
});

describe('setSpvAcc — ditolak', () => {
  it('laporan SENDIRI (SPV) → ditolak sebelum membaca apa pun', async () => {
    use({ ...SPV });
    const admin = useAdmin({});
    expect(await setSpvAcc(UID, true)).toEqual({ ok: false, error: SELF_MSG });
    expect(admin.calls).toHaveLength(0);
  });

  it('laporan SENDIRI (HRD) → ditolak', async () => {
    use(HRD);
    useAdmin({});
    expect(await setSpvAcc(UID, true)).toEqual({ ok: false, error: SELF_MSG });
  });

  it('HRD + pegawai divisi lain → ditolak, tak ada yang ditulis', async () => {
    use(HRD);
    const admin = useAdmin({ employees: [{ data: { dept: 'Sales', role: 'employee', is_external: false } }] });
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: false, error: HRD_SCOPE_MSG });
    expect(accUpdates(admin)).toHaveLength(0);
  });

  it('HRD + target Direksi / eksternal (walau sedivisi) → ditolak', async () => {
    use(HRD);
    useAdmin({ employees: [{ data: { dept: 'HRD-GA', role: 'direksi', is_external: false } }] });
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: false, error: HRD_SCOPE_MSG });
    use(HRD);
    useAdmin({ employees: [{ data: { dept: 'HRD-GA', role: 'employee', is_external: true } }] });
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: false, error: HRD_SCOPE_MSG });
  });

  it('SPV + pegawai di luar timnya → ditolak, tak ada yang ditulis', async () => {
    use(SPV);
    const admin = useAdmin({ spv_team_members: [{ data: null }] });
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: false, error: 'Pegawai ini bukan anggota tim Anda.' });
    expect(accUpdates(admin)).toHaveLength(0);
  });

  it('pegawai ber-izin HRD tanpa posisi SPV/HRD → ditolak (tak punya Menu Supervisor)', async () => {
    use({ role: 'employee', is_coordinator: false, is_hrd_admin: true, hrd_sections: null, dept: 'HRD-GA', name: 'Rina' });
    useAdmin({});
    expect(await setSpvAcc(EMP, true)).toEqual({ ok: false, error: 'Hanya SPV, Koordinator, Direksi, atau HRD (Mode SPV) yang dapat memberi ACC.' });
  });
});
