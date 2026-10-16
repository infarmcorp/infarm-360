/**
 * Uji KARAKTERISASI aksi massal Review & Finalisasi (app/(app)/admin/laporan/actions.ts):
 *   - bulkFinalizeAccepted : finalisasi massal laporan ber-ACC (`spv_acc=true`) berstatus `in_review`.
 *   - resyncDriftedFinals  : sinkronkan `final_score` laporan `finalized` yang skornya berubah (drift).
 * Mengunci perilaku SAAT INI (bukan spesifikasi ideal). finalScoreOf/hasScoreDrift (lib/scoring)
 * SENGAJA tidak di-mock — rumus asli ikut terjaga.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient, type QResult } from './helpers/mock-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
// Dipantau saja: aksi massal laporan TIDAK memakai pengaman backfill (lihat tes terkait).
vi.mock('@/lib/backfill-guard', () => ({ isBackfilledPeriod: vi.fn(async () => true), BACKFILL_LOCK_MSG: 'x' }));

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction, logAuditAsService } from '@/lib/audit/log';
import { refreshLatePenalties } from '@/lib/late-server';
import { isBackfilledPeriod } from '@/lib/backfill-guard';
import { bulkFinalizeAccepted, resyncDriftedFinals } from '@/app/(app)/admin/laporan/actions';

const mockCreate = vi.mocked(createClient);
const mockLog = vi.mocked(logHrdAction);
const mockRefresh = vi.mocked(refreshLatePenalties);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: MockClient) { mockCreate.mockResolvedValue(c as any); }
function setMode(mode: 'admin' | 'spv' | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(cookies).mockResolvedValue({ get: () => (mode ? { value: mode } : undefined) } as any);
}

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const E1 = '11111111-1111-1111-1111-111111111111';
const E2 = '22222222-2222-2222-2222-222222222222';
const HRD = { role: 'hrd', is_hrd_admin: false, hrd_sections: null };
const ACTIVE = { data: { id: 'p1', has_360: true, status: 'active' } };
const ACTIVE_NO360 = { data: { id: 'p1', has_360: false, status: 'active' } };

/** Antrean computeFinal satu pegawai: bulan, KPI, 360. */
function compute(kpi: number[] | null, s360: number | null): Record<string, QResult[]> {
  return {
    period_months: [{ data: kpi ? [{ ym: '2026-07' }] : [] }],
    kpi_scores: kpi ? [{ data: kpi.map((score) => ({ score })) }] : [],
    result_360: [{ data: s360 == null ? null : { score: s360 } }],
  };
}
/** Gabungkan beberapa antrean (urutan = urutan pemanggilan). */
function merge(...parts: Record<string, QResult[]>[]): Record<string, QResult[]> {
  const out: Record<string, QResult[]> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = [...(out[k] ?? []), ...v];
  return out;
}
const updates = (c: MockClient) => c.calls.filter((x) => x.table === 'final_reports' && x.op === 'update');

beforeEach(() => { vi.clearAllMocks(); setMode('admin'); });

