import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type MockCall } from './helpers/mock-supabase';

/**
 * Uji GUARD & OTORISASI tiga jalur "permohonan pemetaan" (migrasi 0035):
 *   - requestMappingRemoval  (pegawai minta pemetaannya dihapus)
 *   - requestNewAssessment   (pegawai minta menilai rekan + usul hubungan kerja)
 *   - reviewCorrection       (HRD memutuskan; per-JENIS: relation | remove | add)
 *
 * Kenapa diuji: jalur ini menyentuh SIAPA-MENILAI-SIAPA, yaitu komposisi penilai yang
 * menentukan BOBOT skor 360°. Salah gerbang di sini tidak memunculkan error — hanya
 * angka & relasi yang jadi salah diam-diam (mis. pegawai menonaktifkan pemetaan sendiri,
 * atau pemetaan dihapus setelah penilaiannya dikirim → skor 360° berubah retroaktif).
 * Pola: mock Supabase chainable (antrean per-tabel FIFO), tanpa DB nyata.
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })) }));
// Perhitungan ulang skor 360° adalah efek samping berat (service_role) — di luar lingkup uji guard.
vi.mock('@/app/(app)/admin/360/actions', () => ({ computeResult360: vi.fn(async () => ({ ok: true })) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requestMappingRemoval, requestNewAssessment } from '@/app/(app)/penilaian/request-actions';
import { reviewCorrection } from '@/app/(app)/admin/pemetaan/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); return c; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: MockClient) { mockAdmin.mockReturnValue(c as any); return c; }

const HRD = { role: 'hrd', is_hrd_admin: false };
const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TARGET = '11111111-1111-1111-1111-111111111111';
const MAP = 'm1';
const REASON = 'Tidak pernah bekerja sama di kuartal ini';

/** Periode aktif: 360° aktif + pemetaan sudah diumumkan (gerbang fase terbuka). */
const PERIOD_OPEN = { data: { id: 'p1', has_360: true, form_open: false, mapping_published: true } };
const MINE = { data: { id: MAP, relation: 'Peer' } };
const NO_PENDING = { data: null };

function insertOf(calls: MockCall[], table: string) {
  return calls.find((c) => c.table === table && c.op === 'insert')?.payload as Record<string, unknown> | undefined;
}
function updateOf(calls: MockCall[], table: string) {
  return calls.filter((c) => c.table === table && c.op === 'update');
}

beforeEach(() => { vi.clearAllMocks(); });

/**
 * requestMappingRemoval DINONAKTIFKAN (mockup Screen 01/07, 2026-09-28 — "Hilangkan
 * Ajukan Hapus dari sisi rater"): digantikan Exposure Check/Not Eligible (BR-03),
 * self-service tanpa ACC HRD. Fungsi kini SELALU menolak & TIDAK menyentuh DB apa pun
 * — pengganti seluruh baterai uji guard/gerbang-fase versi lama.
 */
describe('requestMappingRemoval — dinonaktifkan (digantikan Exposure Check)', () => {
  it('selalu menolak, apa pun input & kondisi sesi/periode, tanpa menyentuh DB', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: { periods: [PERIOD_OPEN], mappings: [MINE] } }));
    const r = await requestMappingRemoval(MAP, TARGET, REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Ajukan Hapus dinonaktifkan/i);
    expect(c.calls).toHaveLength(0);
  });
});

