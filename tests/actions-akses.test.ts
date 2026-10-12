import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

// Uji KARAKTERISASI Manajemen Akses (grant halaman): mengunci perilaku saat ini, bukan memperbaikinya.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logHrdAction } from '@/lib/audit/log';
import {
  setPageGrant, setPageGrantForRole, removePageGrant, removePageGrantForAll,
  removeAllPageGrantsForEmployee, markAccessReviewed,
} from '@/app/(app)/admin/akses/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const mockLog = vi.mocked(logHrdAction);
const mockRevalidate = vi.mocked(revalidatePath);

/**
 * Pembungkus lokal: makeClient tak merekam opsi `upsert` (onConflict). Bungkus `from()` agar opsi
 * upsert tercatat di `upsertOpts` tanpa mengubah helper bersama.
 */
type AdminMock = MockClient & { upsertOpts: unknown[] };
function makeAdmin(tables: Record<string, QResult[]>): AdminMock {
  const base = makeClient({ tables });
  const upsertOpts: unknown[] = [];
  const origFrom = base.from;
  const from = (table: string) => {
    const b = origFrom(table);
    const origUpsert = b.upsert;
    b.upsert = (payload: unknown, opts?: unknown) => { upsertOpts.push(opts); return origUpsert(payload, opts); };
    return b;
  };
  return Object.assign(base, { from, upsertOpts });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockAdmin.mockReturnValue(c as any); }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const EMP2 = '22222222-2222-2222-2222-222222222222';

const FULL_HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const FULL_HRD_GRANT = { role: 'employee', is_hrd_admin: true, hrd_sections: [] };
const LIMITED_HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: ['pegawai'] };
const SPV = { role: 'spv', is_hrd_admin: false, hrd_sections: null };

/** Klien pengguna (RLS) untuk pelaku HRD penuh + respons employees lanjutan. */
function actor(me: unknown, ...moreEmployees: QResult[]) {
  return makeClient({ user: { id: UID }, tables: { employees: [{ data: me }, ...moreEmployees] } });
}