// ─────────────────────────────────────────────────────────────────────────────
describe('bulkFinalizeAccepted — otorisasi (HRD penuh, sadar-mode)', () => {
  it('tolak bila sesi berakhir', async () => {
    use(makeClient({ user: null }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
  });

  it('tolak SPV / pegawai biasa', async () => {
    const c = makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false } }] } });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: false, error: 'Hanya HRD (Mode Admin) yang dapat memfinalisasi massal' });
    expect(c.calls.map((x) => x.table)).toEqual(['employees']);
  });

  it('tolak HRD yang sedang di Mode-SPV (cookie hrd_mode=spv)', async () => {
    setMode('spv');
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const r = await bulkFinalizeAccepted();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Mode Admin/);
  });

  it('tolak HRD tanpa cookie hrd_mode (default = base/spv)', async () => {
    setMode(null);
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const r = await bulkFinalizeAccepted();
    expect(r.ok).toBe(false);
  });

  it("tolak HRD Admin yang hrd_sections-nya tidak memuat 'laporan'", async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'employee', is_hrd_admin: true, hrd_sections: ['pemetaan'] } }],
    } }));
    const r = await bulkFinalizeAccepted();
    expect(r.ok).toBe(false);
  });

  it("izinkan HRD Admin (is_hrd_admin) dgn hrd_sections memuat 'laporan'", async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'employee', is_hrd_admin: true, hrd_sections: ['laporan'] } }],
      periods: [ACTIVE],
      final_reports: [{ data: [] }],
    } }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 0, skipped: [], failed: [] });
  });

  it('pemegang grant Review tingkat Finalisasi TETAP ditolak (page_grants tak dibaca sama sekali)', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'employee', is_hrd_admin: false, hrd_sections: null } }],
      page_grants: [{ data: [{ section: 'review', scope: 'all', scopes: ['all'], can_edit: true, can_finalize: true }] }],
    } });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r.ok).toBe(false);
    expect(c.calls.some((x) => x.table === 'page_grants')).toBe(false);
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled();
  });
});

describe('bulkFinalizeAccepted — pemilihan laporan & periode', () => {
  it('tolak bila tak ada periode aktif (periode terkunci/draf tak pernah disentuh)', async () => {
    const c = makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }], periods: [{ data: null }] } });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: false, error: 'Tidak ada periode aktif' });
    expect(c.calls.find((x) => x.table === 'periods')?.filters).toEqual([['eq', 'status', 'active']]);
  });

  it('kandidat = final_reports periode aktif dgn spv_acc=true DAN status in_review', async () => {
    const c = makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }], periods: [ACTIVE], final_reports: [{ data: [] }] } });
    use(c);
    await bulkFinalizeAccepted();
    const q = c.calls.find((x) => x.table === 'final_reports');
    expect(q?.op).toBe('select');
    expect(q?.filters).toEqual([['eq', 'period_id', 'p1'], ['eq', 'spv_acc', true], ['eq', 'status', 'in_review']]);
  });

  it('tanpa kandidat → ok 0, TANPA potongan telat & TANPA log aktivitas (return lebih awal)', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }], periods: [ACTIVE], final_reports: [{ data: [] }] } }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 0, skipped: [], failed: [] });
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it('error baca kandidat → pesan gagal (dulu ditelan sebagai kosong; diperbaiki gelombang 2b)', async () => {
    use(makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }], periods: [ACTIVE], final_reports: [{ data: null, error: { message: 'boom' } }],
    } }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: false, error: 'Gagal membaca daftar laporan: boom' });
  });
});