describe('requestNewAssessment — validasi, kelayakan target & duplikat', () => {
  const OK_TARGET = { data: { id: TARGET, role: 'employee', is_external: false, is_active: true } };

  it('tolak hubungan kerja di luar daftar (Self dikecualikan)', async () => {
    use(makeClient({ user: { id: UID } }));
    const r = await requestNewAssessment(TARGET, 'Self', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hubungan kerja tidak valid/i);
  });

  it('tolak alasan kosong', async () => {
    use(makeClient({ user: { id: UID } }));
    const r = await requestNewAssessment(TARGET, 'Peer', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/minimal 5 karakter/i);
  });

  it('tolak mengajukan penilaian untuk DIRI SENDIRI', async () => {
    use(makeClient({ user: { id: TARGET } }));
    const r = await requestNewAssessment(TARGET, 'Peer', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/diri sendiri/i);
  });

  it('tolak target tidak ditemukan', async () => {
    use(makeClient({ user: { id: UID }, tables: { periods: [PERIOD_OPEN], employees: [{ data: null }] } }));
    const r = await requestNewAssessment(TARGET, 'Peer', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tidak ditemukan/i);
  });

  it('tolak target nonaktif', async () => {
    use(makeClient({ user: { id: UID }, tables: { periods: [PERIOD_OPEN], employees: [
      { data: { id: TARGET, role: 'employee', is_external: false, is_active: false } },
    ] } }));
    const r = await requestNewAssessment(TARGET, 'Peer', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nonaktif/i);
  });

  it('tolak target Direksi', async () => {
    use(makeClient({ user: { id: UID }, tables: { periods: [PERIOD_OPEN], employees: [
      { data: { id: TARGET, role: 'direksi', is_external: false, is_active: true } },
    ] } }));
    const r = await requestNewAssessment(TARGET, 'Atasan', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Direksi/i);
  });

  it('tolak target eksternal (hanya boleh jadi penilai)', async () => {
    use(makeClient({ user: { id: UID }, tables: { periods: [PERIOD_OPEN], employees: [
      { data: { id: TARGET, role: 'employee', is_external: true, is_active: true } },
    ] } }));
    const r = await requestNewAssessment(TARGET, 'Cross', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/eksternal/i);
  });

  it('tolak bila rekan sudah ada di daftar penilaian', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      periods: [PERIOD_OPEN], employees: [OK_TARGET], mappings: [{ data: { id: MAP } }],
    } }));
    const r = await requestNewAssessment(TARGET, 'Peer', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sudah ada di daftar/i);
  });

  it('tolak bila sudah ada permohonan pending untuk rekan yang sama', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      periods: [PERIOD_OPEN], employees: [OK_TARGET], mappings: [{ data: null }],
      relation_correction_requests: [{ data: { id: 'r9' } }],
    } }));
    const r = await requestNewAssessment(TARGET, 'Bawahan', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/menunggu/i);
  });

  it('sukses → insert kind=add dengan relasi USULAN, tanpa mapping_id & tanpa membuat mapping', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      periods: [PERIOD_OPEN], employees: [OK_TARGET], mappings: [{ data: null }],
      relation_correction_requests: [NO_PENDING, { error: null }],
    } }));
    const r = await requestNewAssessment(TARGET, 'Cross', REASON);
    expect(r.ok).toBe(true);
    expect(insertOf(c.calls, 'relation_correction_requests')).toMatchObject({
      kind: 'add', mapping_id: null, period_id: 'p1', assessor_id: UID, target_id: TARGET,
      old_relation: null, new_relation: 'Cross', reason: REASON, status: 'pending',
    });
    expect(c.calls.filter((x) => x.table === 'mappings' && x.op !== 'select')).toHaveLength(0);
  });
});

describe('reviewCorrection — otorisasi HRD & alasan penolakan', () => {
  it('tolak bila sesi berakhir', async () => {
    use(makeClient({ user: null }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sesi berakhir/i);
  });

  it('tolak bila pelaku bukan HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false } }] } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/i);
  });

  it('IZINKAN pemegang grant is_hrd_admin (HRD = izin, bukan posisi)', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'employee', is_hrd_admin: true } }],
      relation_correction_requests: [{ data: {
        id: 'r1', kind: 'relation', mapping_id: MAP, assessor_id: UID, target_id: TARGET,
        period_id: 'p1', new_relation: 'Atasan', status: 'pending',
      } }, { error: null }],
      mappings: [{ error: null }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(true);
    expect(updateOf(c.calls, 'mappings')[0]?.payload).toEqual({ relation: 'Atasan' });
  });

  it('tolak PENOLAKAN tanpa alasan yang memadai (sebelum menyentuh DB)', async () => {
    const c = use(makeClient({ user: { id: UID } }));
    const r = await reviewCorrection('r1', 'rejected', 'no');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Alasan penolakan minimal 5 karakter/i);
    expect(c.calls).toHaveLength(0);
  });

  it('tolak permohonan yang sudah diproses (tak bisa diputus dua kali)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: { id: 'r1', kind: 'add', status: 'approved' } }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sudah diproses/i);
  });

  it('tolak permohonan tidak ditemukan', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }], relation_correction_requests: [{ data: null }],
    } }));
    const r = await reviewCorrection('r1', 'rejected', REASON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tidak ditemukan/i);
  });
});

