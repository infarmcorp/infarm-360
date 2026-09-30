import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient } from '@/lib/supabase/server';
import { saveWeights, saveEmployeeWeightOverride } from '@/app/(app)/admin/bobot/actions';

const mockCreate = vi.mocked(createClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const ZERO = { atasan: 0, peer: 0, cross: 0, bawahan: 0, self: 0, internal: 0 };

beforeEach(() => { vi.clearAllMocks(); });

describe('saveWeights — total bobot kelas wajib 100% (audit 2026-09-29)', () => {
  it('tolak 4-kelas yang totalnya bukan 100 (tanpa menyentuh DB)', async () => {
    const r = await saveWeights({ ...ZERO, model: '4class', atasan: 40, peer: 40, cross: 40, bawahan: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/100%/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tolak semua bobot 0 (dulu → pegawai hilang dari result_360 diam-diam)', async () => {
    const r = await saveWeights({ ...ZERO, model: '2class' });
    expect(r.ok).toBe(false);
  });

  it('bobot Self tidak ikut dihitung dalam total', async () => {
    const r = await saveWeights({ ...ZERO, model: '4class', atasan: 40, peer: 30, cross: 20, bawahan: 0, self: 10 });
    expect(r.ok).toBe(false); // 40+30+20 = 90 ≠ 100 (Self 10 diabaikan)
  });

  it('2-kelas total 100 lolos validasi (lanjut ke cek sesi)', async () => {
    use(makeClient({ user: null }));
    const r = await saveWeights({ ...ZERO, model: '2class', atasan: 40, internal: 60 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sesi berakhir/i); // lolos Zod, berhenti di otorisasi
  });
});

describe('saveEmployeeWeightOverride — aturan total 100% yang sama', () => {
  it('tolak total ≠ 100', async () => {
    const r = await saveEmployeeWeightOverride({ ...ZERO, model: '2class', atasan: 50, internal: 30, employeeId: EMP });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/100%/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('total 100 lolos validasi', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_hrd_admin: false } }] } }));
    const r = await saveEmployeeWeightOverride({ ...ZERO, model: '2class', atasan: 50, internal: 50, employeeId: EMP });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/i); // lolos Zod, ditolak otorisasi
  });
});
