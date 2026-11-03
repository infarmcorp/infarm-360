import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  wibToIso, isoToWibParts, fmtScheduleWib, sendAtError, SCHEDULE_MIN_LEAD_MS, SCHEDULE_MAX_AHEAD_MS,
} from '@/lib/release-schedule-time';

vi.mock('@/lib/email/mailer', () => ({ emailConfigured: vi.fn(() => true), sendEmail: vi.fn() }));
vi.mock('@/lib/report-release', async (orig) => ({
  ...(await orig<typeof import('@/lib/report-release')>()),
  loadReleasePeriod: vi.fn(async () => ({ id: PID, label: 'Q4 2026', monthRange: 'Oktober–Desember 2026', has360: true, aspects: [] })),
  loadReleaseSentIds: vi.fn(async () => new Set<string>()),
}));
vi.mock('@/lib/release-delivery', () => ({ deliverReleaseEmails: vi.fn() }));

import { emailConfigured } from '@/lib/email/mailer';
import { loadReleasePeriod, loadReleaseSentIds } from '@/lib/report-release';
import { deliverReleaseEmails } from '@/lib/release-delivery';
import { processDueReleaseSchedules, remainingRecipients } from '@/lib/release-schedule';

const PID = '11111111-1111-4111-8111-111111111111';
const SID = '99999999-9999-4999-8999-999999999999';
const HRD = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const B = '44444444-4444-4444-8444-444444444444';
const C = '55555555-5555-4555-8555-555555555555';
const CONTENT = { cycle: 'keempat', includeLate: false, steps: [{ when: '1 Feb 2027', text: 'pelajari laporan.' }] };

// ── Mock klien Supabase: rantai apa pun; tiap `await` mengambil respons berikutnya dari antrean tabel. ──
type Call = { table: string; ops: [string, unknown[]][] };
function fakeDb(queues: Record<string, { data?: unknown; error?: unknown }[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    const b: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(b, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
            calls.push(call);
            const q = queues[table];
            if (!q?.length) return Promise.reject(new Error(`antrean kosong: ${table}`)).then(res, rej);
            return Promise.resolve(q.shift()).then(res, rej);
          };
        }
        return (...args: unknown[]) => { call.ops.push([prop, args]); return proxy; };
      },
    });
    return proxy;
  };
  return { db: { from } as unknown as Parameters<typeof processDueReleaseSchedules>[0], calls };
}
const row = (over: Record<string, unknown> = {}) => ({
  id: SID, period_id: PID, send_at: '2027-01-16T02:00:00.000Z', status: 'scheduled', content: CONTENT,
  recipient_ids: [A, B, C], created_by: HRD, created_by_name: 'Rina HRD', created_at: '2027-01-10T00:00:00Z',
  started_at: null, finished_at: null, sent_ids: [], skipped: [], failed: [], ...over,
});
const NOW = Date.parse('2027-01-16T02:05:00.000Z');
const updates = (calls: Call[]) => calls.filter((c) => c.table === 'release_email_schedules' && c.ops.some(([op]) => op === 'update'))
  .map((c) => c.ops.find(([op]) => op === 'update')![1][0] as Record<string, unknown>);

describe('waktu jadwal (WIB)', () => {
  it('tanggal + jam WIB → UTC (UTC+7), dan sebaliknya', () => {
    expect(wibToIso('2027-01-16', '09:00')).toBe('2027-01-16T02:00:00.000Z');
    expect(wibToIso('2027-01-16', '03:30')).toBe('2027-01-15T20:30:00.000Z'); // lewat tengah malam UTC
    expect(isoToWibParts('2027-01-15T20:30:00.000Z')).toEqual({ date: '2027-01-16', time: '03:30' });
  });
  it('tanggal/jam tak sah → null', () => {
    expect(wibToIso('2027-02-31', '09:00')).toBeNull();
    expect(wibToIso('2027-01-16', '24:00')).toBeNull();
    expect(wibToIso('16/01/2027', '09:00')).toBeNull();
  });
  it('teks WIB untuk layar', () => {
    const t = fmtScheduleWib('2027-01-16T02:00:00.000Z');
    expect(t).toContain('16 Januari 2027');
    expect(t).toContain('pukul 09.00 WIB');
  });
  it('jam kirim minimal 5 menit ke depan, maksimal 4 bulan', () => {
    const now = Date.parse('2027-01-01T00:00:00Z');
    expect(sendAtError(new Date(now + SCHEDULE_MIN_LEAD_MS - 1000).toISOString(), now)).toMatch(/minimal 5 menit/);
    expect(sendAtError(new Date(now + SCHEDULE_MIN_LEAD_MS + 1000).toISOString(), now)).toBeNull();
    expect(sendAtError(new Date(now + SCHEDULE_MAX_AHEAD_MS + 1000).toISOString(), now)).toMatch(/maksimal 4 bulan/);
    expect(sendAtError('bukan tanggal', now)).toMatch(/tidak sah/);
  });
});

describe('remainingRecipients', () => {
  it('urut sesuai daftar terkunci, tanpa yang sudah terkirim/dilewati/gagal', () => {
    expect(remainingRecipients({
      recipientIds: [A, B, C], sentIds: [A], skipped: [{ id: C, name: 'C', reason: 'x' }], failed: [],
    })).toEqual([B]);
  });
});

