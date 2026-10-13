import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifySummaryRows, buildSummaryPayload, mergeSummaryOverwrite, normKind, type SummaryContext,
} from '@/lib/import/summaries';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { importSummaries } from '@/app/(app)/admin/laporan/actions';
import { logHrdAction, logAuditAsService } from '@/lib/audit/log';
import { refreshLatePenalties } from '@/lib/late-server';

/* ─────────────────────────── logika murni ─────────────────────────── */

const A = { id: 'a1', code: 'EMP001', name: 'Ani', status: 'draft' };
const B = { id: 'b1', code: 'EMP002', name: 'Budi', status: 'finalized' };
const C = { id: 'c1', code: 'EMP003', name: 'Cici', status: null };
const CTX: SummaryContext = {
  employees: [A, B, C],
  aspects: ['Integritas', 'Kerja Sama Tim'],
  questions: ['Apa kekuatan utama?'],
  periodLabel: 'Q3 2026',
  selfId: null,
};
const row = (kode: string, jenis: string, item: string, ringkasan: string, periode = 'Q3 2026') =>
  ({ periode, kode, nama: '', divisi: '', status_laporan: '', jenis, aspek_atau_pertanyaan: item, ringkasan });

describe('normKind', () => {
  it('mengenali label Ekspor & variasinya', () => {
    expect(normKind('Aspek')).toBe('aspect');
    expect(normKind(' pertanyaan  kualitatif ')).toBe('qual');
    expect(normKind('Esai')).toBe('qual');
    expect(normKind('lain')).toBeNull();
  });
});

describe('classifySummaryRows', () => {
  it('baris valid → ok, kunci kanonik meski beda huruf/spasi', () => {
    const r = classifySummaryRows([row('emp001', 'Aspek', '  kerja  sama tim ', 'Baik sekali')], CTX);
    expect(r[0]).toMatchObject({ status: 'ok', item: 'Kerja Sama Tim', line: 2, emp: A });
  });

  it('kode tak dikenal, jenis salah, item tak ada, teks kepanjangan → invalid', () => {
    const r = classifySummaryRows([
      row('X9', 'Aspek', 'Integritas', 'a'),
      row('EMP001', 'Lain', 'Integritas', 'a'),
      row('EMP003', 'Aspek', 'Tidak Ada', 'a'),
      row('EMP003', 'Pertanyaan Kualitatif', 'Apa kekuatan utama?', 'x'.repeat(2001)),
    ], CTX);
    expect(r.map((x) => x.status)).toEqual(['invalid', 'invalid', 'invalid', 'invalid']);
    expect(r[2].reason).toMatch(/tidak ada di periode Q3 2026/);
    expect(r[3].reason).toMatch(/2001 karakter/);
  });

  it('laporan Final, periode lain, laporan sendiri (grant) → skip', () => {
    const r = classifySummaryRows([
      row('EMP002', 'Aspek', 'Integritas', 'a'),
      row('EMP001', 'Aspek', 'Integritas', 'a', 'Q2 2026'),
      row('EMP003', 'Aspek', 'Integritas', 'a'),
    ], { ...CTX, selfId: 'c1' });
    expect(r.map((x) => x.status)).toEqual(['skip', 'skip', 'skip']);
    expect(r[0].reason).toMatch(/Final/);
  });

  it('sel kosong → empty; baris kosong total dibuang (nomor baris tetap sesuai Excel)', () => {
    const r = classifySummaryRows([
      row('EMP001', 'Aspek', 'Integritas', ''),
      { kode: '', jenis: '', aspek_atau_pertanyaan: '', ringkasan: '' },
      row('EMP001', 'Aspek', 'Kerja Sama Tim', 'ok'),
    ], CTX);
    expect(r.map((x) => [x.line, x.status])).toEqual([[2, 'empty'], [4, 'ok']]);
  });

  it('satu baris invalid memblokir seluruh grup pegawai × jenis, grup lain tak terpengaruh', () => {
    const r = classifySummaryRows([
      row('EMP001', 'Aspek', 'Integritas', 'baik'),
      row('EMP001', 'Aspek', 'Integritass', 'typo'),        // salah ketik
      row('EMP001', 'Pertanyaan Kualitatif', 'Apa kekuatan utama?', 'teliti'),
      row('EMP003', 'Aspek', 'Integritas', 'baik'),
    ], CTX);
    expect(r.map((x) => x.status)).toEqual(['blocked', 'invalid', 'ok', 'ok']);
    expect(r[0].reason).toMatch(/baris 3/);
  });

  it('duplikat item → invalid & memblokir grup', () => {
    const r = classifySummaryRows([
      row('EMP001', 'Aspek', 'Integritas', 'satu'),
      row('EMP001', 'Aspek', 'integritas', 'dua'),
    ], CTX);
    expect(r.map((x) => x.status)).toEqual(['blocked', 'invalid']);
    expect(r[1].reason).toMatch(/baris 2/);
  });
});