describe('reviewCorrection — jenis "relation" (koreksi garis hubungan)', () => {
  const REQ = {
    id: 'r1', kind: 'relation', mapping_id: null, assessor_id: UID, target_id: TARGET,
    period_id: 'p1', new_relation: 'Bawahan', status: 'pending',
  };

  it('setuju → update relasi via pasangan penilai→target bila mapping_id kosong', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
      mappings: [{ error: null }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(true);
    const upd = updateOf(c.calls, 'mappings')[0];
    expect(upd?.payload).toEqual({ relation: 'Bawahan' });
    expect(upd?.filters).toEqual([
      ['eq', 'assessor_id', UID], ['eq', 'target_id', TARGET], ['eq', 'period_id', 'p1'],
    ]);
  });

  it('TOLAK (rejected) → mapping tidak disentuh, alasan penolakan tersimpan', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
    } }));
    const r = await reviewCorrection('r1', 'rejected', REASON);
    expect(r.ok).toBe(true);
    expect(c.calls.filter((x) => x.table === 'mappings')).toHaveLength(0);
    expect(updateOf(c.calls, 'relation_correction_requests')[0]?.payload).toMatchObject({
      status: 'rejected', reviewed_by: UID, reject_reason: REASON,
    });
  });

  it('persetujuan tetap tercatat approved dengan reject_reason null', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
      mappings: [{ error: null }],
    } }));
    await reviewCorrection('r1', 'approved');
    expect(updateOf(c.calls, 'relation_correction_requests')[0]?.payload).toMatchObject({
      status: 'approved', reject_reason: null,
    });
  });

  it('gagal update mapping → permohonan TIDAK ditandai selesai', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }],
      mappings: [{ error: { message: 'RLS' } }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Gagal memperbarui mapping/i);
    expect(updateOf(c.calls, 'relation_correction_requests')).toHaveLength(0);
  });
});

describe('reviewCorrection — jenis "remove" (penghapusan pemetaan)', () => {
  const REQ = {
    id: 'r1', kind: 'remove', mapping_id: MAP, assessor_id: UID, target_id: TARGET,
    period_id: 'p1', new_relation: null, status: 'pending',
  };

  it('TOLAK setuju bila penilaian pasangan ini SUDAH DIKIRIM (skor 360° sudah terbentuk)', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }],
    } }));
    useAdmin(makeClient({ tables: { assessments: [{ data: { id: 'a1', status: 'submitted' } }] } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sudah dikirim/i);
    // Pemetaan tetap aktif & permohonan tetap pending (HRD boleh menolak / hapus manual).
    expect(c.calls.filter((x) => x.table === 'mappings')).toHaveLength(0);
    expect(updateOf(c.calls, 'relation_correction_requests')).toHaveLength(0);
  });

  it('setuju → nonaktifkan pemetaan (is_active:false) via mapping_id, DRAF penilaian dibuang', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
      mappings: [{ error: null }],
    } }));
    const admin = useAdmin(makeClient({ tables: {
      assessments: [{ data: { id: 'a1', status: 'draft' } }, { error: null }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(true);
    const upd = updateOf(c.calls, 'mappings')[0];
    expect(upd?.payload).toEqual({ is_active: false });   // dinonaktifkan, BUKAN dihapus (jejak audit)
    expect(upd?.filters).toEqual([['eq', 'id', MAP]]);
    expect(admin.calls.find((x) => x.table === 'assessments' && x.op === 'delete')?.filters)
      .toEqual([['eq', 'id', 'a1']]);
  });

  it('setuju tanpa penilaian apa pun → tak ada hapus draf', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
      mappings: [{ error: null }],
    } }));
    const admin = useAdmin(makeClient({ tables: { assessments: [{ data: null }] } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(true);
    expect(admin.calls.filter((x) => x.op === 'delete')).toHaveLength(0);
  });

  it('TOLAK (rejected) → pemetaan tetap aktif, penilaian tak dicek/dihapus', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
    } }));
    const admin = useAdmin(makeClient({}));
    const r = await reviewCorrection('r1', 'rejected', REASON);
    expect(r.ok).toBe(true);
    expect(c.calls.filter((x) => x.table === 'mappings')).toHaveLength(0);
    expect(admin.calls).toHaveLength(0);
  });
});

