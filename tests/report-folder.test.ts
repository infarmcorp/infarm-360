import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient } from '@/lib/supabase/server';
import { setReportFolder } from '@/app/(app)/admin/pegawai/actions';
import { isDriveUrl, ReportFolderUrl, tableMissing } from '@/lib/report-folder';

const mockCreate = vi.mocked(createClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const FULL_HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const LIMITED_HRD = { role: 'employee', is_hrd_admin: true, hrd_sections: ['pegawai'] };
const URL_OK = 'https://drive.google.com/drive/folders/1AbCdEf';

beforeEach(() => { vi.clearAllMocks(); });

describe('isDriveUrl / ReportFolderUrl', () => {
  it('terima tautan folder Google Drive', () => {
    expect(isDriveUrl(URL_OK)).toBe(true);
    expect(isDriveUrl('https://drive.google.com/file/d/xyz/view')).toBe(true);
  });
  it('tolak host lain, http, dan host tiruan', () => {
    expect(isDriveUrl('http://drive.google.com/drive/folders/1')).toBe(false);
    expect(isDriveUrl('https://drive.google.com.evil.com/x')).toBe(false);
    expect(isDriveUrl('https://docs.google.com/document/d/1')).toBe(false);
    expect(isDriveUrl('javascript:alert(1)')).toBe(false);
    expect(isDriveUrl('bukan url')).toBe(false);
  });
  it('kosong → null (hapus); dipangkas', () => {
    expect(ReportFolderUrl.parse('  ')).toBeNull();
    expect(ReportFolderUrl.parse(`  ${URL_OK}  `)).toBe(URL_OK);
    expect(ReportFolderUrl.safeParse('https://evil.com').success).toBe(false);
  });
  it('tableMissing mengenali tabel belum ada', () => {
    expect(tableMissing({ code: '42P01' })).toBe(true);
    expect(tableMissing({ code: 'PGRST205' })).toBe(true);
    expect(tableMissing({ code: '23505' })).toBe(false);
    expect(tableMissing(null)).toBe(false);
  });
});

describe('setReportFolder', () => {
  it('tolak URL bukan Google Drive sebelum menyentuh DB', async () => {
    const r = await setReportFolder(EMP, 'https://contoh.com/folder');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Google Drive/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tolak id non-UUID', async () => {
    const r = await setReportFolder('x', URL_OK);
    expect(r.ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tolak bila pelaku bukan HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false } }] } }));
    const r = await setReportFolder(EMP, URL_OK);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/);
  });

  it('HRD terbatas tak boleh mengubah folder akun HRD/Direksi', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [
      { data: LIMITED_HRD },
      { data: { role: 'direksi', is_hrd_admin: false } },
    ] } }));
    const r = await setReportFolder(EMP, URL_OK);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/akses penuh/);
  });

  it('simpan → upsert per pegawai dengan updated_by pelaku', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: FULL_HRD }, { data: { name: 'Ulfa' } }],
      employee_report_folders: [{ error: null }],
    } });
    use(c);
    const r = await setReportFolder(EMP, URL_OK);
    expect(r.ok).toBe(true);
    const call = c.calls.find((x) => x.table === 'employee_report_folders');
    expect(call?.op).toBe('upsert');
    expect(call?.payload).toMatchObject({ employee_id: EMP, url: URL_OK, updated_by: UID });
  });

  it('URL kosong → hapus baris', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: FULL_HRD }, { data: { name: 'Ulfa' } }],
      employee_report_folders: [{ error: null }],
    } });
    use(c);
    const r = await setReportFolder(EMP, '');
    expect(r.ok).toBe(true);
    const call = c.calls.find((x) => x.table === 'employee_report_folders');
    expect(call?.op).toBe('delete');
    expect(call?.filters).toContainEqual(['eq', 'employee_id', EMP]);
  });

  it('tabel belum ada (migrasi 0050) → pesan jelas', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: FULL_HRD }, { data: { name: 'Ulfa' } }],
      employee_report_folders: [{ error: { code: 'PGRST205', message: 'Could not find the table' } }],
    } }));
    const r = await setReportFolder(EMP, URL_OK);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/migrasi 0050/);
  });

  it('pegawai tak ditemukan → tolak', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: FULL_HRD }, { data: null }] } }));
    const r = await setReportFolder(EMP, URL_OK);
    expect(r.ok).toBe(false);
  });
});