beforeEach(() => { vi.clearAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
// Gerbang otorisasi (sama untuk keenam aksi)
// ─────────────────────────────────────────────────────────────────────────────
type Case = { name: string; run: () => Promise<{ ok: boolean; error?: string }> };
const ALL_ACTIONS: Case[] = [
  { name: 'setPageGrant', run: () => setPageGrant(EMP, 'monitor', ['all']) },
  { name: 'setPageGrantForRole', run: () => setPageGrantForRole('spv', 'monitor', ['all']) },
  { name: 'removePageGrant', run: () => removePageGrant(EMP, 'monitor') },
  { name: 'removePageGrantForAll', run: () => removePageGrantForAll('monitor') },
  { name: 'removeAllPageGrantsForEmployee', run: () => removeAllPageGrantsForEmployee(EMP) },
  { name: 'markAccessReviewed', run: () => markAccessReviewed(EMP) },
];

describe('Manajemen Akses — gerbang HRD penuh (isFullHrd)', () => {
  for (const c of ALL_ACTIONS) {
    it(`${c.name}: tolak bila sesi berakhir`, async () => {
      use(makeClient({ user: null }));
      const r = await c.run();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Sesi berakhir/);
      expect(mockAdmin).not.toHaveBeenCalled();
      expect(mockLog).not.toHaveBeenCalled();
    });

    it(`${c.name}: tolak HRD terbatas (hrd_sections berisi)`, async () => {
      use(actor(LIMITED_HRD));
      const r = await c.run();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/akses penuh/);
      expect(mockAdmin).not.toHaveBeenCalled();
      expect(mockLog).not.toHaveBeenCalled();
      expect(mockRevalidate).not.toHaveBeenCalled();
    });

    it(`${c.name}: tolak non-HRD (SPV)`, async () => {
      use(actor(SPV));
      const r = await c.run();
      expect(r.ok).toBe(false);
      expect(mockAdmin).not.toHaveBeenCalled();
      expect(mockLog).not.toHaveBeenCalled();
    });

    it(`${c.name}: tolak bila baris pelaku tak ditemukan`, async () => {
      use(actor(null));
      const r = await c.run();
      expect(r.ok).toBe(false);
      expect(mockAdmin).not.toHaveBeenCalled();
    });
  }

  it('pelaku dibaca dari employees berdasarkan id user sesi', async () => {
    const c = actor(SPV);
    use(c);
    await removePageGrant(EMP, 'monitor');
    expect(c.calls[0]).toMatchObject({ table: 'employees', op: 'select', filters: [['eq', 'id', UID]] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setPageGrant
// ─────────────────────────────────────────────────────────────────────────────
describe('setPageGrant — validasi input', () => {
  const bad: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
    ['employeeId bukan UUID', () => setPageGrant('bukan-uuid', 'monitor', ['all'])],
    ['halaman di luar katalog GRANTABLE_PAGES', () => setPageGrant(EMP, 'pegawai', ['all'])],
    ['halaman akses (Manajemen Akses) tak bisa di-grant', () => setPageGrant(EMP, 'akses', ['all'])],
    ['lingkup tak dikenal', () => setPageGrant(EMP, 'monitor', ['divisi_lain'])],
    ['lingkup kosong', () => setPageGrant(EMP, 'monitor', [])],
    ['lingkup bukan array', () => setPageGrant(EMP, 'monitor', 'all')],
    ['salah satu lingkup tak sah', () => setPageGrant(EMP, 'monitor', ['all', 'xx'])],
  ];
  for (const [name, run] of bad) {
    it(`tolak ${name} sebelum menyentuh DB`, async () => {
      const r = await run();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/tidak valid/);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockAdmin).not.toHaveBeenCalled();
    });
  }
});

describe('setPageGrant — penulisan & audit', () => {
  it('tolak bila pegawai target tak ditemukan (tanpa menulis)', async () => {
    use(actor(FULL_HRD, { data: null }));
    const r = await setPageGrant(EMP, 'monitor', ['all']);
    expect(r).toEqual({ ok: false, error: 'Pegawai tidak ditemukan.' });
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('upsert via service_role dengan onConflict (employee_id,section) + audit + revalidate', async () => {
    const user = actor(FULL_HRD, { data: { name: 'Budi' } });
    use(user);
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrant(EMP, 'monitor', ['own_division']);
    expect(r).toEqual({ ok: true, msg: 'Akses "Monitor Kinerja Pegawai" diberikan (Hanya divisinya).' });
    // Target dibaca lewat klien pengguna (RLS).
    expect(user.calls[1]).toMatchObject({ table: 'employees', op: 'select', filters: [['eq', 'id', EMP]] });
    expect(admin.calls).toHaveLength(1);
    expect(admin.calls[0]).toMatchObject({
      table: 'page_grants', op: 'upsert',
      payload: { employee_id: EMP, section: 'monitor', scope: 'own_division', scopes: ['own_division'], can_edit: false, can_finalize: false, created_by: UID },
    });
    expect(admin.upsertOpts[0]).toEqual({ onConflict: 'employee_id,section' });
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'access.set_page_grant', category: 'pegawai',
      summary: 'Memberi akses "Monitor Kinerja Pegawai" (Hanya divisinya) untuk Budi',
      targetType: 'employee', targetId: EMP, targetLabel: 'Budi',
      meta: { section: 'monitor', scopes: ['own_division'], can_edit: false, can_finalize: false },
    });
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/akses');
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/monitor');
    expect(mockRevalidate).toHaveBeenCalledWith('/kpi');
    expect(mockRevalidate).toHaveBeenCalledWith('/', 'layout');
  });

  it('pemegang izin is_hrd_admin (hrd_sections kosong) dianggap HRD penuh', async () => {
    use(actor(FULL_HRD_GRANT, { data: { name: 'Budi' } }));
    useAdmin(makeAdmin({ page_grants: [{ error: null }] }));
    const r = await setPageGrant(EMP, 'monitor', ['all']);
    expect(r.ok).toBe(true);
  });

  it('lingkup dideduplikasi, urutan masukan dipertahankan; scope (legacy) = scopes[0]', async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrant(EMP, 'dashboard', ['other_divisions', 'self', 'other_divisions']);
    expect(r.ok).toBe(true);
    expect(admin.calls[0].payload).toMatchObject({ scope: 'other_divisions', scopes: ['other_divisions', 'self'] });
    if (r.ok) expect(r.msg).toBe('Akses "Dashboard Organisasi" diberikan (Selain divisinya + Diri sendiri).');
  });

  it("'all' menyerap lingkup lain → disimpan ['all'] saja", async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    await setPageGrant(EMP, 'monitor', ['own_division', 'all', 'self']);
    expect(admin.calls[0].payload).toMatchObject({ scope: 'all', scopes: ['all'] });
  });

  for (const page of ['monitor', 'dashboard', 'struktur', 'progress', 'kepatuhan', 'kpi'] as const) {
    it(`halaman pemantauan '${page}' dipaksa Lihat-saja walau diminta Finalisasi`, async () => {
      use(actor(FULL_HRD, { data: { name: 'Budi' } }));
      const admin = makeAdmin({ page_grants: [{ error: null }] });
      useAdmin(admin);
      const r = await setPageGrant(EMP, page, ['all'], true, true);
      expect(r.ok).toBe(true);
      expect(admin.calls[0].payload).toMatchObject({ can_edit: false, can_finalize: false });
      // Halaman pemantauan tak menampilkan label izin.
      if (r.ok) expect(r.msg).not.toMatch(/lihat|meringkas|finalisasi/);
    });
  }

  it("halaman 'review' (administrator): Lihat → can_edit/can_finalize false, label 'hanya lihat'", async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrant(EMP, 'review', ['own_division']);
    expect(admin.calls[0].payload).toMatchObject({ can_edit: false, can_finalize: false });
    expect(r).toEqual({ ok: true, msg: 'Akses "Review & Finalisasi" diberikan (Hanya divisinya, hanya lihat).' });
  });

  it("halaman 'review': Meringkas → can_edit true, can_finalize false", async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrant(EMP, 'review', ['other_divisions'], true, false);
    expect(admin.calls[0].payload).toMatchObject({ can_edit: true, can_finalize: false });
    if (r.ok) expect(r.msg).toMatch(/boleh meringkas/);
    expect(mockLog.mock.calls[0][0]).toMatchObject({ meta: { can_edit: true, can_finalize: false } });
  });

  it("halaman 'review': Finalisasi menyiratkan can_edit walau canEdit=false", async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrant(EMP, 'review', ['all'], false, true);
    expect(admin.calls[0].payload).toMatchObject({ can_edit: true, can_finalize: true });
    if (r.ok) expect(r.msg).toMatch(/boleh finalisasi/);
  });

  it('canEdit/canFinalize dikoersi truthy (!!) — string "false" dianggap true (perilaku saat ini)', async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    await setPageGrant(EMP, 'review', ['all'], 'false', 0);
    expect(admin.calls[0].payload).toMatchObject({ can_edit: true, can_finalize: false });
  });

  it('TIDAK menolak grant untuk diri sendiri (perilaku saat ini — tak ada cek self)', async () => {
    use(actor(FULL_HRD, { data: { name: 'Saya' } }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrant(UID, 'review', ['all'], true, true);
    expect(r.ok).toBe(true);
    expect(admin.calls[0].payload).toMatchObject({ employee_id: UID, created_by: UID });
  });

  it('nama target null → audit memakai id & targetLabel null', async () => {
    use(actor(FULL_HRD, { data: { name: null } }));
    useAdmin(makeAdmin({ page_grants: [{ error: null }] }));
    await setPageGrant(EMP, 'kpi', ['self']);
    expect(mockLog.mock.calls[0][0]).toMatchObject({ summary: expect.stringContaining(`untuk ${EMP}`), targetLabel: null });
  });

  it('galat upsert → gagal, tanpa audit & revalidate', async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    useAdmin(makeAdmin({ page_grants: [{ error: { message: 'boom' } }] }));
    const r = await setPageGrant(EMP, 'monitor', ['all']);
    expect(r).toEqual({ ok: false, error: 'Gagal menyimpan akses: boom' });
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setPageGrantForRole
// ─────────────────────────────────────────────────────────────────────────────
describe('setPageGrantForRole — validasi input', () => {
  const bad: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
    ['peran tak dikenal (hrd)', () => setPageGrantForRole('hrd', 'monitor', ['all'])],
    ['peran tak dikenal (employee mentah)', () => setPageGrantForRole('employee', 'monitor', ['all'])],
    ['halaman di luar katalog', () => setPageGrantForRole('spv', 'periode', ['all'])],
    ['lingkup kosong', () => setPageGrantForRole('spv', 'monitor', [])],
    ['lingkup tak sah', () => setPageGrantForRole('spv', 'monitor', ['semua'])],
  ];
  for (const [name, run] of bad) {
    it(`tolak ${name} sebelum menyentuh DB`, async () => {
      const r = await run();
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/tidak valid/);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockAdmin).not.toHaveBeenCalled();
    });
  }
});

