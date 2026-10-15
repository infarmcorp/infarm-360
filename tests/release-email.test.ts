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
  loadReleaseImages: vi.fn(async () => ({ ok: true, images: {} })),
}));

import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/mailer';
import { logHrdAction } from '@/lib/audit/log';
import { loadReleaseImages } from '@/lib/report-release';
import { sendReleaseEmails, sendReleaseEmailTest, uploadReleaseImage } from '@/app/(app)/admin/laporan/release-email-actions';

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
    expect(html).toContain('Cara Mengunduh Laporan PDF');
    expect(releaseSubject('Q3 2026', 'Budi')).toBe('[Konfidensial] Laporan Performance Appraisal Q3 2026 – Budi');
  });

  it('gambar: panduan setelah body, lalu kalimat cara unduh, lalu gambar cara unduh; sumber tak sah dibuang', () => {
    const html = releaseEmailHtml({ name: 'Budi', period: PERIOD, content: CONTENT,
      images: { panduan: 'cid:rilis-panduan@infarm360', 'cara-unduh': 'javascript:alert(1)' } });
    const iSign = html.indexOf('Tim HRD-GA INFARM');
    const iImg = html.indexOf('src="cid:rilis-panduan@infarm360"');
    const iHow = html.indexOf('Cara Mengunduh Laporan PDF');
    expect(iSign).toBeGreaterThan(0);
    expect(iImg).toBeGreaterThan(iSign);
    expect(iHow).toBeGreaterThan(iImg);
    expect(html).not.toContain('javascript:');
    const both = releaseEmailHtml({ name: 'Budi', period: PERIOD, content: CONTENT,
      images: { panduan: 'https://x.test/a.jpg', 'cara-unduh': 'https://x.test/b.jpg' } });
    expect(both.indexOf('https://x.test/b.jpg')).toBeGreaterThan(both.indexOf('Cara Mengunduh Laporan PDF'));
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

  it('gambar periode disisipkan inline (CID); gambar yang URL-nya tak terjangkau dilewati', async () => {
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    vi.mocked(createAdminClient).mockReturnValue(adminClient({
      employees: [{ data: [{ id: A, name: 'Ani' }] }],
      final_reports: [{ data: [{ employee_id: A }] }],
      employee_report_folders: [{ data: [{ employee_id: A, url: 'https://drive.google.com/x' }] }],
    }, { [A]: 'ani@infarm.co.id' }) as never);
    vi.mocked(loadReleaseImages).mockResolvedValueOnce({ ok: true, images: {
      panduan: { url: 'https://s.test/panduan.jpg?v=1', path: `release/${PID}/panduan.jpg`, contentType: 'image/jpeg' },
      'cara-unduh': { url: 'https://s.test/hilang.jpg?v=1', path: `release/${PID}/cara-unduh.jpg`, contentType: 'image/jpeg' },
    } });
    const fetchMock = vi.fn(async (url: string) => ({ ok: !url.includes('hilang') }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const r = await sendReleaseEmails({ periodId: PID, employeeIds: [A], content: CONTENT });
      expect(r.ok && r.sent).toEqual([A]);
      const msg = vi.mocked(sendEmail).mock.calls[0][0];
      expect(msg.attachments).toEqual([{ filename: 'Panduan setelah menerima laporan.jpg', path: 'https://s.test/panduan.jpg?v=1', cid: 'rilis-panduan@infarm360' }]);
      expect(msg.html).toContain('src="cid:rilis-panduan@infarm360"');
      expect(msg.html).not.toContain('hilang');
    } finally { vi.unstubAllGlobals(); }
  });

  it('unggah gambar: format & ukuran ditolak sebelum menyentuh penyimpanan', async () => {
    const form = (file: File, key = 'panduan') => { const f = new FormData(); f.set('periodId', PID); f.set('key', key); f.set('file', file); return f; };
    expect(await uploadReleaseImage(form(new File(['x'], 'a.gif', { type: 'image/gif' })))).toEqual({ ok: false, error: 'Format gambar harus JPG, PNG, atau WebP.' });
    expect(await uploadReleaseImage(form(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'a.jpg', { type: 'image/jpeg' })))).toEqual({ ok: false, error: 'Ukuran gambar maksimal 2 MB.' });
    expect(await uploadReleaseImage(form(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 'lain'))).toEqual({ ok: false, error: 'Input tidak valid' });
    expect(createAdminClient).not.toHaveBeenCalled();
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
