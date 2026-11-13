import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
vi.mock('@/lib/app-url', () => ({ appBaseUrl: vi.fn(async () => 'https://portal.test') }));
vi.mock('@/lib/email/mailer', () => ({ emailConfigured: vi.fn(() => true), sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/report-release', async (orig) => ({
  ...(await orig<typeof import('@/lib/report-release')>()),
  loadReleasePeriod: vi.fn(async () => ({ id: PID, label: 'Q4 2026', monthRange: 'Oktober–Desember 2026', has360: true, aspects: [] })),
}));

import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { scheduleReleaseEmail, updateReleaseSchedule, cancelReleaseSchedule } from '@/app/(app)/admin/laporan/release-email-actions';

const PID = '11111111-1111-4111-8111-111111111111';
const SID = '99999999-9999-4999-8999-999999999999';
const UID = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const B = '44444444-4444-4444-8444-444444444444';
const CONTENT = { cycle: 'keempat', includeLate: false, steps: [] };
const inAnHour = () => new Date(Date.now() + 3600_000).toISOString();

type Call = { table: string; ops: [string, unknown[]][] };
function fakeDb(queues: Record<string, { data?: unknown; error?: unknown }[]>, user: { id: string } | null = { id: UID }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    const proxy: unknown = new Proxy({}, {
      get(_t, prop: string) {
        const settle = () => {
          calls.push(call);
          const q = queues[table];
          if (!q?.length) throw new Error(`antrean kosong: ${table}`);
          return q.shift();
        };
        if (prop === 'then') return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(settle).then(res, rej);
        if (prop === 'maybeSingle') return () => Promise.resolve().then(settle);
        return (...args: unknown[]) => { call.ops.push([prop, args]); return proxy; };
      },
    });
    return proxy;
  };
  return { client: { from, auth: { getUser: async () => ({ data: { user } }) } }, calls };
}
const asHrd = (mode: 'admin' | 'spv' = 'admin', me: Record<string, unknown> = { name: 'Rina HRD', role: 'hrd', is_hrd_admin: false, hrd_sections: null }) => {
  vi.mocked(cookies).mockResolvedValue({ get: (k: string) => (k === 'hrd_mode' ? { value: mode } : undefined) } as never);
  const { client } = fakeDb({ employees: [{ data: me }] });
  vi.mocked(createClient).mockResolvedValue(client as never);
};
const admin = (queues: Record<string, { data?: unknown; error?: unknown }[]>) => {
  const f = fakeDb(queues);
  vi.mocked(createAdminClient).mockReturnValue(f.client as never);
  return f;
};

