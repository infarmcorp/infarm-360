import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

/**
 * KUNCI LAPORAN FINAL pada jalur KPI & Bobot Penilai (keputusan pemilik 2026-10-12): bila laporan
 * pegawai sudah Final, angka yang memengaruhinya (KPI bulanan, bobot khusus pegawai, bobot periode)
 * tak boleh berubah sampai HRD menekan "Buka Kembali (ke Draf)". Penegakan di SERVER.
 *
 * Tiap jalur diuji tiga keadaan: (a) belum Final → jalan seperti biasa; (b) Final → ditolak dgn pesan
 * helper & TIDAK ada penulisan; (c) sesudah Buka Kembali (helper kembali null) → jalan lagi.
 * Helper kunci sendiri diuji di final-lock.test.ts — di sini cukup dikendalikan nilai kembaliannya.
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
vi.mock('@/lib/final-lock', async (orig) => ({
  ...(await orig<typeof import('@/lib/final-lock')>()),
  finalLockError: vi.fn(async () => null),
  finalLockErrorForMonths: vi.fn(async () => null),
  periodLockError: vi.fn(async () => null),
}));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { finalLockError, finalLockErrorForMonths, periodLockError, finalLockMsg, periodFinalLockMsg } from '@/lib/final-lock';
import { saveKpiScores, deleteKpiScore } from '@/app/(app)/kpi/actions';
import { saveWeights, saveEmployeeWeightOverride, removeEmployeeWeightOverride } from '@/app/(app)/admin/bobot/actions';

type Rpc = { rpc: ReturnType<typeof vi.fn> };
type Svc = MockClient & Rpc;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setUser = (c: MockClient) => { vi.mocked(createClient).mockResolvedValue(c as any); return c; };
/** Client service_role + `rpc` (kpi_save_with_audit / kpi_delete_with_audit) yang merekam pemanggilan. */
function setAdmin(c: MockClient, rpcResult: { data?: unknown; error: unknown } = { data: null, error: null }): Svc {
  const svc: Svc = { ...c, rpc: vi.fn(async () => rpcResult) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(createAdminClient).mockReturnValue(svc as any);
  return svc;
}
const writes = (c: MockClient) => c.calls.filter((x) => x.op !== 'select');

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const EMP2 = '22222222-2222-2222-2222-222222222222';
const PID = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const YM = '2026-09';
const LOCKED = finalLockMsg(['Budi']);

const HRD = { role: 'hrd', is_coordinator: false, is_hrd_admin: true, dept: 'Ops' };
const SPV = { role: 'spv', is_coordinator: false, is_hrd_admin: false, dept: 'Ops' };
const COORD = { role: 'employee', is_coordinator: true, is_hrd_admin: false, dept: 'Ops' };
const active = (ids: string[]) => ({ data: ids.map((id) => ({ id, name: id === EMP ? 'Budi' : 'Sari', is_active: true, left_on: null, is_external: false })) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(finalLockError).mockResolvedValue(null);
  vi.mocked(finalLockErrorForMonths).mockResolvedValue(null);
  vi.mocked(periodLockError).mockResolvedValue(null);
});

// ── KPI: simpan ──────────────────────────────────────────────────────────────────────────────────
/** Fixture lengkap sampai penulisan, per jalur pelaku. Mengembalikan client service_role. */
function kpiFixture(path: 'hrd' | 'spv' | 'coord', ids: string[] = [EMP]): Svc {
  if (path === 'coord') {
    setUser(makeClient({ user: { id: UID }, tables: { employees: [{ data: COORD }] } }));
    return setAdmin(makeClient({ tables: {
      coordinator_team_members: [{ data: ids.map((employee_id) => ({ employee_id })) }],
      employees: [active(ids)],
      period_months: [{ data: { ym: YM } }],
      kpi_scores: [{ data: [] }],
    } }));
  }
  setUser(makeClient({ user: { id: UID }, tables: {
    employees: [{ data: path === 'hrd' ? HRD : SPV }],
    period_months: [{ data: { ym: YM } }],
    kpi_scores: [{ data: [] }],
  } }));
  return setAdmin(makeClient({ tables: path === 'hrd'
    ? { employees: [{ data: ids.map((id) => ({ id, dept: 'Ops', role: 'employee' })) }, active(ids)] }
    : {
        spv_team_members: [{ data: ids.map((employee_id) => ({ employee_id })) }],
        employees: [active(ids)],
        coordinator_team_members: [{ data: [] }],
      } }));
}

describe.each(['hrd', 'spv', 'coord'] as const)('saveKpiScores (jalur %s) — kunci laporan Final', (path) => {
  it('(a) belum Final → tersimpan seperti biasa; helper dipanggil dgn pegawai & bulan', async () => {
    const svc = kpiFixture(path);
    const r = await saveKpiScores({ ym: YM, rows: [{ employeeId: EMP, score: 90 }] });
    expect(r).toEqual({ ok: true, saved: 1 });
    expect(svc.rpc).toHaveBeenCalledWith('kpi_save_with_audit', expect.anything());
    expect(finalLockErrorForMonths).toHaveBeenCalledWith(svc, [EMP], [YM]);
  });

  it('(b) Final → ditolak dgn pesan helper, TANPA penulisan', async () => {
    vi.mocked(finalLockErrorForMonths).mockResolvedValue(LOCKED);
    const svc = kpiFixture(path);
    const r = await saveKpiScores({ ym: YM, rows: [{ employeeId: EMP, score: 90 }] });
    expect(r).toEqual({ ok: false, error: LOCKED });
    expect(svc.rpc).not.toHaveBeenCalled();
    expect(writes(svc)).toHaveLength(0);
  });

  it('(c) sesudah Buka Kembali (helper kembali null) → tersimpan lagi', async () => {
    vi.mocked(finalLockErrorForMonths).mockResolvedValueOnce(LOCKED);
    kpiFixture(path);
    expect((await saveKpiScores({ ym: YM, rows: [{ employeeId: EMP, score: 90 }] })).ok).toBe(false);
    const svc = kpiFixture(path);
    expect(await saveKpiScores({ ym: YM, rows: [{ employeeId: EMP, score: 91 }] })).toEqual({ ok: true, saved: 1 });
    expect(svc.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('saveKpiScores — impor banyak baris', () => {
  it('satu pegawai Final → SELURUH impor ditolak; helper menerima semua pegawai', async () => {
    vi.mocked(finalLockErrorForMonths).mockResolvedValue(LOCKED);
    const svc = kpiFixture('hrd', [EMP, EMP2]);
    const r = await saveKpiScores({ ym: YM, rows: [{ employeeId: EMP, score: 90 }, { employeeId: EMP2, score: 80 }] });
    expect(r).toEqual({ ok: false, error: LOCKED });
    expect(finalLockErrorForMonths).toHaveBeenCalledWith(svc, [EMP, EMP2], [YM]);
    expect(svc.rpc).not.toHaveBeenCalled();
  });

  it('pemeriksaan gagal dibaca (gagal tertutup) → pesan helper diteruskan apa adanya', async () => {
    const { FINAL_CHECK_FAILED_MSG } = await import('@/lib/final-lock');
    vi.mocked(finalLockErrorForMonths).mockResolvedValue(FINAL_CHECK_FAILED_MSG);
    const svc = kpiFixture('spv');
    expect(await saveKpiScores({ ym: YM, rows: [{ employeeId: EMP, score: 90 }] })).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(svc.rpc).not.toHaveBeenCalled();
  });

  it('pelaku di luar lingkup → ditolak lingkup DULU, helper kunci tak dipanggil', async () => {
    setUser(makeClient({ user: { id: UID }, tables: { employees: [{ data: SPV }] } }));
    setAdmin(makeClient({ tables: { spv_team_members: [{ data: [] }] } }));
    const r = await saveKpiScores({ ym: YM, rows: [{ employeeId: EMP, score: 90 }] });
    expect(r).toEqual({ ok: false, error: 'Sebagian pegawai berada di luar tim Anda.' });
    expect(finalLockErrorForMonths).not.toHaveBeenCalled();
  });
});

// ── KPI: hapus ───────────────────────────────────────────────────────────────────────────────────
function deleteFixture(path: 'hrd' | 'coord'): Svc {
  if (path === 'coord') {
    setUser(makeClient({ user: { id: UID }, tables: { employees: [{ data: COORD }] } }));
    return setAdmin(makeClient({ tables: {
      coordinator_team_members: [{ data: { employee_id: EMP } }],
      period_months: [{ data: { ym: YM } }],
      kpi_scores: [{ data: { score: 80 } }],
    } }), { data: 80, error: null });
  }
  setUser(makeClient({ user: { id: UID }, tables: {
    employees: [{ data: HRD }],
    period_months: [{ data: { ym: YM } }],
    kpi_scores: [{ data: { score: 80 } }],
  } }));
  return setAdmin(makeClient({ tables: { employees: [{ data: [{ id: EMP, dept: 'Ops', role: 'employee' }] }] } }), { data: 80, error: null });
}
const DEL = { employeeId: EMP, ym: YM, note: 'Salah input' };

describe.each(['hrd', 'coord'] as const)('deleteKpiScore (jalur %s) — kunci laporan Final', (path) => {
  it('(a) belum Final → terhapus; helper dipanggil dgn pegawai & bulan', async () => {
    const svc = deleteFixture(path);
    expect(await deleteKpiScore(DEL)).toEqual({ ok: true });
    expect(svc.rpc).toHaveBeenCalledWith('kpi_delete_with_audit', expect.anything());
    expect(finalLockErrorForMonths).toHaveBeenCalledWith(svc, [EMP], [YM]);
  });

  it('(b) Final → ditolak, TANPA penghapusan', async () => {
    vi.mocked(finalLockErrorForMonths).mockResolvedValue(LOCKED);
    const svc = deleteFixture(path);
    expect(await deleteKpiScore(DEL)).toEqual({ ok: false, error: LOCKED });
    expect(svc.rpc).not.toHaveBeenCalled();
    expect(writes(svc)).toHaveLength(0);
  });

  it('(c) sesudah Buka Kembali → terhapus lagi', async () => {
    vi.mocked(finalLockErrorForMonths).mockResolvedValueOnce(LOCKED);
    deleteFixture(path);
    expect((await deleteKpiScore(DEL)).ok).toBe(false);
    deleteFixture(path);
    expect(await deleteKpiScore(DEL)).toEqual({ ok: true });
  });
});

// ── Bobot Penilai ────────────────────────────────────────────────────────────────────────────────
const ME_HRD = { role: 'hrd', is_hrd_admin: true, hrd_sections: null };
const W2 = { model: '2class', atasan: 40, internal: 60, peer: 0, cross: 0, bawahan: 0, self: 0 };

function overrideFixture(): { user: MockClient; svc: Svc } {
  const user = setUser(makeClient({ user: { id: UID }, tables: {
    employees: [{ data: ME_HRD }, { data: { name: 'Budi' } }],
    periods: [{ data: { id: PID } }],
    employee_weight_overrides: [{ data: null }],
  } }));
  return { user, svc: setAdmin(makeClient({})) };
}

describe('saveEmployeeWeightOverride — kunci laporan Final', () => {
  it('(a) belum Final → tersimpan; helper dipanggil dgn periode aktif & pegawai', async () => {
    const { user, svc } = overrideFixture();
    expect(await saveEmployeeWeightOverride({ ...W2, employeeId: EMP })).toEqual({ ok: true });
    expect(finalLockError).toHaveBeenCalledWith(svc, PID, [EMP]);
    expect(writes(user).map((w) => [w.table, w.op])).toEqual([['employee_weight_overrides', 'upsert']]);
  });

  it('(b) Final → ditolak, TANPA penulisan', async () => {
    vi.mocked(finalLockError).mockResolvedValue(LOCKED);
    const { user } = overrideFixture();
    expect(await saveEmployeeWeightOverride({ ...W2, employeeId: EMP })).toEqual({ ok: false, error: LOCKED });
    expect(writes(user)).toHaveLength(0);
  });

  it('(c) sesudah Buka Kembali → tersimpan lagi', async () => {
    vi.mocked(finalLockError).mockResolvedValueOnce(LOCKED);
    overrideFixture();
    expect((await saveEmployeeWeightOverride({ ...W2, employeeId: EMP })).ok).toBe(false);
    overrideFixture();
    expect(await saveEmployeeWeightOverride({ ...W2, employeeId: EMP })).toEqual({ ok: true });
  });
});

function removeFixture(): { user: MockClient; svc: Svc } {
  const user = setUser(makeClient({ user: { id: UID }, tables: {
    employees: [{ data: ME_HRD }, { data: { name: 'Budi' } }],
    periods: [{ data: { id: PID } }],
    employee_weight_overrides: [{ data: null }],
  } }));
  return { user, svc: setAdmin(makeClient({})) };
}

describe('removeEmployeeWeightOverride — kunci laporan Final', () => {
  it('(a) belum Final → terhapus; helper dipanggil dgn periode aktif & pegawai', async () => {
    const { user, svc } = removeFixture();
    expect(await removeEmployeeWeightOverride(EMP)).toEqual({ ok: true });
    expect(finalLockError).toHaveBeenCalledWith(svc, PID, [EMP]);
    expect(writes(user).map((w) => [w.table, w.op])).toEqual([['employee_weight_overrides', 'delete']]);
  });

  it('(b) Final → ditolak, TANPA penghapusan', async () => {
    vi.mocked(finalLockError).mockResolvedValue(LOCKED);
    const { user } = removeFixture();
    expect(await removeEmployeeWeightOverride(EMP)).toEqual({ ok: false, error: LOCKED });
    expect(writes(user)).toHaveLength(0);
  });

  it('(c) sesudah Buka Kembali → terhapus lagi', async () => {
    vi.mocked(finalLockError).mockResolvedValueOnce(LOCKED);
    removeFixture();
    expect((await removeEmployeeWeightOverride(EMP)).ok).toBe(false);
    removeFixture();
    expect(await removeEmployeeWeightOverride(EMP)).toEqual({ ok: true });
  });
});

function weightsFixture(): { user: MockClient; svc: Svc } {
  const user = setUser(makeClient({ user: { id: UID }, tables: {
    employees: [{ data: ME_HRD }],
    periods: [{ data: { id: PID } }],
    weight_schemes: [{ data: { id: 'ws-1' } }, { data: null }],
  } }));
  return { user, svc: setAdmin(makeClient({})) };
}
const PERIOD_LOCKED = periodFinalLockMsg(3, 'bobot penilai');

describe('saveWeights (seluruh periode) — kunci laporan Final', () => {
  it('(a) belum ada laporan Final → tersimpan; helper dipanggil dgn periode aktif', async () => {
    const { user, svc } = weightsFixture();
    expect(await saveWeights(W2)).toEqual({ ok: true });
    expect(periodLockError).toHaveBeenCalledWith(svc, PID, 'bobot penilai');
    expect(writes(user).map((w) => [w.table, w.op])).toEqual([['weight_schemes', 'update']]);
  });

  it('(b) sudah ada laporan Final → ditolak, TANPA penulisan', async () => {
    vi.mocked(periodLockError).mockResolvedValue(PERIOD_LOCKED);
    const { user } = weightsFixture();
    expect(await saveWeights(W2)).toEqual({ ok: false, error: PERIOD_LOCKED });
    expect(writes(user)).toHaveLength(0);
  });

  it('(c) sesudah semua dibuka kembali → tersimpan lagi', async () => {
    vi.mocked(periodLockError).mockResolvedValueOnce(PERIOD_LOCKED);
    weightsFixture();
    expect((await saveWeights(W2)).ok).toBe(false);
    weightsFixture();
    expect(await saveWeights(W2)).toEqual({ ok: true });
  });

  it('bukan HRD → ditolak otorisasi DULU, helper kunci tak dipanggil', async () => {
    setUser(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_hrd_admin: false } }] } }));
    expect((await saveWeights(W2)).ok).toBe(false);
    expect(periodLockError).not.toHaveBeenCalled();
  });
});
