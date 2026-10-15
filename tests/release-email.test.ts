import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type QResult } from './helpers/mock-supabase';
import {
  monthRangeId, nextQuarterLabel, ordinalId, defaultSteps, releaseEmailHtml, releaseSubject,
  type ReleasePeriod, type ReleaseContent,
} from '@/lib/email/release-template';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
vi.mock('@/lib/app-url', () => ({ appBaseUrl: vi.fn(async () => 'https://portal.test') }));
vi.mock('@/lib/email/mailer', () => ({ emailConfigured: vi.fn(() => true), sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/report-release', async (orig) => ({
  ...(await orig<typeof import('@/lib/report-release')>()),
  loadReleasePeriod: vi.fn(async () => ({ id: PID, label: 'Q3 2026', monthRange: 'Juli–September 2026', has360: true, aspects: ['Jujur & Tanggung Jawab'] })),
}));

import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/mailer';
import { logHrdAction } from '@/lib/audit/log';
import { sendReleaseEmails, sendReleaseEmailTest } from '@/app/(app)/admin/laporan/release-email-actions';

const PID = '11111111-1111-4111-8111-111111111111';
const UID = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333'; // Final + folder + email → terkirim
const B = '44444444-4444-4444-8444-444444444444'; // Final tanpa folder → dilewati
const C = '55555555-5555-4555-8555-555555555555'; // belum Final → dilewati

const PERIOD: ReleasePeriod = {
  label: 'Q3 2026', monthRange: 'Juli–September 2026', has360: true,
  aspects: ['Jujur & Tanggung Jawab', 'Berusaha Semaksimal Mungkin', 'Selalu Menantang Diri', 'Lapang Hati & Terbuka', 'Selalu Bermawas Diri'],
};
const CONTENT: ReleaseContent = { cycle: 'ketiga', includeLate: true, steps: [{ when: '16–20 Oktober 2026', text: 'pelajari laporan.' }] };

describe('template email rilis', () => {
  it('rentang bulan, kuartal berikutnya, urutan siklus', () => {
    expect(monthRangeId(['2026-09', '2026-07', '2026-08'])).toBe('Juli–September 2026');
    expect(monthRangeId(['2026-12', '2027-01', '2027-02'])).toBe('Desember 2026–Februari 2027');
    expect(monthRangeId([])).toBe('');
    expect(nextQuarterLabel('Q3 2026')).toBe('Q4 2026');
    expect(nextQuarterLabel('Q4 2026')).toBe('Q1 2027');
    expect(nextQuarterLabel('Semester 1')).toBeNull();
    expect(ordinalId(3)).toBe('ketiga');
    expect(ordinalId(12)).toBe('ke-12');
    expect(ordinalId(0)).toBe('');
  });

  it('tahapan bawaan dari rilis 16 Oktober 2026 = jadwal dokumen Q3 2026', () => {
    const s = defaultSteps(new Date(2026, 9, 16), 'Q3 2026');
    expect(s.map((x) => x.when)).toEqual(['16–20 Oktober 2026', '21–27 Oktober 2026', 'Mulai 10 November 2026', 'November–Desember 2026']);
    expect(s[1].text).toContain('Rencana Pengembangan Q4 2026');
  });

  it('memuat periode, aspek, kategori, tahapan; isian HRD di-escape', () => {
    const html = releaseEmailHtml({ name: 'Budi <b>', period: PERIOD, content: { ...CONTENT, steps: [{ when: '1 Jan', text: '<script>x</script>' }] }, appUrl: 'https://portal.test/laporan' });
    expect(html).toContain('Q3 2026 (Juli–September 2026)');
    expect(html).toContain('lima aspek budaya');
    expect(html).toContain('Selalu Bermawas Diri');
    expect(html).toContain('Melampaui Ekspektasi');
    expect(html).toContain('siklus ketiga penerapan penilaian KPI + 360');
    expect(html).toContain('melewati batas waktu');
    expect(html).toContain('href="https://portal.test/laporan"');
    expect(html).toContain('Budi &lt;b&gt;');
    expect(html).not.toContain('<script>');
    expect(releaseSubject('Q3 2026', 'Budi')).toBe('[Konfidensial] Laporan Performance Appraisal Q3 2026 – Budi');
  });

  it('periode tanpa 360° & tanpa siklus/potongan → paragraf terkait hilang', () => {
    const html = releaseEmailHtml({ name: 'Budi', period: { ...PERIOD, has360: false, aspects: [] }, content: { cycle: '', includeLate: true, steps: [] } });
    expect(html).toContain('berasal dari skor KPI');
    expect(html).not.toContain('Tujuan penilaian 360');
    expect(html).not.toContain('melewati batas waktu');
    expect(html).not.toContain('Ini adalah siklus');
    expect(html).not.toContain('Tahapan Selanjutnya');
    expect(html).not.toContain('Buka Laporan Saya'); // tanpa appUrl → tanpa tombol
  });
});

