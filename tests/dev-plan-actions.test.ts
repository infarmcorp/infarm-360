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
import { saveMyPlan, submitMyPlan, decideAsSupervisor, approveAsHrd, withdrawMyPlan, setPlanWindow, saveSession, saveSessionResponse } from '@/app/(app)/pengembangan/actions';

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

describe('approveAsHrd / setPlanWindow', () => {
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

  it('HRD menyetujui rencananya SENDIRI dari Mode Admin setelah atasan menyetujui', async () => {
    mode = 'admin';
    asUser(HRD, { role: 'hrd', name: 'HRD Satu' });
    const a = adminWith({ ...hrdBase('waiting_hrd'), development_plans: [plan({ status: 'waiting_hrd', employee_id: HRD }), { data: [{ id: PLAN }] }],
      employees: [{ data: { id: HRD, role: 'hrd', name: 'HRD Satu' } }] });
    expect(await approveAsHrd(PLAN)).toEqual({ ok: true });
    expect(updates(a)[0].payload).toMatchObject({ status: 'agreed', hrd_id: HRD });
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

describe('Tahap 2 — saveSession / saveSessionResponse', () => {
  const ITEM = '33333333-3333-3333-3333-333333333333';
  const SESS = '44444444-4444-4444-4444-444444444444';
  const IN = { kind: 'one_on_one', date: '2026-11-10', summary: 'Membahas cara konfirmasi informasi.', overall: 'on_track',
    progress: [{ item_id: ITEM, status: 'on_track', note: 'Mulai jalan' }] };
  const ctxTables = (status = 'agreed', extra: Record<string, QResult[]> = {}) => ({
    development_plans: [plan({ status })],
    employees: [{ data: { id: EMP, role: 'employee', name: 'Pegawai' } }],
    periods: [OPEN], final_reports: [FINAL], ...TEAM, ...extra,
  });

  it('tolak bila rencana belum Disepakati', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(ctxTables('waiting_hrd'));
    expect(await saveSession(PLAN, null, IN)).toEqual({ ok: false, error: expect.stringMatching(/Disepakati/) });
  });

  it('SPV-pengamat tidak bisa mencatat 1-on-1', async () => {
    asUser(SPV, { role: 'spv' });
    const a = adminWith(ctxTables());
    expect((await saveSession(PLAN, null, IN)).ok).toBe(false);
    expect(a.calls.filter((x) => x.op === 'insert')).toHaveLength(0);
  });

  it('tolak kemajuan untuk prioritas di luar rencana', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(ctxTables('agreed', { development_plan_items: [{ data: [{ id: 'lain' }] }] }));
    expect(await saveSession(PLAN, null, IN)).toEqual({ ok: false, error: 'Prioritas tidak dikenal' });
  });

  it('koordinator mencatat 1-on-1: pencatat tercatat, tanpa kolom terlambat', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true, name: 'Koordinator A' });
    const a = adminWith(ctxTables('agreed', { development_plan_items: [{ data: [{ id: ITEM }] }], development_plan_sessions: [{ data: null }] }));
    expect(await saveSession(PLAN, null, IN)).toEqual({ ok: true });
    const ins = a.calls.find((x) => x.table === 'development_plan_sessions' && x.op === 'insert')!.payload as Record<string, unknown>;
    expect(ins).toMatchObject({ plan_id: PLAN, kind: 'one_on_one', author_id: COORD, author_name: 'Koordinator A', overall_status: 'on_track' });
    expect(Object.keys(ins).some((k) => /late|terlambat|overdue/i.test(k))).toBe(false);
  });

  it('tinjauan bulanan oleh non-HRD ditolak', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(ctxTables());
    expect((await saveSession(PLAN, null, { ...IN, kind: 'hrd_monthly', overall: null, progress: [] })).ok).toBe(false);
  });

  it('ubah catatan orang lain ditolak', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(ctxTables('agreed', {
      development_plan_items: [{ data: [{ id: ITEM }] }],
      development_plan_sessions: [{ data: { id: SESS, plan_id: PLAN, kind: 'one_on_one', author_id: SPV } }],
    }));
    expect(await saveSession(PLAN, SESS, IN)).toEqual({ ok: false, error: expect.stringMatching(/pencatatnya/) });
  });

  it('tanggapan hanya oleh pemilik rencana', async () => {
    asUser(COORD, { role: 'employee', is_coordinator: true });
    adminWith(ctxTables('agreed', { development_plan_sessions: [{ data: { id: SESS, plan_id: PLAN, kind: 'one_on_one' } }] }));
    expect((await saveSessionResponse(SESS, 'Siap')).ok).toBe(false);
    asUser(EMP, { role: 'employee' });
    const a = adminWith(ctxTables('agreed', { development_plan_sessions: [{ data: { id: SESS, plan_id: PLAN, kind: 'one_on_one' } }, { data: null }] }));
    expect(await saveSessionResponse(SESS, 'Saya sepakat dengan langkahnya')).toEqual({ ok: true });
    expect(a.calls.find((x) => x.op === 'update')!.payload).toMatchObject({ employee_note: 'Saya sepakat dengan langkahnya' });
  });
});

describe('Tarik Kembali & pemisahan mode', () => {
  it('pemilik menarik kembali saat Menunggu Atasan → Draf, persetujuan pegawai batal', async () => {
    asUser(EMP, { role: 'employee' });
    const a = adminWith({ periods: [OPEN], final_reports: [FINAL], development_plans: [plan({ status: 'waiting_supervisor' }), { data: [{ id: PLAN }] }], development_plan_items: [{ data: [FULL] }] });
    expect(await withdrawMyPlan(P)).toEqual({ ok: true });
    expect(updates(a)[0].payload).toMatchObject({ status: 'draft', employee_signed_at: null });
    expect(updates(a)[0].filters).toEqual(expect.arrayContaining([['eq', 'status', 'waiting_supervisor']]));
  });

  it.each(['waiting_hrd', 'agreed', 'revision'])('tidak bisa ditarik saat %s', async (status) => {
    asUser(EMP, { role: 'employee' });
    const a = adminWith({ periods: [OPEN], final_reports: [FINAL], development_plans: [plan({ status })], development_plan_items: [{ data: [FULL] }] });
    expect((await withdrawMyPlan(P)).ok).toBe(false);
    expect(updates(a)).toHaveLength(0);
  });

  it('HRD di Mode Admin tidak bisa mengubah / mengirim / menarik rencananya sendiri', async () => {
    mode = 'admin';
    for (const run of [() => saveMyPlan(P, [FULL]), () => submitMyPlan(P), () => withdrawMyPlan(P)]) {
      asUser(HRD, { role: 'hrd' });
      const a = adminWith({});
      expect(await run()).toEqual({ ok: false, error: expect.stringMatching(/Mode SPV/) });
      expect(a.calls).toHaveLength(0);
    }
  });

  it('HRD yang SPV tim tidak bisa bertindak sebagai atasan dari Mode Admin', async () => {
    mode = 'admin';
    asUser(SPV, { role: 'hrd' });
    const a = adminWith({
      development_plans: [plan({ status: 'waiting_supervisor', employee_id: COORD })],
      employees: [{ data: { id: COORD, role: 'employee', name: 'Koordinator' } }],
      ...TEAM, periods: [OPEN], final_reports: [FINAL],
    });
    const r = await decideAsSupervisor(PLAN, 'approve', { confirmation: 'Sesuai pengamatan', context: '', support: 'Coaching rutin', hope: '' }, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/bukan atasan/) });
    expect(updates(a)).toHaveLength(0);
  });
});
