import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient } from './helpers/mock-supabase';

// Login via dropdown: browser hanya menerima id/nama/peran/divisi; email dicari di SERVER dari id.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { loadLoginRoster } from '@/lib/auth/login-roster';
import { LOGIN_FAILED } from '@/lib/auth/login-messages';
import { signInWithLoginId } from '@/app/login/actions';
import { DEMO_USERS } from '@/lib/auth/demo-users';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const ID_X = '99999999-9999-9999-9999-999999999999';

type AuthUser = { id: string; email?: string };

/** Admin client: tabel via mock-supabase + auth.admin (listUsers/getUserById) dari daftar user auth. */
function adminWith(tables: Record<string, { data?: unknown; error?: unknown }[]>, authUsers: AuthUser[]) {
  const c = makeClient({ tables });
  return Object.assign(c, {
    auth: {
      ...c.auth,
      admin: {
        listUsers: vi.fn(async () => ({ data: { users: authUsers }, error: null })),
        getUserById: vi.fn(async (id: string) => {
          const u = authUsers.find((x) => x.id === id);
          return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'User not found' } };
        }),
      },
    },
  });
}

/** Client sesi (cookie): signInWithPassword sukses hanya untuk pasangan email+sandi yang cocok. */
function sessionWith(valid: { email: string; password: string }) {
  const signInWithPassword = vi.fn(async ({ email, password }: { email: string; password: string }) =>
    email === valid.email && password === valid.password
      ? { data: { user: { id: 'u' } }, error: null }
      : { data: { user: null }, error: { message: 'Invalid login credentials' } });
  return { auth: { signInWithPassword } };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('loadLoginRoster — data yang dikirim ke halaman login', () => {
  it('TIDAK mengandung email; hanya id, nama, peran, divisi', async () => {
    mockAdmin.mockReturnValue(adminWith({ employees: [{ data: [
      { id: ID_A, name: 'Andi', role: 'employee', dept: 'Ops' },
      { id: ID_B, name: 'Budi', role: 'spv', dept: 'Ops' },
    ] }] }, [{ id: ID_A, email: 'andi@x.id' }, { id: ID_B, email: 'budi@x.id' }]) as never);
    const roster = await loadLoginRoster();
    expect(roster).toEqual([
      { id: ID_A, name: 'Andi', role: 'employee', dept: 'Ops' },
      { id: ID_B, name: 'Budi', role: 'spv', dept: 'Ops' },
    ]);
    const json = JSON.stringify(roster);
    expect(json).not.toMatch(/@/);
    roster.forEach((u) => expect(Object.keys(u).sort()).toEqual(['dept', 'id', 'name', 'role']));
  });

  it('pegawai tanpa akun auth (tanpa email) tetap disaring seperti sebelumnya', async () => {
    mockAdmin.mockReturnValue(adminWith({ employees: [{ data: [
      { id: ID_A, name: 'Andi', role: 'employee', dept: 'Ops' },
      { id: ID_B, name: 'Budi', role: 'spv', dept: 'Ops' },
    ] }] }, [{ id: ID_A, email: 'andi@x.id' }]) as never);
    expect((await loadLoginRoster()).map((u) => u.id)).toEqual([ID_A]);
  });

  it('hanya pegawai AKTIF yang diambil', async () => {
    const admin = adminWith({ employees: [{ data: [] }] }, []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(admin as any);
    await loadLoginRoster();
    expect(admin.calls[0].filters).toContainEqual(['eq', 'is_active', true]);
  });

  it('fallback demo (service key tak ada) juga tanpa email', async () => {
    mockAdmin.mockImplementation(() => { throw new Error('supabaseKey is required'); });
    const roster = await loadLoginRoster();
    expect(roster.length).toBe(DEMO_USERS.length);
    expect(JSON.stringify(roster)).not.toMatch(/@/);
  });
});

describe('signInWithLoginId — login lewat dropdown (id + sandi)', () => {
  it('id + sandi benar → sukses, login memakai email yang dicari server', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(adminWith({ employees: [{ data: { id: ID_A } }] }, [{ id: ID_A, email: 'andi@x.id' }]) as any);
    const session = sessionWith({ email: 'andi@x.id', password: 'rahasia' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(session as any);
    const r = await signInWithLoginId(ID_A, 'rahasia');
    expect(r).toEqual({ ok: true });
    expect(session.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'andi@x.id', password: 'rahasia' });
  });

  it('id tak dikenal dan sandi salah → pesan gagal IDENTIK', async () => {
    // id tak dikenal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(adminWith({ employees: [{ data: null }] }, []) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(sessionWith({ email: 'andi@x.id', password: 'rahasia' }) as any);
    const unknown = await signInWithLoginId(ID_X, 'rahasia');

    // sandi salah
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(adminWith({ employees: [{ data: { id: ID_A } }] }, [{ id: ID_A, email: 'andi@x.id' }]) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(sessionWith({ email: 'andi@x.id', password: 'rahasia' }) as any);
    const wrong = await signInWithLoginId(ID_A, 'salah');

    expect(unknown).toEqual({ ok: false, error: LOGIN_FAILED });
    expect(wrong).toEqual({ ok: false, error: LOGIN_FAILED });
  });

  it('input kosong/rusak → pesan gagal yang sama, tanpa menyentuh DB', async () => {
    expect(await signInWithLoginId('', 'x')).toEqual({ ok: false, error: LOGIN_FAILED });
    expect(await signInWithLoginId(ID_A, '')).toEqual({ ok: false, error: LOGIN_FAILED });
    expect(await signInWithLoginId(123 as unknown as string, 'x')).toEqual({ ok: false, error: LOGIN_FAILED });
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('pegawai NONAKTIF ditolak (lookup hanya is_active) dengan pesan yang sama', async () => {
    const admin = adminWith({ employees: [{ data: null }] }, [{ id: ID_A, email: 'andi@x.id' }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(admin as any);
    const session = sessionWith({ email: 'andi@x.id', password: 'rahasia' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(session as any);
    const r = await signInWithLoginId(ID_A, 'rahasia');
    expect(r).toEqual({ ok: false, error: LOGIN_FAILED });
    expect(admin.calls[0].filters).toContainEqual(['eq', 'is_active', true]);
    expect(session.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('akun ter-ban (nonaktif di Auth) → Supabase menolak → pesan yang sama', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(adminWith({ employees: [{ data: { id: ID_A } }] }, [{ id: ID_A, email: 'andi@x.id' }]) as any);
    const signInWithPassword = vi.fn(async () => ({ data: { user: null }, error: { message: 'User is banned' } }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue({ auth: { signInWithPassword } } as any);
    expect(await signInWithLoginId(ID_A, 'rahasia')).toEqual({ ok: false, error: LOGIN_FAILED });
  });
});