function hrdClient(me: unknown) {
  return makeClient({ user: { id: UID }, tables: { employees: [{ data: me }] } });
}
function adminClient(tables: Record<string, QResult[]>, emails: Record<string, string | undefined>) {
  const c = makeClient({ tables });
  return Object.assign(c, {
    auth: { ...c.auth, admin: { getUserById: vi.fn(async (id: string) => ({ data: { user: emails[id] ? { email: emails[id] } : null } })) } },
  });
}
const HRD = { name: 'Rina HRD', role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const mode = (v: string) => vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: v }) } as never);

describe('sendReleaseEmails', () => {
  beforeEach(() => { vi.clearAllMocks(); mode('admin'); });

  it('HRD Mode-SPV ditolak', async () => {
    mode('spv');
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    const r = await sendReleaseEmails({ periodId: PID, employeeIds: [A], content: CONTENT });
    expect(r).toEqual({ ok: false, error: expect.stringContaining('Mode Admin') });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('pegawai biasa ditolak', async () => {
    vi.mocked(createClient).mockResolvedValue(hrdClient({ name: 'X', role: 'employee', is_hrd_admin: false, hrd_sections: null }) as never);
    const r = await sendReleaseEmails({ periodId: PID, employeeIds: [A], content: CONTENT });
    expect(r.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('kirim hanya ke yang Final + punya folder + email; sisanya dilewati dengan alasan; log sent_ids', async () => {
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    vi.mocked(createAdminClient).mockReturnValue(adminClient({
      employees: [{ data: [{ id: A, name: 'Ani' }, { id: B, name: 'Bayu' }, { id: C, name: 'Citra' }] }],
      final_reports: [{ data: [{ employee_id: A }, { employee_id: B }] }],
      employee_report_folders: [{ data: [{ employee_id: A, url: 'https://drive.google.com/x' }] }],
    }, { [A]: 'ani@infarm.co.id' }) as never);

    const r = await sendReleaseEmails({ periodId: PID, employeeIds: [A, B, C], content: CONTENT });
    expect(r).toEqual({
      ok: true, sent: [A], failed: [],
      skipped: [{ id: B, name: 'Bayu', reason: 'Folder Laporan (PDF) belum diisi' }, { id: C, name: 'Citra', reason: 'laporan belum Final' }],
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({
      to: 'ani@infarm.co.id', subject: '[Konfidensial] Laporan Performance Appraisal Q3 2026 – Ani',
    });
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain('https://portal.test/laporan');
    expect(logHrdAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'laporan.release_email', targetId: PID, meta: expect.objectContaining({ sent_ids: [A] }) }));
  });

  it('batas gelombang 20 pegawai per panggilan', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`);
    const r = await sendReleaseEmails({ periodId: PID, employeeIds: ids, content: CONTENT });
    expect(r).toEqual({ ok: false, error: 'Input tidak valid' });
  });

  it('kirim uji ke email HRD sendiri, tak dicatat sebagai terkirim', async () => {
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    vi.mocked(createAdminClient).mockReturnValue(adminClient({}, { [UID]: 'rina@infarm.co.id' }) as never);
    const r = await sendReleaseEmailTest({ periodId: PID, content: CONTENT });
    expect(r).toEqual({ ok: true, msg: 'Email uji terkirim ke rina@infarm.co.id.' });
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toBe('[UJI] [Konfidensial] Laporan Performance Appraisal Q3 2026 – Rina HRD');
    expect(logHrdAction).not.toHaveBeenCalled();
  });
});
