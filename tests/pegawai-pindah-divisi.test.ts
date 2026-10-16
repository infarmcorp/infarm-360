import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

// Izin HRD hanya untuk pegawai divisi HRD-GA: memindahkan pemegang izin HRD ke divisi lain DITOLAK
// sampai izinnya dicabut dulu (keputusan pemilik, audit gelombang 2).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { updateEmployee } from '@/app/(app)/admin/pegawai/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const HRD_ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const MSG = 'Cabut izin HRD pegawai ini terlebih dahulu sebelum memindahkan divisinya.';

function input(dept: string) {
  return { id: EMP, name: 'Sari Dewi', empCode: 'EMP010', dept, role: 'employee', email: 'sari@x.id', spvId: null };
}
function adminClient() {
  return { auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email: 'sari@x.id' } } })), updateUserById: vi.fn() } } };
}
/** HRD penuh mengubah pegawai `target` (baris employees sebelum diubah). */
function setup(target: { is_hrd_admin: boolean; dept: string; role?: string }): MockClient {
  const c = makeClient({ user: { id: HRD_ME }, tables: {
    employees: [
      { data: { role: 'hrd', is_hrd_admin: false, hrd_sections: null } },   // requireHrd
      { data: { role: target.role ?? 'employee', ...target } },            // data pegawai saat ini
      { error: null },                                                     // update
    ],
    spv_team_members: [{ error: null }],
  } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(c as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(adminClient() as any);
  return c;
}
const updates = (c: MockClient) => c.calls.filter((k) => k.table === 'employees' && k.op === 'update');

beforeEach(() => { vi.clearAllMocks(); });

describe('updateEmployee — pemegang izin HRD pindah divisi', () => {
  it('(a) pindah antar-divisi biasa (tanpa izin HRD) tetap jalan', async () => {
    const c = setup({ is_hrd_admin: false, dept: 'Sales' });
    const r = await updateEmployee(input('Finance'));
    expect(r).toEqual({ ok: true, msg: 'Perubahan disimpan.' });
    expect(updates(c)[0].payload).toMatchObject({ dept: 'Finance' });
  });

  it('(b) pemegang izin HRD dipindah ke luar HRD → ditolak, tak ada yang disimpan', async () => {
    const c = setup({ is_hrd_admin: true, dept: 'HRD-GA' });
    const r = await updateEmployee(input('Sales'));
    expect(r).toEqual({ ok: false, error: MSG });
    expect(updates(c)).toHaveLength(0);
  });

  it('(b) pemegang izin HRD tetap di HRD-GA (ubah nama/data lain) → boleh', async () => {
    const c = setup({ is_hrd_admin: true, dept: 'HRD-GA' });
    const r = await updateEmployee(input('HRD-GA'));
    expect(r.ok).toBe(true);
    expect(updates(c)).toHaveLength(1);
  });

  it('(c) setelah izin HRD dicabut → pemindahan berhasil', async () => {
    const c = setup({ is_hrd_admin: false, dept: 'HRD-GA' });
    const r = await updateEmployee(input('Sales'));
    expect(r.ok).toBe(true);
    expect(updates(c)[0].payload).toMatchObject({ dept: 'Sales' });
  });
});
