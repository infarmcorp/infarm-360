import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

// Modul efek-samping/DB di-mock; kita hanya menguji LOGIKA OTORISASI & GUARD server action.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { setHrdAdmin, setCoordinator, setCoordinatorTeam, setHrdSections, resetPassword } from '@/app/(app)/admin/pegawai/actions';

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

describe('HRD terbatas (hrd_sections) — tak bisa menaikkan izin (audit 2026-09-30)', () => {
  const LIMITED = { role: 'hrd', is_hrd_admin: false, hrd_sections: ['ekspor'] };
  const LIMITED_PEGAWAI = { role: 'employee', is_hrd_admin: true, hrd_sections: ['pegawai'] };

  it('tolak setHrdAdmin oleh HRD terbatas', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: LIMITED_PEGAWAI }] } }));
    const r = await setHrdAdmin(EMP, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/akses penuh/i);
  });

  it('tolak setHrdSections (termasuk untuk dirinya) oleh HRD terbatas', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: LIMITED_PEGAWAI }] } }));
    const r = await setHrdSections(UID, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/akses penuh/i);
  });

  it('tolak setCoordinator oleh HRD terbatas', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: LIMITED_PEGAWAI }] } }));
    const r = await setCoordinator(EMP, true);
    expect(r.ok).toBe(false);
  });

  it('tolak resetPassword oleh HRD tanpa bagian Kelola Pegawai', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: LIMITED }] } }));
    const r = await resetPassword(EMP, 'SandiBaru123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Kelola Pegawai/i);
  });

  it('tolak resetPassword akun HRD/Direksi oleh HRD terbatas (bagian Kelola Pegawai)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [
      { data: LIMITED_PEGAWAI },
      { data: { role: 'direksi', is_hrd_admin: false } },
    ] } }));
    const r = await resetPassword(EMP, 'SandiBaru123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/HRD \/ Direksi/i);
  });

  it('IZINKAN resetPassword pegawai biasa oleh HRD terbatas (bagian Kelola Pegawai)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [
      { data: LIMITED_PEGAWAI },
      { data: { role: 'employee', is_hrd_admin: false } },
      { data: { name: 'Budi' } },
    ] } }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue({ auth: { admin: { updateUserById: async () => ({ error: null }) } } } as any);
    const r = await resetPassword(EMP, 'SandiBaru123');
    expect(r.ok).toBe(true);
  });
});

describe('setCoordinatorTeam — anggota wajib SEDIVISI dgn koordinator (2026-10-07)', () => {
  const COORD = '22222222-2222-2222-2222-222222222222';
  const A = '33333333-3333-3333-3333-333333333333';
  const B = '44444444-4444-4444-4444-444444444444';

  it('tolak bila ada anggota beda divisi (tanpa menghapus tim lama)', async () => {
    const c = makeClient({ user: { id: UID }, tables: { employees: [
      { data: HRD },
      { data: { name: 'Andi', is_coordinator: true, dept: 'Sales' } },
      { data: [{ id: A, name: 'Citra', dept: 'Sales' }, { id: B, name: 'Dodi', dept: 'Finance' }] },
    ] } });
    use(c);
    const r = await setCoordinatorTeam(COORD, [A, B]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sedivisi.*Dodi/i);
    expect(c.calls.some((x) => x.table === 'coordinator_team_members')).toBe(false);
  });

  it('IZINKAN bila semua anggota sedivisi', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [
        { data: HRD },
        { data: { name: 'Andi', is_coordinator: true, dept: 'Sales' } },
        { data: [{ id: A, name: 'Citra', dept: 'Sales' }, { id: B, name: 'Dodi', dept: 'Sales' }] },
      ],
      coordinator_team_members: [{ error: null }, { error: null }],
    } }));
    const r = await setCoordinatorTeam(COORD, [A, B]);
    expect(r.ok).toBe(true);
  });
});