describe('setPageGrantForRole — materialisasi ke anggota peran', () => {
  const roleFilters: [string, unknown[][]][] = [
    ['spv', [['eq', 'is_external', false], ['eq', 'role', 'spv']]],
    ['pegawai', [['eq', 'is_external', false], ['eq', 'role', 'employee']]],
    ['direksi', [['eq', 'is_external', false], ['eq', 'role', 'direksi']]],
    ['koordinator', [['eq', 'is_external', false], ['eq', 'is_coordinator', true]]],
  ];
  for (const [rt, filters] of roleFilters) {
    it(`peran '${rt}' → anggota dibaca via service_role dengan filter yang benar`, async () => {
      use(actor(FULL_HRD));
      const admin = makeAdmin({ employees: [{ data: [{ id: EMP }] }], page_grants: [{ error: null }] });
      useAdmin(admin);
      const r = await setPageGrantForRole(rt, 'monitor', ['all']);
      expect(r.ok).toBe(true);
      expect(admin.calls[0]).toMatchObject({ table: 'employees', op: 'select', filters });
    });
  }

  it('upsert satu baris per anggota + audit massal', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ employees: [{ data: [{ id: EMP }, { id: EMP2 }] }], page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrantForRole('koordinator', 'review', ['coordinator_team', 'coordinator_team'], true, false);
    expect(r).toEqual({ ok: true, msg: 'Akses "Review & Finalisasi" diberikan ke 2 Koordinator (Tim naungannya, boleh meringkas).' });
    const row = { section: 'review', scope: 'coordinator_team', scopes: ['coordinator_team'], can_edit: true, can_finalize: false, created_by: UID };
    expect(admin.calls[1]).toMatchObject({
      table: 'page_grants', op: 'upsert',
      payload: [{ employee_id: EMP, ...row }, { employee_id: EMP2, ...row }],
    });
    expect(admin.upsertOpts[0]).toEqual({ onConflict: 'employee_id,section' });
    expect(mockLog).toHaveBeenCalledWith({
      action: 'access.set_page_grant_role', category: 'pegawai',
      summary: 'Memberi akses "Review & Finalisasi" (Tim naungannya, boleh meringkas) ke SEMUA Koordinator (2 orang)',
      targetType: 'role', targetId: 'koordinator', targetLabel: 'Koordinator',
      meta: { section: 'review', scopes: ['coordinator_team'], can_edit: true, can_finalize: false, count: 2 },
    });
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/akses');
  });

  it('halaman pemantauan → izin dipaksa Lihat untuk semua anggota', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ employees: [{ data: [{ id: EMP }] }], page_grants: [{ error: null }] });
    useAdmin(admin);
    await setPageGrantForRole('spv', 'kepatuhan', ['own_division', 'all'], true, true);
    expect(admin.calls[1].payload).toEqual([
      { employee_id: EMP, section: 'kepatuhan', scope: 'all', scopes: ['all'], can_edit: false, can_finalize: false, created_by: UID },
    ]);
  });

  it('tak ada anggota → gagal tanpa upsert', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ employees: [{ data: [] }] });
    useAdmin(admin);
    const r = await setPageGrantForRole('direksi', 'monitor', ['all']);
    expect(r).toEqual({ ok: false, error: 'Tak ada anggota Direksi saat ini.' });
    expect(admin.calls).toHaveLength(1);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('galat baca anggota → gagal', async () => {
    use(actor(FULL_HRD));
    useAdmin(makeAdmin({ employees: [{ data: null, error: { message: 'x' } }] }));
    const r = await setPageGrantForRole('spv', 'monitor', ['all']);
    expect(r).toEqual({ ok: false, error: 'Gagal membaca anggota peran: x' });
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('galat upsert → gagal tanpa audit', async () => {
    use(actor(FULL_HRD));
    useAdmin(makeAdmin({ employees: [{ data: [{ id: EMP }] }], page_grants: [{ error: { message: 'y' } }] }));
    const r = await setPageGrantForRole('spv', 'monitor', ['all']);
    expect(r).toEqual({ ok: false, error: 'Gagal menyimpan akses massal: y' });
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('TIDAK mengecualikan pelaku sendiri dari daftar anggota (perilaku saat ini)', async () => {
    use(actor(FULL_HRD_GRANT));
    const admin = makeAdmin({ employees: [{ data: [{ id: UID }, { id: EMP }] }], page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await setPageGrantForRole('pegawai', 'review', ['all'], false, true);
    expect(r.ok).toBe(true);
    expect((admin.calls[1].payload as { employee_id: string }[]).map((x) => x.employee_id)).toEqual([UID, EMP]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removePageGrant
// ─────────────────────────────────────────────────────────────────────────────
describe('removePageGrant', () => {
  it('tolak employeeId bukan UUID / halaman di luar katalog sebelum menyentuh DB', async () => {
    expect((await removePageGrant('x', 'monitor')).ok).toBe(false);
    expect((await removePageGrant(EMP, 'akses')).ok).toBe(false);
    expect((await removePageGrant(EMP, undefined)).ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('hapus via service_role berfilter (employee_id, section) + audit', async () => {
    const user = actor(FULL_HRD, { data: { name: 'Budi' } });
    use(user);
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await removePageGrant(EMP, 'progress');
    expect(r).toEqual({ ok: true, msg: 'Akses "Progress 360 Feedback" dicabut.' });
    expect(admin.calls).toEqual([
      { table: 'page_grants', op: 'delete', filters: [['eq', 'employee_id', EMP], ['eq', 'section', 'progress']] },
    ]);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'access.remove_page_grant', category: 'pegawai',
      summary: 'Mencabut akses "Progress 360 Feedback" untuk Budi',
      targetType: 'employee', targetId: EMP, targetLabel: 'Budi', meta: { section: 'progress' },
    });
    expect(mockRevalidate).toHaveBeenCalledWith('/', 'layout');
  });

  it('target tak ditemukan TIDAK menghalangi pencabutan (label jatuh ke id)', async () => {
    use(actor(FULL_HRD, { data: null }));
    const admin = makeAdmin({ page_grants: [{ error: null }] });
    useAdmin(admin);
    const r = await removePageGrant(EMP, 'kpi');
    expect(r.ok).toBe(true);
    expect(mockLog.mock.calls[0][0]).toMatchObject({ summary: `Mencabut akses "Monitoring & Audit KPI" untuk ${EMP}`, targetLabel: null });
  });

  it('galat delete → gagal tanpa audit', async () => {
    use(actor(FULL_HRD, { data: { name: 'Budi' } }));
    useAdmin(makeAdmin({ page_grants: [{ error: { message: 'z' } }] }));
    const r = await removePageGrant(EMP, 'monitor');
    expect(r).toEqual({ ok: false, error: 'Gagal mencabut akses: z' });
    expect(mockLog).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removePageGrantForAll
// ─────────────────────────────────────────────────────────────────────────────
describe('removePageGrantForAll', () => {
  it('tolak halaman di luar katalog sebelum menyentuh DB', async () => {
    const r = await removePageGrantForAll('pegawai');
    expect(r).toEqual({ ok: false, error: 'Input tidak valid' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tanpa pemegang → ok, tanpa delete & audit', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ page_grants: [{ data: [] }] });
    useAdmin(admin);
    const r = await removePageGrantForAll('monitor');
    expect(r).toEqual({ ok: true, msg: 'Tidak ada pemegang akses halaman ini.', removedIds: [] });
    expect(admin.calls).toHaveLength(1);
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('pemegang dideduplikasi lalu seluruh baris halaman dihapus + audit', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ page_grants: [{ data: [{ employee_id: EMP }, { employee_id: EMP2 }, { employee_id: EMP }] }, { error: null }] });
    useAdmin(admin);
    const r = await removePageGrantForAll('review');
    expect(r).toEqual({ ok: true, msg: 'Akses "Review & Finalisasi" dicabut dari 2 pegawai.', removedIds: [EMP, EMP2] });
    expect(admin.calls[0]).toMatchObject({ table: 'page_grants', op: 'select', filters: [['eq', 'section', 'review']] });
    expect(admin.calls[1]).toEqual({ table: 'page_grants', op: 'delete', filters: [['eq', 'section', 'review']] });
    expect(mockLog).toHaveBeenCalledWith({
      action: 'access.remove_page_grant_all', category: 'pegawai',
      summary: 'Mencabut akses "Review & Finalisasi" dari SEMUA pemegang (2 orang)',
      targetType: 'page', targetId: 'review', targetLabel: 'Review & Finalisasi', meta: { section: 'review', count: 2 },
    });
  });

  it('galat baca pemegang diabaikan → dianggap tak ada pemegang (perilaku saat ini)', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ page_grants: [{ data: null, error: { message: 'baca gagal' } }] });
    useAdmin(admin);
    const r = await removePageGrantForAll('monitor');
    expect(r).toEqual({ ok: true, msg: 'Tidak ada pemegang akses halaman ini.', removedIds: [] });
  });

  it('galat delete → gagal tanpa audit', async () => {
    use(actor(FULL_HRD));
    useAdmin(makeAdmin({ page_grants: [{ data: [{ employee_id: EMP }] }, { error: { message: 'd' } }] }));
    const r = await removePageGrantForAll('monitor');
    expect(r).toEqual({ ok: false, error: 'Gagal mencabut akses massal: d' });
    expect(mockLog).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeAllPageGrantsForEmployee
// ─────────────────────────────────────────────────────────────────────────────
describe('removeAllPageGrantsForEmployee', () => {
  it('tolak id bukan UUID sebelum menyentuh DB', async () => {
    const r = await removeAllPageGrantsForEmployee(123);
    expect(r).toEqual({ ok: false, error: 'Input tidak valid' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('tanpa grant → ok, tanpa delete & audit', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ employees: [{ data: { name: 'Budi' } }], page_grants: [{ data: [] }] });
    useAdmin(admin);
    const r = await removeAllPageGrantsForEmployee(EMP);
    expect(r).toEqual({ ok: true, msg: 'Pegawai ini tak punya akses halaman.', removedSections: [] });
    expect(admin.calls.filter((c) => c.op === 'delete')).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('hapus semua grant pegawai via service_role + audit berisi daftar section', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({
      employees: [{ data: { name: 'Budi' } }],
      page_grants: [{ data: [{ section: 'monitor' }, { section: 'review' }] }, { error: null }],
    });
    useAdmin(admin);
    const r = await removeAllPageGrantsForEmployee(EMP);
    expect(r).toEqual({ ok: true, msg: 'Semua akses halaman (2) untuk Budi dicabut.', removedSections: ['monitor', 'review'] });
    expect(admin.calls[0]).toMatchObject({ table: 'employees', op: 'select', filters: [['eq', 'id', EMP]] });
    expect(admin.calls[1]).toMatchObject({ table: 'page_grants', op: 'select', filters: [['eq', 'employee_id', EMP]] });
    expect(admin.calls[2]).toEqual({ table: 'page_grants', op: 'delete', filters: [['eq', 'employee_id', EMP]] });
    expect(mockLog).toHaveBeenCalledWith({
      action: 'access.remove_all_page_grants', category: 'pegawai',
      summary: 'Mencabut SEMUA akses halaman (2) untuk Budi',
      targetType: 'employee', targetId: EMP, targetLabel: 'Budi', meta: { count: 2, sections: ['monitor', 'review'] },
    });
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/akses');
  });

  it('galat delete → gagal tanpa audit', async () => {
    use(actor(FULL_HRD));
    useAdmin(makeAdmin({ employees: [{ data: null }], page_grants: [{ data: [{ section: 'kpi' }] }, { error: { message: 'e' } }] }));
    const r = await removeAllPageGrantsForEmployee(EMP);
    expect(r).toEqual({ ok: false, error: 'Gagal mencabut akses: e' });
    expect(mockLog).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markAccessReviewed
// ─────────────────────────────────────────────────────────────────────────────
describe('markAccessReviewed', () => {
  it('tolak id bukan UUID sebelum menyentuh DB', async () => {
    const r = await markAccessReviewed('abc');
    expect(r).toEqual({ ok: false, error: 'Input tidak valid' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('set access_reviewed_at (ISO) via service_role + audit; tak menyentuh page_grants', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ employees: [{ data: { name: 'Budi' } }, { error: null }] });
    useAdmin(admin);
    const r = await markAccessReviewed(EMP);
    expect(r).toEqual({ ok: true, msg: 'Ditandai sudah ditinjau.' });
    expect(admin.calls).toHaveLength(2);
    const upd = admin.calls[1];
    expect(upd).toMatchObject({ table: 'employees', op: 'update', filters: [['eq', 'id', EMP]] });
    const ts = (upd.payload as { access_reviewed_at: string }).access_reviewed_at;
    expect(Object.keys(upd.payload as object)).toEqual(['access_reviewed_at']);
    expect(new Date(ts).toISOString()).toBe(ts);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'access.mark_reviewed', category: 'pegawai',
      summary: 'Menandai akses pegawai baru "Budi" sudah ditinjau',
      targetType: 'employee', targetId: EMP, targetLabel: 'Budi',
    });
  });

  it('target tak ditemukan TIDAK ditolak — update tetap dijalankan (perilaku saat ini)', async () => {
    use(actor(FULL_HRD));
    const admin = makeAdmin({ employees: [{ data: null }, { error: null }] });
    useAdmin(admin);
    const r = await markAccessReviewed(EMP);
    expect(r.ok).toBe(true);
    expect(mockLog.mock.calls[0][0]).toMatchObject({ summary: `Menandai akses pegawai baru "${EMP}" sudah ditinjau`, targetLabel: null });
  });

  it('galat update → gagal tanpa audit', async () => {
    use(actor(FULL_HRD));
    useAdmin(makeAdmin({ employees: [{ data: { name: 'Budi' } }, { error: { message: 'u' } }] }));
    const r = await markAccessReviewed(EMP);
    expect(r).toEqual({ ok: false, error: 'Gagal menandai: u' });
    expect(mockLog).not.toHaveBeenCalled();
  });
});