describe('bulkFinalizeAccepted — finalisasi & skor', () => {
  it('finalisasi laporan tanpa drift: tulis final_score = finalScoreOf(KPI, 360), status finalized, finalized_by = HRD', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute([90], 70),                       // (90 + 70) / 2 = 80
      { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 1, skipped: [], failed: [] });
    const u = updates(c);
    expect(u).toHaveLength(1);
    expect(u[0].payload).toEqual({ final_score: 80, status: 'finalized', finalized_by: UID });
    expect(u[0].filters).toEqual([['eq', 'id', 'r1'], ['eq', 'status', 'in_review']]);
  });

  it('potongan telat diterapkan SEKALI untuk seluruh periode (tanpa daftar id), bukan per pegawai', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }, { id: E2, name: 'Budi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }, { id: 'r2', employee_id: E2, final_score: 80 }] }] },
      compute([90], 70), { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
      compute([90], 70), { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 2, skipped: [], failed: [] });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith('p1');
  });

  it('rerata KPI presisi penuh, Skor Akhir dibulatkan 2 desimal (KPI 90 & 91, 360 70.333 → 80.42)', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80.42 }] }] },
      { period_months: [{ data: [{ ym: '2026-07' }, { ym: '2026-08' }] }], kpi_scores: [{ data: [{ score: 90 }, { score: 91 }] }], result_360: [{ data: { score: 70.333 } }] },
      { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r.ok && r.finalized).toBe(1);
    expect((updates(c)[0].payload as { final_score: number }).final_score).toBe(80.42);
  });

  it('periode tanpa 360° → Skor Akhir = KPI saja (360 tersimpan diabaikan) & potongan telat tak dipanggil', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE_NO360] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 90 }] }] },
      compute([90], 70),
      { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 1, skipped: [], failed: [] });
    expect((updates(c)[0].payload as { final_score: number }).final_score).toBe(90);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('subjek tanpa KPI (mis. Direksi) → Skor Akhir = 360° saja', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Dir' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 77 }] }] },
      compute(null, 77),
      { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 1, skipped: [], failed: [] });
    // Tanpa bulan periode → kpi_scores TIDAK di-query.
    expect(c.calls.some((x) => x.table === 'kpi_scores')).toBe(false);
  });

  it('DRIFT (skor kini ≠ skor saat ACC, beda ≥ 0.01) → dilewati dgn alasan, TIDAK ditulis', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 75 }] }] },
      compute([90], 70),
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 0, skipped: [
      { name: 'Andi', reason: 'Skor Akhir berubah sejak di-ACC (75.00 → 80.00) — rilis ulang ke SPV untuk ACC baru' },
    ], failed: [] });
    expect(updates(c)).toHaveLength(0);
  });

  it('selisih < 0.01 setelah pembulatan (80.004 vs 80) BUKAN drift → difinalisasi, skor ditulis ulang 80', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80.004 }] }] },
      compute([90], 70),
      { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r.ok && r.finalized).toBe(1);
    expect((updates(c)[0].payload as { final_score: number }).final_score).toBe(80);
  });

  it('final_score tersimpan null → tanpa cek drift, langsung difinalisasi', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: null }] }] },
      compute([90], 70),
      { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 1, skipped: [], failed: [] });
  });

  it('KPI & 360° kosong → dilewati "Skor Akhir belum bisa dihitung"', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute(null, null),
    ) }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 0, skipped: [{ name: 'Andi', reason: 'Skor Akhir belum bisa dihitung (KPI & 360° kosong)' }], failed: [] });
  });

  it('gagal baca KPI → dilewati dgn pesan error (tidak jatuh ke "360° saja")', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      { period_months: [{ data: [{ ym: '2026-07' }] }], kpi_scores: [{ data: null, error: { message: 'timeout' } }] },
    ) });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 0, skipped: [{ name: 'Andi', reason: 'Gagal membaca KPI: timeout' }], failed: [] });
    expect(updates(c)).toHaveLength(0);
  });

  it('error saat update → masuk daftar GAGAL dgn pesan DB; nama tak ditemukan → label = employee_id', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute([90], 70),
      { final_reports: [{ error: { message: 'RLS menolak' } }] },
    ) }));
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: true, finalized: 0, skipped: [], failed: [{ name: E1, reason: 'Gagal disimpan: RLS menolak' }] });
  });

  it('gagal menerapkan potongan telat → seluruh aksi dibatalkan sebelum menulis apa pun', async () => {
    mockRefresh.mockRejectedValueOnce(new Error('db down'));
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }], periods: [ACTIVE],
      final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }],
    } });
    use(c);
    const r = await bulkFinalizeAccepted();
    expect(r).toEqual({ ok: false, error: 'Gagal menerapkan potongan keterlambatan: db down' });
    expect(updates(c)).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('log aktivitas: satu entri report.bulk_finalize via logHrdAction (bukan service), + revalidate', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }, { id: E2, name: 'Budi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }, { id: 'r2', employee_id: E2, final_score: 60 }] }] },
      compute([90], 70), { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
      compute([90], 70),                       // r2: 80 vs 60 → drift → dilewati
    ) }));
    const r = await bulkFinalizeAccepted();
    expect(r.ok && r.finalized).toBe(1);
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'report.bulk_finalize', category: 'laporan',
      summary: 'Finalisasi massal 1 laporan ber-ACC (1 dilewati: Budi)',
      meta: {
        finalized: 1, skipped: 1, failed: 0, period_id: 'p1',
        finalized_names: ['Andi'], skipped_list: [{ name: 'Budi', reason: expect.stringContaining('berubah sejak di-ACC') }], failed_list: [],
      },
    });
    expect(vi.mocked(logAuditAsService)).not.toHaveBeenCalled();
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([['/admin/laporan'], ['/laporan']]);
  });

  it('semua dilewati → log TETAP ditulis (finalisasi 0)', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute(null, null),
    ) }));
    await bulkFinalizeAccepted();
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Finalisasi massal 0 laporan ber-ACC (1 dilewati: Andi)' }));
  });

  it('TIDAK memeriksa pengaman backfill (tak memanggil isBackfilledPeriod)', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }, { data: [{ id: E1, name: 'Andi' }] }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute([90], 70), { final_reports: [{ data: [{ id: 'saved' }], error: null }] },
    ) }));
    const r = await bulkFinalizeAccepted();
    expect(r.ok && r.finalized).toBe(1);
    expect(vi.mocked(isBackfilledPeriod)).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledWith('p1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('resyncDriftedFinals — otorisasi', () => {
  it('tolak bila sesi berakhir', async () => {
    use(makeClient({ user: null }));
    expect(await resyncDriftedFinals()).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
  });

  it('tolak non-HRD', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv' } }] } }));
    expect(await resyncDriftedFinals()).toEqual({ ok: false, error: 'Hanya HRD (Mode Admin) yang dapat finalisasi ulang massal' });
  });

  it('tolak HRD di Mode-SPV', async () => {
    setMode('spv');
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }] } }));
    const r = await resyncDriftedFinals();
    expect(r.ok).toBe(false);
  });

  it('tolak pemegang grant Review Finalisasi (tanpa membaca page_grants)', async () => {
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: { role: 'employee', is_hrd_admin: false } }],
    } });
    use(c);
    const r = await resyncDriftedFinals();
    expect(r.ok).toBe(false);
    expect(c.calls.map((x) => x.table)).toEqual(['employees']);
  });

  it('tolak bila tak ada periode aktif', async () => {
    use(makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }], periods: [{ data: null }] } }));
    expect(await resyncDriftedFinals()).toEqual({ ok: false, error: 'Tidak ada periode aktif' });
  });
});