describe('processDueReleaseSchedules', () => {
  beforeEach(() => {
    vi.mocked(emailConfigured).mockReturnValue(true);
    vi.mocked(loadReleasePeriod).mockClear();
    vi.mocked(loadReleaseSentIds).mockResolvedValue(new Set<string>());
    vi.mocked(deliverReleaseEmails).mockReset();
  });

  it('jadwal jatuh tempo: klaim → kirim ke penerima TERKUNCI → selesai + log sent_ids', async () => {
    vi.mocked(deliverReleaseEmails).mockResolvedValue({ ok: true, sent: [A, B], skipped: [{ id: C, name: 'Citra', reason: 'Folder Laporan (PDF) belum diisi' }], failed: [] });
    const { db, calls } = fakeDb({
      release_email_schedules: [{ data: [row()] }, { data: [{ id: SID }] }, { data: null }],
      hrd_audit_log: [{ data: null }],
    });
    const out = await processDueReleaseSchedules(db, { now: NOW, appUrl: 'https://portal.test/laporan' });
    expect(out.results).toEqual([{ id: SID, period: 'Q4 2026', sent: 2, skipped: 1, failed: 0, done: true }]);
    const args = vi.mocked(deliverReleaseEmails).mock.calls[0][1];
    expect(args.ids).toEqual([A, B, C]);             // persis daftar terkunci
    expect(args.content).toEqual(CONTENT);           // isi tersimpan bersama jadwal
    expect(args.alreadySent).toBeInstanceOf(Set);    // yang sudah dikirimi (manual/jadwal) dilewati
    const [claim, fin] = updates(calls);
    expect(claim.status).toBe('sending');
    expect(fin).toMatchObject({ status: 'done', sent_ids: [A, B] });
    const log = calls.find((c) => c.table === 'hrd_audit_log')!.ops.find(([op]) => op === 'insert')![1][0] as Record<string, unknown>;
    expect(log).toMatchObject({ action: 'laporan.release_email', target_id: PID, actor_id: HRD });
    expect((log.meta as { sent_ids: string[] }).sent_ids).toEqual([A, B]);
  });

  it('bertahap: maxPerRun membatasi; sisa → kembali "scheduled" untuk panggilan berikutnya', async () => {
    vi.mocked(deliverReleaseEmails).mockResolvedValue({ ok: true, sent: [A, B], skipped: [], failed: [] });
    const { db, calls } = fakeDb({
      release_email_schedules: [{ data: [row()] }, { data: [{ id: SID }] }, { data: null }],
      hrd_audit_log: [{ data: null }],
    });
    const out = await processDueReleaseSchedules(db, { now: NOW, maxPerRun: 2 });
    expect(vi.mocked(deliverReleaseEmails).mock.calls[0][1].ids).toEqual([A, B]);
    expect(out.results[0]).toMatchObject({ sent: 2, done: false });
    expect(updates(calls)[1]).toMatchObject({ status: 'scheduled', started_at: null, sent_ids: [A, B] });
  });

  it('lanjutan: penerima yang sudah diproses tidak dikirimi lagi', async () => {
    vi.mocked(deliverReleaseEmails).mockResolvedValue({ ok: true, sent: [C], skipped: [], failed: [] });
    const { db } = fakeDb({
      release_email_schedules: [{ data: [row({ sent_ids: [A, B] })] }, { data: [{ id: SID }] }, { data: null }],
      hrd_audit_log: [{ data: null }],
    });
    await processDueReleaseSchedules(db, { now: NOW });
    expect(vi.mocked(deliverReleaseEmails).mock.calls[0][1].ids).toEqual([C]);
  });

  it('klaim gagal (diambil pemanggil lain) → tidak mengirim apa pun', async () => {
    const { db } = fakeDb({ release_email_schedules: [{ data: [row()] }, { data: [] }] });
    const out = await processDueReleaseSchedules(db, { now: NOW });
    expect(deliverReleaseEmails).not.toHaveBeenCalled();
    expect(out.results[0].note).toMatch(/pemanggil lain/);
  });

  it('email belum aktif → jadwal dibiarkan menunggu (tidak "hangus")', async () => {
    vi.mocked(emailConfigured).mockReturnValue(false);
    const { db, calls } = fakeDb({ release_email_schedules: [{ data: [row()] }] });
    const out = await processDueReleaseSchedules(db, { now: NOW });
    expect(updates(calls)).toEqual([]);
    expect(out.results[0]).toMatchObject({ sent: 0, done: false });
    expect(deliverReleaseEmails).not.toHaveBeenCalled();
  });

  it('gangguan baca saat kirim → kembali ke antrean, dicoba lagi nanti', async () => {
    vi.mocked(deliverReleaseEmails).mockResolvedValue({ ok: false, error: 'Gagal membaca Folder Laporan: timeout' });
    const { db, calls } = fakeDb({ release_email_schedules: [{ data: [row()] }, { data: [{ id: SID }] }, { data: null }] });
    const out = await processDueReleaseSchedules(db, { now: NOW });
    expect(updates(calls)[1]).toMatchObject({ status: 'scheduled', started_at: null });
    expect(out.results[0]).toMatchObject({ done: false, note: expect.stringMatching(/timeout/) });
  });

  it('tabel jadwal belum ada (0053) → ok=false dengan pesan jelas', async () => {
    const { db } = fakeDb({ release_email_schedules: [{ data: null, error: { code: '42P01', message: 'relation does not exist' } }] });
    const out = await processDueReleaseSchedules(db, { now: NOW });
    expect(out).toMatchObject({ ok: false, error: expect.stringMatching(/0053/) });
  });
});
