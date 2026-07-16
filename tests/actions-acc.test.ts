import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/report', () => ({ isDireksiReviewSubject: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isDireksiReviewSubject } from '@/lib/report';
import { setSpvAcc } from '@/app/(app)/laporan-tim/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const mockIsDireksiSubject = vi.mocked(isDireksiReviewSubject);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockAdmin.mockReturnValue(c as any); }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const AP = { data: { id: 'p1' } };

beforeEach(() => { vi.clearAllMocks(); });

describe('setSpvAcc — guard umum', () => {
  it('tolak bila sesi berakhir', async () => {
    use(makeClient({ user: null }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sesi berakhir/i);
  });

  it('tolak bila tak ada periode aktif', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv' } }], periods: [{ data: null }] } }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/periode aktif/i);
  });
});

describe('setSpvAcc — jalur SPV', () => {
  it('tolak ACC pegawai yang punya koordinator (di-ACC koordinatornya)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_coordinator: false } }], periods: [AP] } }));
    useAdmin(makeClient({ tables: { coordinator_team_members: [{ data: { employee_id: EMP } }] } }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/koordinatornya/i);
  });

  it('tolak bila laporan belum dirilis (status draft)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'spv', is_coordinator: false } }],
      periods: [AP],
      final_reports: [{ data: { status: 'draft' } }],
    } }));
    useAdmin(makeClient({ tables: { coordinator_team_members: [{ data: null }] } }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/belum dirilis/i);
  });

  it('ACC sukses (in_review, bukan pegawai berkoordinator)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'spv', is_coordinator: false } }],
      periods: [AP],
      final_reports: [{ data: { status: 'in_review' } }, { data: [{ employee_id: EMP }] }],
    } }));
    useAdmin(makeClient({ tables: { coordinator_team_members: [{ data: null }] } }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.acc).toBe(true);
  });
});

describe('setSpvAcc — jalur Koordinator', () => {
  it('tolak bila pegawai bukan di bawah koordinasinya', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_coordinator: true } }], periods: [AP] } }));
    useAdmin(makeClient({ tables: { coordinator_team_members: [{ data: null }] } }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/koordinasi Anda/i);
  });

  it('ACC sukses untuk pegawai naungannya (in_review)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_coordinator: true } }], periods: [AP] } }));
    useAdmin(makeClient({ tables: {
      coordinator_team_members: [{ data: { employee_id: EMP } }],
      final_reports: [{ data: { status: 'in_review' } }, { error: null }],
    } }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.acc).toBe(true);
  });
});

describe('setSpvAcc — jalur Direksi', () => {
  it('tolak bila subjek bukan SPV/pemimpin tim', async () => {
    mockIsDireksiSubject.mockResolvedValue(false);
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'direksi' } }], periods: [AP] } }));
    useAdmin(makeClient({}));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/laporan SPV/i);
  });

  it('ACC sukses untuk subjek SPV (finalized)', async () => {
    mockIsDireksiSubject.mockResolvedValue(true);
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'direksi' } }], periods: [AP] } }));
    useAdmin(makeClient({ tables: { final_reports: [{ data: { status: 'finalized' } }, { error: null }] } }));
    const r = await setSpvAcc(EMP, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.acc).toBe(true);
  });
});
