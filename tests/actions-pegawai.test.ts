import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

// Modul efek-samping/DB di-mock; kita hanya menguji LOGIKA OTORISASI & GUARD server action.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { setHrdAdmin, setCoordinator } from '@/app/(app)/admin/pegawai/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockAdmin.mockReturnValue(c as any); }

const HRD = { role: 'hrd', is_hrd_admin: false };
const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';

beforeEach(() => { vi.clearAllMocks(); });

describe('setHrdAdmin — otorisasi & kebijakan divisi HRD', () => {
  it('tolak bila sesi berakhir (tak ada user)', async () => {
    use(makeClient({ user: null }));
    const r = await setHrdAdmin(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sesi berakhir/i);
  });

  it('tolak bila pelaku bukan HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false } }] } }));
    const r = await setHrdAdmin(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/i);
  });

  it('tolak GRANT untuk pegawai non-divisi-HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [
      { data: HRD },
      { data: { name: 'Budi', dept: 'Sales' } },
    ] } }));
    const r = await setHrdAdmin(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/divisi HRD/i);
  });

  it('IZINKAN grant untuk pegawai divisi HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [
      { data: HRD },
      { data: { name: 'Sari', dept: 'HRD-GA' } },
      { error: null },
    ] } }));
    const r = await setHrdAdmin(EMP, true);
    expect(r.ok).toBe(true);
  });

  it('IZINKAN pencabutan (value=false) walau divisi non-HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [
      { data: HRD },
      { data: { name: 'Budi', dept: 'Sales' } },
      { error: null },
    ] } }));
    const r = await setHrdAdmin(EMP, false);
    expect(r.ok).toBe(true);
  });
});

describe('setCoordinator — validasi input & otorisasi', () => {
  it('tolak employeeId non-UUID sebelum menyentuh DB', async () => {
    const r = await setCoordinator('bukan-uuid', true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tidak valid/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tolak bila pelaku bukan HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_hrd_admin: false } }] } }));
    const r = await setCoordinator(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/i);
  });

  it('grant sukses (HRD, value=true) tanpa pembersihan tim', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [
      { data: HRD },
      { data: { name: 'Rina' } },
      { error: null },
    ] } }));
    const r = await setCoordinator(EMP, true);
    expect(r.ok).toBe(true);
  });

  it('pencabutan (value=false) ikut membersihkan coordinator_team_members', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: { name: 'Rina' } }, { error: null }],
      coordinator_team_members: [{ error: null }],
    } }));
    const r = await setCoordinator(EMP, false);
    expect(r.ok).toBe(true);
  });
});
