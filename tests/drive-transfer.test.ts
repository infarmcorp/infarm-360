import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { makeClient } from './helpers/mock-supabase';
import {
  driveFoldersFor, planFileOps, coordinatorFolderName, spvFolderName,
  SUPERVISOR_FOLDER, OTHER_FOLDER, NO_DEPT_FOLDER, type DriveTeams,
} from '@/lib/drive-layout';
import { signServiceJwt } from '@/lib/drive/google-drive';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
vi.mock('@/lib/pdf/pa-report', () => ({ renderPaReport: vi.fn(async () => Buffer.from('%PDF')) }));
vi.mock('@/lib/pdf/pa-load', () => ({
  loadPaPeriods: vi.fn(async () => ({ periods: [{ id: PID, label: 'Q4 2026', has_360: true, status: 'active', start_date: '2026-10-01', end_date: '2026-12-31' }], settingsReady: true })),
  paInputFor: vi.fn(async (_db: unknown, id: string) => ({ input: { name: id === A ? 'Ani' : 'Bayu', dept: 'Marketing' }, settings: {}, isDefault: true })),
}));
vi.mock('@/lib/drive/layout-server', () => ({ loadDriveTeams: vi.fn() }));
vi.mock('@/lib/drive/google-drive', async (orig) => ({
  ...(await orig<typeof import('@/lib/drive/google-drive')>()),
  driveConfigured: vi.fn(() => true),
  driveRootFolderId: vi.fn(() => 'ROOT'),
  checkRootFolder: vi.fn(async () => {}),
  ensureFolderPath: vi.fn(async (_root: string, path: string[]) => `F:${path.join('/')}`),
  findPaFiles: vi.fn(async () => []),
  uploadPaPdf: vi.fn(async () => {}),
  replacePaPdf: vi.fn(async () => {}),
  trashFile: vi.fn(async () => {}),
}));

import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { loadDriveTeams } from '@/lib/drive/layout-server';
import * as drive from '@/lib/drive/google-drive';
import { logHrdAction } from '@/lib/audit/log';
import { transferPdfsToDrive } from '@/app/(app)/admin/laporan/drive-actions';

const PID = '11111111-1111-4111-8111-111111111111';
const UID = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';
const B = '44444444-4444-4444-8444-444444444444';

function teams(p: Partial<DriveTeams> = {}): DriveTeams {
  return { spvBy: new Map(), coordBy: new Map(), leads: new Set(), people: new Map(), ...p };
}

