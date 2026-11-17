import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));
let mode = 'admin';
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: mode }) })) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { savePdfNotes, savePaPdfSettings, saveAspectSummaries } from '@/app/(app)/admin/laporan/actions';

const mockCreate = vi.mocked(createClient);
const mockCreateAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockCreateAdmin.mockReturnValue(c as any); }

const HRD = { role: 'hrd', is_hrd_admin: false };
const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const PID = '22222222-2222-2222-2222-222222222222';
const SETTINGS = { reportDate: '2026-10-12', tenggat: ['a', 'b', 'c', 'd'] };

beforeEach(() => { vi.clearAllMocks(); mode = 'admin'; });

describe('savePdfNotes — isian PDF Pegawai di final_reports.content.pdfNotes', () => {
  it('menyimpan hanya kunci yang dikenal, mempertahankan isi content lain', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: { name: 'Pegawai 046' } }],
      periods: [{ data: { id: 'p1', has_360: true } }],
      final_reports: [
        { data: { id: 'fr1', status: 'draft', content: { aspectSummaries: { A: 'x' } } } },
        { data: [{ id: 'fr1' }] },
      ],
    } });
    use(c);
    const r = await savePdfNotes(EMP, { Kesimpulan: ' Baik ', 'Masukan Lain dari Penilai': '', Asing: 'buang' });
    expect(r).toEqual({ ok: true });
    const upd = c.calls.find((x) => x.table === 'final_reports' && x.op === 'update');
    expect(upd?.payload).toEqual({ content: { aspectSummaries: { A: 'x' }, pdfNotes: { Kesimpulan: 'Baik' } } });
  });

  it('ditolak bila laporan sudah Final', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      periods: [{ data: { id: 'p1', has_360: true } }],
      final_reports: [{ data: { id: 'fr1', status: 'finalized', content: {} } }],
    } }));
    const r = await savePdfNotes(EMP, { Kesimpulan: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Buka Kembali/);
  });

  it('refaktor: ringkasan aspek tetap tersimpan di aspectSummaries', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }, { data: { name: 'X' } }],
      periods: [{ data: { id: 'p1', has_360: true } }],
      final_reports: [{ data: { id: 'fr1', status: 'draft', content: { pdfNotes: { Kesimpulan: 'k' } } } }, { data: [{ id: 'fr1' }] }],
    } });
    use(c);
    expect(await saveAspectSummaries(EMP, { A: 'ringkas' })).toEqual({ ok: true });
    const upd = c.calls.find((x) => x.table === 'final_reports' && x.op === 'update');
    expect(upd?.payload).toEqual({ content: { pdfNotes: { Kesimpulan: 'k' }, aspectSummaries: { A: 'ringkas' } } });
  });
});

describe('savePaPdfSettings — pengaturan per periode (HRD Mode Admin)', () => {
  it('ditolak di luar Mode Admin', async () => {
    mode = 'spv';
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const r = await savePaPdfSettings(PID, SETTINGS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Mode Admin/);
  });

  it('ditolak untuk bukan HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false } }] } }));
    const r = await savePaPdfSettings(PID, SETTINGS);
    expect(r.ok).toBe(false);
  });

  it('isian tidak valid ditolak sebelum menyentuh database', async () => {
    const r = await savePaPdfSettings(PID, { reportDate: '12-10-2026', tenggat: ['a'] });
    expect(r.ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('menyimpan via service_role; null = kembali ke bawaan', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const admin = makeClient({ tables: { periods: [{ data: { label: 'Q3 2026' } }, { data: null }] } });
    useAdmin(admin);
    expect(await savePaPdfSettings(PID, SETTINGS)).toEqual({ ok: true });
    expect(admin.calls.find((x) => x.op === 'update')?.payload).toEqual({ pa_pdf: SETTINGS });

    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const admin2 = makeClient({ tables: { periods: [{ data: { label: 'Q3 2026' } }, { data: null }] } });
    useAdmin(admin2);
    expect(await savePaPdfSettings(PID, null)).toEqual({ ok: true });
    expect(admin2.calls.find((x) => x.op === 'update')?.payload).toEqual({ pa_pdf: null });
  });

  it('kolom belum ada (migrasi 0063 belum jalan) → pesan "belum aktif"', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    useAdmin(makeClient({ tables: { periods: [{ data: { label: 'Q3 2026' } }, { error: { message: 'column "pa_pdf" does not exist' } }] } }));
    const r = await savePaPdfSettings(PID, SETTINGS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/belum aktif/);
  });
});