describe('reviewCorrection — jenis "add" (penambahan penilaian)', () => {
  const REQ = {
    id: 'r1', kind: 'add', mapping_id: null, assessor_id: UID, target_id: TARGET,
    period_id: 'p1', new_relation: 'Cross', status: 'pending',
  };

  it('tolak setuju bila permohonan tanpa hubungan kerja', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: { ...REQ, new_relation: null } }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/tanpa hubungan kerja/i);
    expect(updateOf(c.calls, 'relation_correction_requests')).toHaveLength(0);
  });

  /**
   * INVARIANT (kebijakan 2026-08-21): permohonan yang DISETUJUI jadi pemetaan setara penugasan
   * HRD → `mandatory: true` & `is_adhoc: false`. Konsekuensinya berantai: baris itu tampil di
   * Kelola Pemetaan, ditagih Progress 360 & kepatuhan, dan pegawai hanya bisa melepasnya lewat
   * Exposure Check → Not Eligible (BR-03), bukan tombol hapus Ad-Hoc ("Ajukan Hapus" dinonaktifkan
   * 2026-09-28). Jangan longgarkan tanpa menyesuaikan semuanya.
   */
  it('setuju & belum ada mapping → INSERT mapping WAJIB & BUKAN ad-hoc', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
      mappings: [{ data: null }, { error: null }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(true);
    expect(insertOf(c.calls, 'mappings')).toEqual({
      period_id: 'p1', assessor_id: UID, target_id: TARGET,
      relation: 'Cross', mandatory: true, is_adhoc: false, is_active: true,
    });
  });

  it('setuju & mapping sudah ada → UPDATE jadi wajib/non-ad-hoc & aktif, tanpa insert', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
      mappings: [{ data: { id: MAP } }, { error: null }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(true);
    expect(insertOf(c.calls, 'mappings')).toBeUndefined();
    const upd = updateOf(c.calls, 'mappings')[0];
    // Baris Ad-Hoc lama yang dipakai ulang WAJIB naik status — kalau tidak, penilaian
    // hasil persetujuan HRD tetap tersembunyi dari Kelola Pemetaan & Progress.
    expect(upd?.payload).toEqual({ relation: 'Cross', mandatory: true, is_adhoc: false, is_active: true });
    expect(upd?.filters).toEqual([['eq', 'id', MAP]]);
  });

  it('gagal membuat pemetaan → permohonan TIDAK ditandai selesai', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }],
      mappings: [{ data: null }, { error: { message: 'RLS' } }],
    } }));
    const r = await reviewCorrection('r1', 'approved');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Gagal membuat pemetaan/i);
    expect(updateOf(c.calls, 'relation_correction_requests')).toHaveLength(0);
  });

  it('TOLAK (rejected) → tak ada pemetaan dibuat', async () => {
    const c = use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }],
      relation_correction_requests: [{ data: REQ }, { error: null }],
    } }));
    const r = await reviewCorrection('r1', 'rejected', REASON);
    expect(r.ok).toBe(true);
    expect(c.calls.filter((x) => x.table === 'mappings')).toHaveLength(0);
  });
});