describe('susunan folder Drive', () => {
  const people = new Map([
    ['spv1', { name: 'Budi', coordinatorArea: null }],
    ['spv2', { name: 'Rina', coordinatorArea: null }],
    ['k1', { name: 'Andi', coordinatorArea: 'Warehouse' }],
    ['k2', { name: 'Dewi', coordinatorArea: 'Purchasing' }],
    ['k3', { name: 'Sari', coordinatorArea: null }],
  ]);

  it('dinaungi koordinator → folder koordinator berbidang (bukan folder SPV)', () => {
    const t = teams({ people, coordBy: new Map([['e', ['k1']]]), spvBy: new Map([['e', ['spv1']]]) });
    expect(driveFoldersFor({ id: 'e', dept: 'Supply Chain', role: 'employee' }, t)).toEqual([['Supply Chain', 'Koordinator Warehouse - Andi']]);
  });

  it('dua koordinator → disalin ke kedua folder (urut stabil); bidang kosong → tanpa bidang', () => {
    const t = teams({ people, coordBy: new Map([['e', ['k3', 'k2']]]) });
    expect(driveFoldersFor({ id: 'e', dept: 'Supply Chain', role: 'employee' }, t)).toEqual([
      ['Supply Chain', 'Koordinator - Sari'], ['Supply Chain', 'Koordinator Purchasing - Dewi'],
    ]);
  });

  it('langsung di bawah SPV → folder SPV (langsung); koordinator sendiri ikut folder SPV-nya', () => {
    const t = teams({ people, spvBy: new Map([['k1', ['spv1']]]) });
    expect(driveFoldersFor({ id: 'k1', dept: 'Supply Chain', role: 'employee' }, t)).toEqual([['Supply Chain', 'SPV - Budi (langsung)']]);
  });

  it('SPV & pemimpin tim → Supervisor (untuk Direksi); Direksi/tanpa atasan → Lainnya; tanpa divisi', () => {
    const t = teams({ people, leads: new Set(['lead']), spvBy: new Map([['spv1', ['spv2']]]) });
    expect(driveFoldersFor({ id: 'spv1', dept: 'Marketing', role: 'spv' }, t)).toEqual([['Marketing', SUPERVISOR_FOLDER]]);
    expect(driveFoldersFor({ id: 'lead', dept: 'Marketing', role: 'employee' }, t)).toEqual([['Marketing', SUPERVISOR_FOLDER]]);
    expect(driveFoldersFor({ id: 'd', dept: 'Direksi', role: 'direksi' }, t)).toEqual([['Direksi', OTHER_FOLDER]]);
    expect(driveFoldersFor({ id: 'x', dept: null, role: 'employee' }, t)).toEqual([[NO_DEPT_FOLDER, OTHER_FOLDER]]);
  });

  it('nama folder dibersihkan dari garis miring', () => {
    expect(coordinatorFolderName('Andi', 'Konten / Sosmed')).toBe('Koordinator Konten Sosmed - Andi');
    expect(spvFolderName('A/B')).toBe('SPV - A B (langsung)');
  });
});

describe('rekonsiliasi berkas (planFileOps)', () => {
  it('belum ada → unggah baru', () => {
    expect(planFileOps([], ['F1'])).toEqual({ update: [], create: ['F1'], trash: [] });
  });
  it('sudah di folder yang benar → timpa tanpa pindah', () => {
    expect(planFileOps([{ id: 'x', parentId: 'F1' }], ['F1'])).toEqual({
      update: [{ fileId: 'x', folderId: 'F1', move: false, fromParent: 'F1' }], create: [], trash: [],
    });
  });
  it('pindah atasan → berkas lama dipindah, bukan digandakan', () => {
    expect(planFileOps([{ id: 'x', parentId: 'OLD' }], ['NEW'])).toEqual({
      update: [{ fileId: 'x', folderId: 'NEW', move: true, fromParent: 'OLD' }], create: [], trash: [],
    });
  });
  it('salinan berlebih → Sampah; kurang → unggah', () => {
    const ops = planFileOps([{ id: 'a', parentId: 'F1' }, { id: 'b', parentId: 'OLD1' }, { id: 'c', parentId: 'OLD2' }], ['F1']);
    expect(ops.update).toEqual([{ fileId: 'a', folderId: 'F1', move: false, fromParent: 'F1' }]);
    expect(ops.trash).toEqual(['b', 'c']);
    expect(planFileOps([{ id: 'a', parentId: 'F1' }], ['F1', 'F2']).create).toEqual(['F2']);
  });
});

describe('JWT akun layanan', () => {
  it('bertanda tangan RS256 & berisi scope Drive', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const jwt = signServiceJwt({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: pem }, 1000);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: 'sa@x.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/drive', iat: 1000, exp: 4600 });
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
  });
});

const HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const mode = (v: string) => vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: v }) } as never);
const hrdClient = (me: unknown) => makeClient({ user: { id: UID }, tables: { employees: [{ data: me }] } });