describe('buildSummaryPayload', () => {
  it('kelompok per pegawai; kosong → null; grup tanpa teks sama sekali tak dikirim', () => {
    const r = classifySummaryRows([
      row('EMP001', 'Aspek', 'Integritas', 'baik'),
      row('EMP001', 'Aspek', 'Kerja Sama Tim', ''),
      row('EMP001', 'Pertanyaan Kualitatif', 'Apa kekuatan utama?', ''), // grup qual hanya kosong
      row('EMP003', 'Aspek', 'Integritas', ''),                          // pegawai hanya kosong
    ], CTX);
    expect(buildSummaryPayload(r)).toEqual([
      { employeeId: 'a1', aspect: { Integritas: 'baik', 'Kerja Sama Tim': null } },
    ]);
  });
});

describe('mergeSummaryOverwrite', () => {
  it('timpa: item di luar file terhapus; null = pertahankan isi lama', () => {
    expect(mergeSummaryOverwrite(
      { Integritas: 'lama', 'Kerja Sama Tim': 'lama2', Inovasi: 'hilang' },
      { Integritas: 'baru', 'Kerja Sama Tim': null },
    )).toEqual({ Integritas: 'baru', 'Kerja Sama Tim': 'lama2' });
  });
  it('null tanpa isi lama → tak ada entri', () => {
    expect(mergeSummaryOverwrite(undefined, { Integritas: null })).toEqual({});
  });
});

/* ─────────────────────────── Server Action ─────────────────────────── */

