import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

/**
 * Laporkan Pelanggaran 0062 — penanda tersembunyi pelapor & tindak lanjut HRD.
 *
 * Dikunci:
 *  - reporterRef: deterministik per pegawai, beda antarpegawai, bukan id mentah, null tanpa kunci rahasia (gagal tertutup).
 *  - setViolationFollowUp: hanya HRD Mode Admin berbagian Tinjauan & Finalisasi (Direksi/Mode SPV/pegawai ditolak),
 *    tolak laporan tentang diri sendiri, Zod status/tanggapan, tulis hanya kolom tindak lanjut, Log Aktivitas tanpa
 *    isi tanggapan.
 */
let mode = 'admin';
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: mode }) })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { reporterRef } from '@/lib/violation-ref';
import { setViolationFollowUp } from '@/app/(app)/admin/pelanggaran/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rls(c: MockClient) { mockCreate.mockResolvedValue(c as any); return c; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function svc(c: MockClient) { mockAdmin.mockReturnValue(c as any); return c; }

const HRD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HRD_ROW = { data: { role: 'hrd', is_hrd_admin: false, hrd_sections: null } };

beforeEach(() => { vi.clearAllMocks(); mode = 'admin'; });

describe('reporterRef — penanda tersembunyi pelapor', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('deterministik per pegawai, beda antarpegawai, bukan id mentah', () => {
    vi.stubEnv('VIOLATION_REPORTER_SECRET', 's'.repeat(40));
    const a = reporterRef(HRD)!;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(reporterRef(HRD)).toBe(a);
    expect(reporterRef(OTHER)).not.toBe(a);
    expect(a).not.toContain(HRD.replace(/-/g, ''));
  });
  it('kunci lain → penanda lain (tanpa kunci tak bisa dicocokkan)', () => {
    vi.stubEnv('VIOLATION_REPORTER_SECRET', 's'.repeat(40));
    const a = reporterRef(HRD);
    vi.stubEnv('VIOLATION_REPORTER_SECRET', 't'.repeat(40));
    expect(reporterRef(HRD)).not.toBe(a);
  });
  it('kunci kosong/terlalu pendek → null (gagal tertutup)', () => {
    vi.stubEnv('VIOLATION_REPORTER_SECRET', '');
    expect(reporterRef(HRD)).toBeNull();
    vi.stubEnv('VIOLATION_REPORTER_SECRET', 'pendek');
    expect(reporterRef(HRD)).toBeNull();
  });
});

describe('setViolationFollowUp — gerbang', () => {
  it('tolak status/tanggapan tidak valid tanpa menyentuh DB', async () => {
    const c = rls(makeClient({ user: { id: HRD } }));
    expect((await setViolationFollowUp(RID, 'closed', '')).ok).toBe(false);
    expect((await setViolationFollowUp('x', 'done', '')).ok).toBe(false);
    expect((await setViolationFollowUp(RID, 'done', 'x'.repeat(2001))).ok).toBe(false);
    expect(c.calls).toHaveLength(0);
  });

  it.each([
    ['Direksi', { role: 'direksi', is_hrd_admin: false, hrd_sections: null }, 'admin'],
    ['HRD di Mode SPV', { role: 'hrd', is_hrd_admin: false, hrd_sections: null }, 'spv'],
    ['HRD tanpa bagian Tinjauan & Finalisasi', { role: 'hrd', is_hrd_admin: false, hrd_sections: ['periode'] }, 'admin'],
    ['pegawai', { role: 'employee', is_hrd_admin: false, hrd_sections: null }, 'admin'],
  ])('tolak %s', async (_l, row, m) => {
    mode = m;
    rls(makeClient({ user: { id: HRD }, tables: { employees: [{ data: row }] } }));
    const admin = svc(makeClient({}));
    const r = await setViolationFollowUp(RID, 'done', '');
    expect(r.ok).toBe(false);
    expect(admin.calls).toHaveLength(0);
  });

  it('tolak laporan tentang diri sendiri', async () => {
    rls(makeClient({ user: { id: HRD }, tables: { employees: [HRD_ROW] } }));
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: { target_id: HRD } }] } }));
    expect(await setViolationFollowUp(RID, 'done', '')).toEqual({ ok: false, error: expect.stringMatching(/HRD lain/) });
    expect(admin.calls.filter((x) => x.op === 'update')).toHaveLength(0);
  });

  it('laporan tak ditemukan', async () => {
    rls(makeClient({ user: { id: HRD }, tables: { employees: [HRD_ROW] } }));
    svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    expect(await setViolationFollowUp(RID, 'done', '')).toEqual({ ok: false, error: 'Laporan tidak ditemukan' });
  });
});

describe('setViolationFollowUp — simpan', () => {
  it('menulis hanya kolom tindak lanjut; log tanpa isi tanggapan', async () => {
    rls(makeClient({ user: { id: HRD }, tables: { employees: [HRD_ROW] } }));
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: { target_id: OTHER } }, { data: [{ id: RID }] }] } }));
    expect(await setViolationFollowUp(RID, 'in_progress', '  Sedang diperiksa HRD.  ')).toEqual({ ok: true });
    const upd = admin.calls.find((x) => x.op === 'update')!;
    expect(upd.filters).toEqual([['eq', 'id', RID]]);
    expect(upd.payload).toMatchObject({ status: 'in_progress', hrd_response: 'Sedang diperiksa HRD.' });
    expect(Object.keys(upd.payload as object).sort()).toEqual(['hrd_response', 'responded_at', 'status']);
    expect(logHrdAction).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(logHrdAction).mock.calls[0][0];
    expect(JSON.stringify(entry)).not.toContain('Sedang diperiksa');
    expect(entry).toMatchObject({ action: 'violation.followUp', targetId: RID, targetLabel: null });
  });

  it('tanggapan kosong → null', async () => {
    rls(makeClient({ user: { id: HRD }, tables: { employees: [HRD_ROW] } }));
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: { target_id: OTHER } }, { data: [{ id: RID }] }] } }));
    expect(await setViolationFollowUp(RID, 'received', '   ')).toEqual({ ok: true });
    expect(admin.calls.find((x) => x.op === 'update')!.payload).toMatchObject({ hrd_response: null });
  });

  it('kolom 0062 belum ada → pesan belum aktif, tanpa log', async () => {
    rls(makeClient({ user: { id: HRD }, tables: { employees: [HRD_ROW] } }));
    svc(makeClient({ tables: { outside_mapping_notes: [
      { data: { target_id: OTHER } }, { error: { code: '42703', message: 'column outside_mapping_notes.status does not exist' } },
    ] } }));
    expect(await setViolationFollowUp(RID, 'done', '')).toEqual({ ok: false, error: expect.stringMatching(/belum aktif/) });
    expect(logHrdAction).not.toHaveBeenCalled();
  });
});