describe('transferPdfsToDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mode('admin');
    vi.mocked(drive.driveConfigured).mockReturnValue(true);
    vi.mocked(loadDriveTeams).mockResolvedValue(teams({
      people: new Map([['spv1', { name: 'Budi', coordinatorArea: null }]]),
      spvBy: new Map([[A, ['spv1']], [B, ['spv1']]]),
    }));
  });

  it('HRD Mode-SPV & pegawai biasa ditolak — tak ada yang diunggah', async () => {
    mode('spv');
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    expect(await transferPdfsToDrive({ periodId: PID, employeeIds: [A] })).toEqual({ ok: false, error: expect.stringContaining('Mode Admin') });
    mode('admin');
    vi.mocked(createClient).mockResolvedValue(hrdClient({ role: 'employee', is_hrd_admin: false, hrd_sections: null }) as never);
    expect((await transferPdfsToDrive({ periodId: PID, employeeIds: [A] })).ok).toBe(false);
    expect(drive.uploadPaPdf).not.toHaveBeenCalled();
  });

  it('input lebih dari 5 pegawai / bukan uuid ditolak; Drive belum diatur → belum aktif', async () => {
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    expect(await transferPdfsToDrive({ periodId: PID, employeeIds: Array(6).fill(A) })).toEqual({ ok: false, error: 'Input tidak valid' });
    expect(await transferPdfsToDrive({ periodId: 'x', employeeIds: [A] })).toEqual({ ok: false, error: 'Input tidak valid' });
    vi.mocked(drive.driveConfigured).mockReturnValue(false);
    expect(await transferPdfsToDrive({ periodId: PID, employeeIds: [A] })).toEqual({ ok: false, error: expect.stringContaining('belum aktif') });
  });

  it('hanya laporan Final diunggah ke <Periode>/<Divisi>/<SPV>; sisanya dilewati; tercatat di log', async () => {
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ tables: {
      employees: [{ data: [{ id: A, name: 'Ani', dept: 'Marketing', role: 'employee' }, { id: B, name: 'Bayu', dept: 'Marketing', role: 'employee' }] }],
      final_reports: [{ data: [{ employee_id: A, status: 'finalized' }, { employee_id: B, status: 'draft' }] }],
    } }) as never);

    const r = await transferPdfsToDrive({ periodId: PID, employeeIds: [A, B] });
    expect(r).toEqual({
      ok: true, failed: [],
      done: [{ id: A, name: 'Ani', folders: ['Marketing / SPV - Budi (langsung)'] }],
      skipped: [{ id: B, name: 'Bayu', reason: 'laporan belum Final' }],
    });
    expect(drive.ensureFolderPath).toHaveBeenCalledWith('ROOT', ['Q4 2026', 'Marketing', 'SPV - Budi (langsung)'], expect.any(Map));
    expect(drive.uploadPaPdf).toHaveBeenCalledWith('F:Q4 2026/Marketing/SPV - Budi (langsung)', 'Marketing - Ani - Q4 2026.pdf', expect.any(Buffer), { periodId: PID, employeeId: A });
    expect(logHrdAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'report.drive_transfer' }));
  });

  it('kegagalan Drive per pegawai dilaporkan, tak menghentikan pegawai lain', async () => {
    vi.mocked(createClient).mockResolvedValue(hrdClient(HRD) as never);
    vi.mocked(createAdminClient).mockReturnValue(makeClient({ tables: {
      employees: [{ data: [{ id: A, name: 'Ani', dept: 'Marketing', role: 'employee' }, { id: B, name: 'Bayu', dept: 'Marketing', role: 'employee' }] }],
      final_reports: [{ data: [{ employee_id: A, status: 'finalized' }, { employee_id: B, status: 'finalized' }] }],
    } }) as never);
    vi.mocked(drive.uploadPaPdf).mockRejectedValueOnce(new drive.DriveError('kuota habis'));
    const r = await transferPdfsToDrive({ periodId: PID, employeeIds: [A, B] });
    expect(r.ok && r.failed).toEqual([{ id: A, name: 'Ani', reason: 'kuota habis' }]);
    expect(r.ok && r.done.map((d) => d.id)).toEqual([B]);
  });
});