describe('resyncDriftedFinals — deteksi drift & penulisan', () => {
  it("hanya laporan periode aktif berstatus 'finalized' (tanpa syarat spv_acc)", async () => {
    const c = makeClient({ user: { id: UID }, tables: { employees: [{ data: HRD }], periods: [ACTIVE], final_reports: [{ data: [] }] } });
    use(c);
    const r = await resyncDriftedFinals();
    expect(r).toEqual({ ok: true, resynced: 0, skipped: 0 });
    expect(c.calls.find((x) => x.table === 'final_reports')?.filters).toEqual([['eq', 'period_id', 'p1'], ['eq', 'status', 'finalized']]);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
    // Berbeda dari bulkFinalizeAccepted: revalidate TETAP dipanggil walau daftar kosong.
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([['/admin/laporan'], ['/laporan']]);
  });

  it('tanpa drift → tak ditulis, tak dihitung dilewati, tak ada log (tapi potongan telat tetap diterapkan)', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute([90], 70),
    ) });
    use(c);
    const r = await resyncDriftedFinals();
    expect(r).toEqual({ ok: true, resynced: 0, skipped: 0 });
    expect(updates(c)).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledWith('p1');
  });

  it('drift → final_score diperbarui ke skor hidup, finalized_by = HRD pelaksana, status TIDAK disentuh', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 75 }] }] },
      compute([90], 70),
      { final_reports: [{ error: null }] },
    ) });
    use(c);
    const r = await resyncDriftedFinals();
    expect(r).toEqual({ ok: true, resynced: 1, skipped: 0 });
    const u = updates(c);
    expect(u).toHaveLength(1);
    expect(u[0].payload).toEqual({ final_score: 80, finalized_by: UID });
    expect(u[0].filters).toEqual([['eq', 'id', 'r1']]);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'report.resync_drift', category: 'laporan',
      summary: 'Finalisasi ulang 1 laporan yang skornya berubah',
      meta: { resynced: 1, skipped: 0, period_id: 'p1' },
    });
  });

  it('final_score tersimpan null → dianggap berubah & ditulis', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: null }] }] },
      compute([90], 70),
      { final_reports: [{ error: null }] },
    ) });
    use(c);
    expect(await resyncDriftedFinals()).toEqual({ ok: true, resynced: 1, skipped: 0 });
  });

  it('selisih < 0.01 (80.004 vs 80) → bukan drift, tak ditulis', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80.004 }] }] },
      compute([90], 70),
    ) });
    use(c);
    expect(await resyncDriftedFinals()).toEqual({ ok: true, resynced: 0, skipped: 0 });
    expect(updates(c)).toHaveLength(0);
  });

  it('skor tak bisa dihitung / gagal baca / gagal tulis → masing-masing skipped++, skor lama tak ditimpa', async () => {
    const E3 = '33333333-3333-3333-3333-333333333333';
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE] },
      { final_reports: [{ data: [
        { id: 'r1', employee_id: E1, final_score: 80 },
        { id: 'r2', employee_id: E2, final_score: 80 },
        { id: 'r3', employee_id: E3, final_score: 60 },
        { id: 'r4', employee_id: E1, final_score: 60 },
      ] }] },
      compute(null, null),                                                                 // r1: null
      { period_months: [{ data: null, error: { message: 'x' } }] },                        // r2: gagal baca
      compute([90], 70), { final_reports: [{ error: { message: 'RLS' } }] },               // r3: gagal tulis
      compute([90], 70), { final_reports: [{ error: null }] },                             // r4: sukses
    ) });
    use(c);
    const r = await resyncDriftedFinals();
    expect(r).toEqual({ ok: true, resynced: 1, skipped: 3 });
    expect(updates(c).map((u) => u.filters)).toEqual([[['eq', 'id', 'r3']], [['eq', 'id', 'r4']]]);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Finalisasi ulang 1 laporan yang skornya berubah (3 dilewati)' }));
  });

  it('hanya dilewati tanpa satu pun resync → TIDAK ada log', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute(null, null),
    ) }));
    expect(await resyncDriftedFinals()).toEqual({ ok: true, resynced: 0, skipped: 1 });
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('periode tanpa 360° → tak menerapkan potongan telat; skor = KPI saja', async () => {
    const c = makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE_NO360] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute([90], 70),
      { final_reports: [{ error: null }] },
    ) });
    use(c);
    expect(await resyncDriftedFinals()).toEqual({ ok: true, resynced: 1, skipped: 0 });
    expect((updates(c)[0].payload as { final_score: number }).final_score).toBe(90);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('gagal menerapkan potongan telat → error, tak ada penulisan', async () => {
    mockRefresh.mockRejectedValueOnce('putus');
    const c = makeClient({ user: { id: UID }, tables: {
      employees: [{ data: HRD }], periods: [ACTIVE],
      final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 70 }] }],
    } });
    use(c);
    expect(await resyncDriftedFinals()).toEqual({ ok: false, error: 'Gagal menerapkan potongan keterlambatan: putus' });
    expect(updates(c)).toHaveLength(0);
  });

  it('TIDAK memeriksa pengaman backfill', async () => {
    use(makeClient({ user: { id: UID }, tables: merge(
      { employees: [{ data: HRD }], periods: [ACTIVE] },
      { final_reports: [{ data: [{ id: 'r1', employee_id: E1, final_score: 80 }] }] },
      compute([90], 70),
    ) }));
    await resyncDriftedFinals();
    expect(vi.mocked(isBackfilledPeriod)).not.toHaveBeenCalled();
  });
});
