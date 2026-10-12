import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

// saveKpiScores: cek peran/lingkup DULU, baru membaca data pegawai via service_role — agar pemanggil
// tak berwenang tak bisa mengetahui nama pegawai dari pesan error (temuan audit no. 8).
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { saveKpiScores } from '@/app/(app)/kpi/actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => { vi.mocked(createClient).mockResolvedValue(c as any); return c; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (c: MockClient) => { vi.mocked(createAdminClient).mockReturnValue(c as any); return c; };

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const ROWS = [{ employeeId: EMP, score: 90 }];
const EXTERNAL = { data: [{ id: EMP, name: 'Budi Rahasia', is_active: true, left_on: null, is_external: true }] };
const nameLookups = (c: MockClient) => c.calls.filter((x) => x.table === 'employees');

beforeEach(() => vi.clearAllMocks());

describe('saveKpiScores — peran & lingkup dicek sebelum membaca data pegawai', () => {
  it('(a) pegawai biasa + id eksternal → ditolak karena peran, TANPA nama, tanpa lookup pegawai', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_coordinator: false, dept: 'Ops' } }] } }));
    const admin = useAdmin(makeClient({ tables: { employees: [EXTERNAL] } }));
    const r = await saveKpiScores({ ym: '2026-09', rows: ROWS });
    expect(r).toEqual({ ok: false, error: 'Hanya SPV, Koordinator, atau HRD (Mode SPV) yang dapat mengubah KPI.' });
    expect(nameLookups(admin)).toHaveLength(0);
  });

  it('SPV + id di luar timnya → ditolak lingkup, TANPA nama', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_coordinator: false, dept: 'Ops' } }] } }));
    const admin = useAdmin(makeClient({ tables: { spv_team_members: [{ data: [] }], employees: [EXTERNAL] } }));
    const r = await saveKpiScores({ ym: '2026-09', rows: ROWS });
    expect(r).toEqual({ ok: false, error: 'Sebagian pegawai berada di luar tim Anda.' });
    expect(nameLookups(admin)).toHaveLength(0);
  });

  it('Koordinator + id di luar tim koordinasinya → ditolak, TANPA nama', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_coordinator: true, dept: 'Ops' } }] } }));
    const admin = useAdmin(makeClient({ tables: { coordinator_team_members: [{ data: [] }], employees: [EXTERNAL] } }));
    const r = await saveKpiScores({ ym: '2026-09', rows: ROWS });
    expect(r).toEqual({ ok: false, error: 'Sebagian pegawai berada di luar tim koordinasi Anda.' });
    expect(nameLookups(admin)).toHaveLength(0);
  });

  it('(b) SPV yang sah (anggota timnya) tetap mendapat pesan "eksternal" yang sama seperti sekarang', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_coordinator: false, dept: 'Ops' } }] } }));
    useAdmin(makeClient({ tables: { spv_team_members: [{ data: [{ employee_id: EMP }] }], employees: [EXTERNAL] } }));
    const r = await saveKpiScores({ ym: '2026-09', rows: ROWS });
    expect(r).toEqual({ ok: false, error: 'Pegawai eksternal tidak memiliki KPI: Budi Rahasia.' });
  });

  it('Koordinator yang sah tetap mendapat pesan "eksternal" yang sama', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_coordinator: true, dept: 'Ops' } }] } }));
    useAdmin(makeClient({ tables: { coordinator_team_members: [{ data: [{ employee_id: EMP }] }], employees: [EXTERNAL] } }));
    const r = await saveKpiScores({ ym: '2026-09', rows: ROWS });
    expect(r).toEqual({ ok: false, error: 'Pegawai eksternal tidak memiliki KPI: Budi Rahasia.' });
  });
});