const mockCreate = vi.mocked(createClient);
const mockCreateAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const use = (c: MockClient) => mockCreate.mockResolvedValue(c as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAdmin = (c: MockClient) => mockCreateAdmin.mockReturnValue(c as any);

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const E1 = '11111111-1111-1111-1111-111111111111';
const E2 = '22222222-2222-2222-2222-222222222222';
const HRD = { role: 'hrd', is_hrd_admin: false, name: 'HRD' };
const GRANT_HOLDER = { role: 'employee', is_hrd_admin: false, hrd_sections: null, dept: 'Marketing', name: 'Ulfa' };
const ACTIVE = { data: { id: 'p1', has_360: true } };
const CONFIG = {
  culture_aspects: [{ data: [{ name: 'Integritas' }, { name: 'Kerja Sama Tim' }] }],
  qualitative_questions: [{ data: [{ text: 'Apa kekuatan utama?' }] }],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('importSummaries', () => {
  it('tolak input tak valid & bukan HRD/grant', async () => {
    expect((await importSummaries([])).ok).toBe(false);
    expect((await importSummaries([{ employeeId: 'bukan-uuid', aspect: {} }])).ok).toBe(false);

    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv' } }], page_grants: [{ data: [] }] } }));
    const r = await importSummaries([{ employeeId: E1, aspect: { Integritas: 'x' } }]);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Hanya HRD/) });
  });

  it('tolak grant hanya-lihat', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: GRANT_HOLDER }],
      page_grants: [{ data: [{ section: 'review', scope: 'own_division', scopes: ['own_division'], can_edit: false, can_finalize: false }] }],
    } }));
    const r = await importSummaries([{ employeeId: E1, aspect: { Integritas: 'x' } }]);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/hanya-lihat/) });
  });

  it('tolak periode tanpa 360°', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }], periods: [{ data: { id: 'p1', has_360: false } }] } }));
    const r = await importSummaries([{ employeeId: E1, aspect: { Integritas: 'x' } }]);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/tanpa penilaian 360/) });
  });

  it('HRD: timpa ringkasan aspek (kosong = isi lama), qual & key lain di content tetap; Final dilewati', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: [{ id: E1, name: 'Ani', dept: 'Ops' }, { id: E2, name: 'Budi', dept: 'Ops' }] }],
      periods: [ACTIVE],
      ...CONFIG,
      final_reports: [
        { data: [
          { id: 'r1', employee_id: E1, status: 'in_review', content: { aspectSummaries: { Integritas: 'lama', 'Kerja Sama Tim': 'tetap', Inovasi: 'x' }, qualSummaries: { 'Apa kekuatan utama?': 'q' }, other: 1 } },
          { id: 'r2', employee_id: E2, status: 'finalized', content: {} },
        ] },
        { data: [{ id: 'r1' }] }, // update r1
      ],
    } });
    use(c);
    const r = await importSummaries([
      { employeeId: E1, aspect: { Integritas: 'baru', 'Kerja Sama Tim': null } },
      { employeeId: E2, aspect: { Integritas: 'baru' } },
    ]);
    expect(r).toEqual({ ok: true, saved: 1, skipped: [{ name: 'Budi', reason: 'Laporan sudah Final' }], failed: [] });
    const upd = c.calls.find((x) => x.op === 'update');
    expect(upd?.payload).toEqual({ content: {
      aspectSummaries: { Integritas: 'baru', 'Kerja Sama Tim': 'tetap' },
      qualSummaries: { 'Apa kekuatan utama?': 'q' },
      other: 1,
    } });
    expect(c.calls.filter((x) => x.op === 'update')).toHaveLength(1); // E2 Final tak disentuh
    expect(logHrdAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logHrdAction).mock.calls[0][0]).toMatchObject({ action: 'report.import_summary', targetId: E1 });
  });

  it('kunci item di luar aspek/pertanyaan periode aktif → dilewati, tak ditulis', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: [{ id: E1, name: 'Ani', dept: 'Ops' }] }],
      periods: [ACTIVE], ...CONFIG,
      final_reports: [{ data: [{ id: 'r1', employee_id: E1, status: 'draft', content: {} }] }],
    } });
    use(c);
    const r = await importSummaries([{ employeeId: E1, qual: { 'Pertanyaan palsu': 'x' } }]);
    expect(r).toMatchObject({ ok: true, saved: 0, skipped: [{ name: 'Ani' }] });
    expect(c.calls.some((x) => x.op === 'update' || x.op === 'insert')).toBe(false);
  });

  it('belum ada laporan → buat draf dgn Skor Akhir live; potongan telat diterapkan sekali', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: [{ id: E1, name: 'Ani', dept: 'Ops' }] }],
      periods: [ACTIVE], ...CONFIG,
      final_reports: [{ data: [] }, { data: null }], // tak ada laporan; insert ok
      period_months: [{ data: [{ ym: '2026-07' }] }],
      kpi_scores: [{ data: [{ score: 90 }] }],
      result_360: [{ data: { score: 70 } }],
    } });
    use(c);
    const r = await importSummaries([{ employeeId: E1, qual: { 'Apa kekuatan utama?': 'teliti' } }]);
    expect(r).toMatchObject({ ok: true, saved: 1 });
    expect(refreshLatePenalties).toHaveBeenCalledTimes(1);
    expect(refreshLatePenalties).toHaveBeenCalledWith('p1', [E1]);
    const ins = c.calls.find((x) => x.op === 'insert');
    expect(ins?.payload).toMatchObject({ employee_id: E1, status: 'draft', content: { qualSummaries: { 'Apa kekuatan utama?': 'teliti' } } });
  });

  it('grant Meringkas: pegawai di luar lingkup & diri sendiri dilewati; tulis via service_role', async () => {
    const SELF = UID;
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: GRANT_HOLDER }],
      page_grants: [{ data: [{ section: 'review', scope: 'own_division', scopes: ['own_division'], can_edit: true, can_finalize: false }] }],
    } }));
    const admin = makeClient({ tables: {
      periods: [ACTIVE], ...CONFIG,
      employees: [{ data: [
        { id: E1, name: 'Ani', dept: 'Marketing' },
        { id: E2, name: 'Budi', dept: 'Finance' },
        { id: SELF, name: 'Ulfa', dept: 'Marketing' },
      ] }],
      final_reports: [
        { data: [{ id: 'r1', employee_id: E1, status: 'draft', content: {} }] },
        { data: [{ id: 'r1' }] },
      ],
    } });
    useAdmin(admin);
    const r = await importSummaries([
      { employeeId: E1, aspect: { Integritas: 'a' } },
      { employeeId: E2, aspect: { Integritas: 'b' } },
      { employeeId: SELF, aspect: { Integritas: 'c' } },
    ]);
    expect(r).toMatchObject({ ok: true, saved: 1 });
    if (r.ok) {
      expect(r.skipped.map((s) => s.name).sort()).toEqual(['Budi', 'Ulfa']);
      expect(r.skipped.find((s) => s.name === 'Budi')?.reason).toMatch(/di luar lingkup/);
    }
    expect(admin.calls.filter((x) => x.op === 'update')).toHaveLength(1);
    expect(logAuditAsService).toHaveBeenCalledTimes(1);
  });

  it('gagal membaca laporan → tolak seluruhnya (kunci Final gagal tertutup)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: [{ id: E1, name: 'Ani', dept: 'Ops' }] }],
      periods: [ACTIVE], ...CONFIG,
      final_reports: [{ data: null, error: { message: 'boom' } }],
    } }));
    const r = await importSummaries([{ employeeId: E1, aspect: { Integritas: 'a' } }]);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Gagal membaca/) });
  });
});
