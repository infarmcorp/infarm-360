import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

/**
 * Server Action Rencana Pengembangan (0055). Dikunci: siapa boleh menulis langkah mana, gerbang "rencana terbuka"
 * (laporan Final + periode belum ditutup), urutan status, dan batalnya persetujuan saat dikembalikan.
 */
let mode = 'spv';
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: mode }) })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { saveMyPlan, submitMyPlan, decideAsSupervisor, approveAsHrd, reopenPlan, setPlanWindow } from '@/app/(app)/pengembangan/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);

const P = '11111111-1111-1111-1111-111111111111';     // periode laporan
const PLAN = '22222222-2222-2222-2222-222222222222';
const EMP = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const COORD = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SPV = '55555555-5555-5555-5555-555555555555';
const HRD = '88888888-8888-8888-8888-888888888888';
const FULL = { area: 'Konfirmasi', target: '0 salah persepsi', actions: 'Tanya balik', due_text: 'Des 2026', companion: 'SPV', success_indicator: 'Tak ada keluhan' };

function asUser(id: string, row: Record<string, unknown>) {
  const c = makeClient({ user: { id }, tables: { employees: [{ data: { name: 'Pelaku', ...row } }] } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(c as any);
}
function adminWith(tables: Record<string, QResult[]>): MockClient {
  const c = makeClient({ tables });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(c as any);
  return c;
}
const OPEN = { data: { id: P, label: 'Q3 2026', dev_plan_closed_at: null, dev_plan_due: null } };
const FINAL = { data: { status: 'finalized' } };
const plan = (over: Record<string, unknown> = {}) => ({ data: { id: PLAN, employee_id: EMP, source_period_id: P, status: 'draft', ...over } });
const TEAM = { spv_team_members: [{ data: [{ spv_id: SPV, employee_id: EMP }, { spv_id: SPV, employee_id: COORD }] }],
  coordinator_team_members: [{ data: [{ coordinator_id: COORD, employee_id: EMP }] }] };
const updates = (c: MockClient) => c.calls.filter((x) => x.table === 'development_plans' && x.op === 'update');

beforeEach(() => { vi.clearAllMocks(); mode = 'spv'; });

describe('saveMyPlan / submitMyPlan (pemilik)', () => {
  it('tolak bila laporan periode itu belum Final', async () => {
    asUser(EMP, { role: 'employee' });
    adminWith({ periods: [OPEN], final_reports: [{ data: { status: 'in_review' } }] });
    const r = await saveMyPlan(P, [FULL]);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/belum Final/) });
  });

  it('tolak bila rencana periode itu sudah ditutup HRD', async () => {
    asUser(EMP, { role: 'employee' });
    adminWith({ periods: [{ data: { ...OPEN.data, dev_plan_closed_at: '2026-12-31T00:00:00Z' } }], final_reports: [FINAL] });
    expect((await submitMyPlan(P)).ok).toBe(false);
  });

  it('tolak ubah isi saat rencana sedang menunggu atasan', async () => {
    asUser(EMP, { role: 'employee' });
    const a = adminWith({ periods: [OPEN], final_reports: [FINAL], development_plans: [plan({ status: 'waiting_supervisor' })], development_plan_items: [{ data: [] }] });
    const r = await saveMyPlan(P, [FULL]);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/tidak bisa diubah/) });
    expect(a.calls.filter((x) => x.op !== 'select')).toHaveLength(0);
  });

  it('simpan: sisip prioritas baru dulu, baru hapus yang lama', async () => {
    asUser(EMP, { role: 'employee' });
    const a = adminWith({
      periods: [OPEN], final_reports: [FINAL],
      development_plans: [plan(), { data: null }],
      development_plan_items: [{ data: [{ id: 'old1', ...FULL }] }, { data: null }, { data: null }],
    });
    expect(await saveMyPlan(P, [FULL, { ...FULL, area: 'Tegas' }])).toEqual({ ok: true });
    const ops = a.calls.filter((x) => x.table === 'development_plan_items' && x.op !== 'select').map((x) => x.op);
    expect(ops).toEqual(['insert', 'delete']);
    const ins = a.calls.find((x) => x.op === 'insert')!.payload as { order_idx: number }[];
    expect(ins.map((i) => i.order_idx)).toEqual([0, 1]);
  });

  it('kirim ditolak bila ada prioritas belum lengkap', async () => {
    asUser(EMP, { role: 'employee' });
    adminWith({ periods: [OPEN], final_reports: [FINAL], development_plans: [plan()], development_plan_items: [{ data: [{ ...FULL, target: '' }] }] });
    expect(await submitMyPlan(P)).toEqual({ ok: false, error: expect.stringMatching(/Prioritas 1 belum lengkap/) });
  });

  it('kirim: status Menunggu Atasan + persetujuan pegawai tercatat', async () => {
    asUser(EMP, { role: 'employee' });
    const a = adminWith({ periods: [OPEN], final_reports: [FINAL], development_plans: [plan({ status: 'revision' }), { data: [{ id: PLAN }] }], development_plan_items: [{ data: [FULL] }] });
    expect(await submitMyPlan(P)).toEqual({ ok: true });
    const u = updates(a)[0];
    expect(u.payload).toMatchObject({ status: 'waiting_supervisor', revision_reason: null, supervisor_signed_at: null, hrd_signed_at: null });
    expect((u.payload as { employee_signed_at: string }).employee_signed_at).toBeTruthy();
    expect(u.filters).toEqual(expect.arrayContaining([['eq', 'status', 'revision']])); // syarat status lama
  });

  it('Direksi tidak mengirim (tanpa alur persetujuan)', async () => {
    asUser(EMP, { role: 'direksi' });
    expect(await submitMyPlan(P)).toEqual({ ok: false, error: expect.stringMatching(/Direksi/) });
  });
});