describe('scheduleReleaseEmail', () => {
  beforeEach(() => { vi.mocked(logHrdAction).mockClear(); });

  it('HRD Mode-SPV dan pegawai biasa ditolak', async () => {
    asHrd('spv');
    expect(await scheduleReleaseEmail({ periodId: PID, sendAt: inAnHour(), employeeIds: [A], content: CONTENT }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/Mode Admin/) });
    asHrd('admin', { name: 'Budi', role: 'employee', is_hrd_admin: false });
    expect(await scheduleReleaseEmail({ periodId: PID, sendAt: inAnHour(), employeeIds: [A], content: CONTENT }))
      .toMatchObject({ ok: false });
  });

  it('jam kurang dari 5 menit ke depan ditolak sebelum menyentuh database', async () => {
    asHrd();
    const f = admin({});
    const res = await scheduleReleaseEmail({ periodId: PID, sendAt: new Date(Date.now() + 60_000).toISOString(), employeeIds: [A], content: CONTENT });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/minimal 5 menit/) });
    expect(f.calls).toEqual([]);
  });

  it('tersimpan dengan penerima & isi terkunci; dicatat di log', async () => {
    asHrd();
    const sendAt = inAnHour();
    const f = admin({ employees: [{ data: [{ id: A }, { id: B }] }], release_email_schedules: [{ data: null }] });
    const res = await scheduleReleaseEmail({ periodId: PID, sendAt, employeeIds: [A, B, A], content: CONTENT });
    expect(res).toMatchObject({ ok: true, msg: expect.stringMatching(/Terjadwal: .* ke 2 pegawai/) });
    const ins = f.calls.find((c) => c.table === 'release_email_schedules')!.ops.find(([op]) => op === 'insert')![1][0];
    expect(ins).toMatchObject({ period_id: PID, recipient_ids: [A, B], content: CONTENT, created_by: UID, created_by_name: 'Rina HRD' });
    expect(logHrdAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'laporan.release_schedule_create' }));
  });

  it('sudah ada jadwal aktif → pesan jelas; tabel belum ada → minta migrasi 0053', async () => {
    asHrd();
    admin({ employees: [{ data: [{ id: A }] }], release_email_schedules: [{ error: { code: '23505', message: 'duplicate key' } }] });
    expect(await scheduleReleaseEmail({ periodId: PID, sendAt: inAnHour(), employeeIds: [A], content: CONTENT }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/Sudah ada jadwal aktif/) });
    asHrd();
    admin({ employees: [{ data: [{ id: A }] }], release_email_schedules: [{ error: { code: '42P01', message: 'relation does not exist' } }] });
    expect(await scheduleReleaseEmail({ periodId: PID, sendAt: inAnHour(), employeeIds: [A], content: CONTENT }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/jadwal belum aktif/i) });
  });

  it('penerima yang tidak ditemukan ditolak', async () => {
    asHrd();
    admin({ employees: [{ data: [{ id: A }] }] });
    expect(await scheduleReleaseEmail({ periodId: PID, sendAt: inAnHour(), employeeIds: [A, B], content: CONTENT }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/tidak ditemukan/) });
  });
});

describe('updateReleaseSchedule & cancelReleaseSchedule', () => {
  it('ubah hanya bila masih menunggu & belum ada yang terkirim (filter atomik)', async () => {
    asHrd();
    const f = admin({ employees: [{ data: [{ id: A }] }], release_email_schedules: [{ data: [{ period_id: PID }] }] });
    expect(await updateReleaseSchedule({ id: SID, sendAt: inAnHour(), employeeIds: [A], content: CONTENT })).toMatchObject({ ok: true });
    const ops = f.calls.find((c) => c.table === 'release_email_schedules')!.ops;
    expect(ops).toEqual(expect.arrayContaining([
      ['eq', ['status', 'scheduled']], ['is', ['started_at', null]], ['filter', ['sent_ids', 'eq', '{}']],
    ]));
  });

  it('jadwal yang sudah mulai terkirim/selesai tidak bisa diubah', async () => {
    asHrd();
    admin({ employees: [{ data: [{ id: A }] }], release_email_schedules: [{ data: [] }] });
    expect(await updateReleaseSchedule({ id: SID, sendAt: inAnHour(), employeeIds: [A], content: CONTENT }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/tidak bisa diubah/) });
  });

  it('batalkan: menyebut yang sudah terlanjur terkirim', async () => {
    asHrd();
    admin({ release_email_schedules: [{ data: [{ period_id: PID, sent_ids: [A] }] }] });
    expect(await cancelReleaseSchedule({ id: SID })).toMatchObject({ ok: true, msg: expect.stringMatching(/1 pegawai sudah terlanjur/) });
    asHrd();
    admin({ release_email_schedules: [{ data: [] }] });
    expect(await cancelReleaseSchedule({ id: SID })).toMatchObject({ ok: false });
  });
});

describe('route cron /api/cron/release-email — gagal tertutup', () => {
  it('tanpa CRON_SECRET di env → 401 walau header ada; header salah → 401', async () => {
    const { GET } = await import('@/app/api/cron/release-email/route');
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await GET(new Request('https://x.test/api/cron/release-email', { headers: { authorization: 'Bearer undefined' } }))).status).toBe(401);
    process.env.CRON_SECRET = 'rahasia-uji-32-karakter-xxxxxxxxxx';
    expect((await GET(new Request('https://x.test/api/cron/release-email', { headers: { authorization: 'Bearer salah' } }))).status).toBe(401);
    expect((await GET(new Request('https://x.test/api/cron/release-email'))).status).toBe(401);
    if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
  });
});