describe('decideAsSupervisor', () => {
  const C = { confirmation: 'Sesuai pengamatan', context: '', support: 'Coaching dua mingguan', hope: '' };
  const base = (status = 'waiting_supervisor') => ({
    development_plans: [plan({ status }), { data: [{ id: PLAN }] }],
    employees: [{ data: { id: EMP, role: 'employee', name: 'Pegawai' } }],
    ...TEAM, periods: [OPEN], final_reports: [FINAL],
  });

  it('SPV dari pegawai berkoordinator hanya melihat → ditolak', async () => {
    asUser(SPV, { role: 'spv' });
    const a = adminWith(base());
    expect(await decideAsSupervisor(PLAN, 'approve', C, '')).toEqual({ ok: false, error: expect.stringMatching(/bukan atasan/) });
    expect(updates(a)).toHaveLength(0);
  });

  it('koordinator: Setujui tanpa Konfirmasi Kinerja ditolak', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(base());
    expect((await decideAsSupervisor(PLAN, 'approve', { ...C, confirmation: '' }, '')).ok).toBe(false);
  });

  it('koordinator: Setujui → Menunggu HRD, persetujuan atasan tercatat', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true, name: 'Koordinator A' });
    const a = adminWith(base());
    expect(await decideAsSupervisor(PLAN, 'approve', C, '')).toEqual({ ok: true });
    expect(updates(a)[0].payload).toMatchObject({ status: 'waiting_hrd', supervisor_id: COORD, supervisor_name: 'Koordinator A', sup_confirmation: C.confirmation });
  });

  it('Minta Perbaikan: alasan wajib; persetujuan pegawai batal', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(base());
    expect((await decideAsSupervisor(PLAN, 'revise', C, '')).ok).toBe(false);
    asUser(COORD, { role: 'employee', is_coordinator: true });
    const a = adminWith(base());
    expect(await decideAsSupervisor(PLAN, 'revise', C, 'Target belum terukur')).toEqual({ ok: true });
    expect(updates(a)[0].payload).toMatchObject({ status: 'revision', revision_reason: 'Target belum terukur', employee_signed_at: null });
  });

  it('tolak bila rencana tidak sedang menunggu atasan', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(base('draft'));
    expect((await decideAsSupervisor(PLAN, 'approve', C, '')).ok).toBe(false);
  });
});

describe('approveAsHrd / reopenPlan / setPlanWindow', () => {
  const hrdBase = (status: string) => ({
    development_plans: [plan({ status }), { data: [{ id: PLAN }] }],
    employees: [{ data: { id: EMP, role: 'employee', name: 'Pegawai' } }],
    periods: [OPEN], final_reports: [FINAL],
  });

  it('pemegang izin HRD Admin (bukan posisi HRD) tidak bisa menyetujui', async () => {
    mode = 'admin';
    asUser('99999999-9999-9999-9999-999999999999', { role: 'employee', is_hrd_admin: true });
    adminWith(hrdBase('waiting_hrd'));
    expect(await approveAsHrd(PLAN)).toEqual({ ok: false, error: expect.stringMatching(/berposisi HRD/) });
  });

  it('posisi HRD di Mode SPV tidak bisa menyetujui', async () => {
    asUser(HRD, { role: 'hrd' });
    adminWith(hrdBase('waiting_hrd'));
    expect((await approveAsHrd(PLAN)).ok).toBe(false);
  });

  it('posisi HRD Mode Admin: Setujui (HRD) hanya setelah atasan → Disepakati', async () => {
    mode = 'admin';
    asUser(HRD, { role: 'hrd' });
    adminWith(hrdBase('waiting_supervisor'));
    expect((await approveAsHrd(PLAN)).ok).toBe(false);
    asUser(HRD, { role: 'hrd', name: 'HRD Satu' });
    const a = adminWith(hrdBase('waiting_hrd'));
    expect(await approveAsHrd(PLAN)).toEqual({ ok: true });
    expect(updates(a)[0].payload).toMatchObject({ status: 'agreed', hrd_id: HRD, hrd_name: 'HRD Satu' });
  });

  it('Buka Kembali → Draf, semua persetujuan batal', async () => {
    mode = 'admin';
    asUser(HRD, { role: 'hrd' });
    const a = adminWith(hrdBase('agreed'));
    expect(await reopenPlan(PLAN)).toEqual({ ok: true });
    expect(updates(a)[0].payload).toMatchObject({
      status: 'draft', employee_signed_at: null, supervisor_signed_at: null, hrd_signed_at: null, supervisor_id: null, hrd_id: null,
    });
  });

  it('atur periode: bukan HRD ditolak; HRD Mode Admin menyimpan batas & tutup', async () => {
    asUser(SPV, { role: 'spv' });
    expect((await setPlanWindow(P, true, '2026-11-30')).ok).toBe(false);
    mode = 'admin';
    asUser(HRD, { role: 'hrd' });
    const a = adminWith({ periods: [{ data: { label: 'Q3 2026', dev_plan_closed_at: null } }, { data: null }] });
    expect(await setPlanWindow(P, true, '2026-11-30')).toEqual({ ok: true });
    const u = a.calls.find((x) => x.table === 'periods' && x.op === 'update')!.payload as Record<string, unknown>;
    expect(u.dev_plan_due).toBe('2026-11-30');
    expect(u.dev_plan_closed_at).toBeTruthy();
  });
});
