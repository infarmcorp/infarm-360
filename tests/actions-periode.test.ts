/**
 * Uji KARAKTERISASI Server Action Kelola Siklus Periode (app/(app)/admin/periode/actions.ts).
 * Mengunci perilaku SAAT INI (bukan perilaku ideal): activatePeriod, endPeriod, toggleHas360,
 * toggleFormOpen, deletePeriod.
 *
 * Mock lokal (bukan tests/helpers/mock-supabase.ts) karena action ini memakai `.neq()` dan
 * `.delete().in().select()` — antrean respons per tabel (FIFO), sama seperti helper bersama.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 0) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logHrdAction } from '@/lib/audit/log';
import {
  activatePeriod, endPeriod, toggleHas360, toggleFormOpen, deletePeriod,
} from '@/app/(app)/admin/periode/actions';

// ── Mock Supabase lokal ─────────────────────────────────────────────────────────────────────────
type QResult = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; op: 'select' | 'update' | 'insert' | 'delete'; payload?: unknown; filters: unknown[] };
type Client = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: null }> };
  from: (table: string) => Builder;
  calls: Call[];
};
type Builder = {
  select: (...a: unknown[]) => Builder;
  update: (p: unknown) => Builder;
  insert: (p: unknown) => Builder;
  delete: () => Builder;
  eq: (c: string, v: unknown) => Builder;
  neq: (c: string, v: unknown) => Builder;
  in: (c: string, v: unknown[]) => Builder;
  limit: (n: number) => Builder;
  maybeSingle: () => Promise<QResult>;
  single: () => Promise<QResult>;
  then: (f?: ((v: QResult) => unknown) | null, r?: ((e: unknown) => unknown) | null) => Promise<unknown>;
};

function mk(cfg: { user?: { id: string } | null; tables?: Record<string, QResult[]> }): Client {
  const queues: Record<string, QResult[]> = {};
  for (const [k, v] of Object.entries(cfg.tables ?? {})) queues[k] = [...v];
  const calls: Call[] = [];
  function from(table: string): Builder {
    const st: Call = { table, op: 'select', filters: [] };
    const settle = (): QResult => {
      calls.push({ ...st, filters: [...st.filters] });
      const q = queues[table];
      if (!q || q.length === 0) throw new Error(`mock: tak ada respons terantre untuk "${table}"`);
      return q.shift() as QResult;
    };
    const b: Builder = {
      // select setelah update/delete (mis. `.delete().in().select('id')`) tak mengubah op.
      select: () => b,
      update: (p) => { st.op = 'update'; st.payload = p; return b; },
      insert: (p) => { st.op = 'insert'; st.payload = p; return b; },
      delete: () => { st.op = 'delete'; return b; },
      eq: (c, v) => { st.filters.push(['eq', c, v]); return b; },
      neq: (c, v) => { st.filters.push(['neq', c, v]); return b; },
      in: (c, v) => { st.filters.push(['in', c, v]); return b; },
      limit: () => b,
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      then: (f, r) => Promise.resolve(settle()).then(f ?? undefined, r ?? undefined),
    };
    return b;
  }
  return { auth: { getUser: async () => ({ data: { user: cfg.user ?? null }, error: null }) }, from, calls };
}

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const mockLog = vi.mocked(logHrdAction);
const mockReval = vi.mocked(revalidatePath);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function use(c: Client) { mockCreate.mockResolvedValue(c as any); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useAdmin(c: Client) { mockAdmin.mockReturnValue(c as any); }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PID = '22222222-2222-2222-2222-222222222222';
const HRD = { data: { role: 'hrd', is_hrd_admin: false, hrd_sections: null } };
const LABEL = { data: { label: 'Q3 2026' } };

/** Klien HRD penuh + antrean tambahan per tabel. */
function hrd(tables: Record<string, QResult[]> = {}): Client {
  const { employees = [], ...rest } = tables;
  return mk({ user: { id: UID }, tables: { employees: [HRD, ...employees], ...rest } });
}
const opsOn = (c: Client, table: string) => c.calls.filter((x) => x.table === table);

beforeEach(() => { vi.clearAllMocks(); });

// ── Otorisasi bersama (requireHrd) ─────────────────────────────────────────────────────────────
type Act = { name: string; run: () => Promise<{ ok: boolean; error?: string }> };
const ACTIONS: Act[] = [
  { name: 'activatePeriod', run: () => activatePeriod(PID) },
  { name: 'endPeriod', run: () => endPeriod(PID) },
  { name: 'toggleHas360', run: () => toggleHas360(PID, true) },
  { name: 'toggleFormOpen', run: () => toggleFormOpen(PID, true) },
  { name: 'deletePeriod', run: () => deletePeriod(PID, 'HAPUS') },
];

describe.each(ACTIONS)('$name — gerbang otorisasi', ({ run }) => {
  it('tanpa sesi → "Sesi berakhir", tak menulis apa pun', async () => {
    const c = mk({ user: null });
    use(c);
    const r = await run();
    expect(r).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
    expect(c.calls).toHaveLength(0);
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockReval).not.toHaveBeenCalled();
  });

  it('pegawai non-HRD ditolak', async () => {
    const c = mk({ user: { id: UID }, tables: { employees: [{ data: { role: 'spv', is_hrd_admin: false, hrd_sections: null } }] } });
    use(c);
    const r = await run();
    expect(r).toEqual({ ok: false, error: 'Hanya HRD yang dapat mengelola periode' });
    expect(c.calls.map((x) => x.table)).toEqual(['employees']);
    expect(mockAdmin).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('baris pegawai tak ditemukan → ditolak', async () => {
    use(mk({ user: { id: UID }, tables: { employees: [{ data: null }] } }));
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Hanya HRD/);
  });

  it('HRD dengan hrd_sections tanpa "periode" ditolak', async () => {
    const c = mk({ user: { id: UID }, tables: { employees: [{ data: { role: 'hrd', is_hrd_admin: false, hrd_sections: ['pegawai', 'bobot'] } }] } });
    use(c);
    const r = await run();
    expect(r).toEqual({ ok: false, error: 'Hanya HRD yang dapat mengelola periode' });
    expect(c.calls).toHaveLength(1);
  });

  it('pemegang izin is_hrd_admin (posisi non-HRD) dengan bagian "periode" lolos gerbang', async () => {
    // Gerbang lolos → query berikutnya menghabiskan antrean kosong → mock melempar (bukti lolos).
    use(mk({ user: { id: UID }, tables: { employees: [{ data: { role: 'employee', is_hrd_admin: true, hrd_sections: ['periode'] } }] } }));
    mockAdmin.mockReturnValue(mk({}) as never);
    await expect(run()).rejects.toThrow(/mock: tak ada respons/);
  });
});

// ── activatePeriod ─────────────────────────────────────────────────────────────────────────────
describe('activatePeriod — jadikan satu periode aktif', () => {
  it('jalur sukses: akhiri semua periode lain (neq id), lalu aktifkan target, catat audit, revalidate', async () => {
    const c = hrd({ periods: [{ error: null }, { error: null }, LABEL] });
    use(c);
    const r = await activatePeriod(PID);
    expect(r).toEqual({ ok: true });

    const p = opsOn(c, 'periods');
    expect(p[0]).toMatchObject({ op: 'update', payload: { status: 'ended' }, filters: [['neq', 'id', PID]] });
    expect(p[1]).toMatchObject({ op: 'update', payload: { status: 'active' }, filters: [['eq', 'id', PID]] });
    expect(p[2]).toMatchObject({ op: 'select', filters: [['eq', 'id', PID]] });
    expect(p).toHaveLength(3);

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'period.activate', category: 'periode',
      summary: 'Mengaktifkan periode "Q3 2026" (periode lain diakhiri)',
      targetType: 'period', targetId: PID, targetLabel: 'Q3 2026',
    });
    expect(mockReval.mock.calls).toEqual([['/admin/periode']]);
  });

  it('tak memakai service_role (RLS HRD cukup)', async () => {
    use(hrd({ periods: [{ error: null }, { error: null }, LABEL] }));
    await activatePeriod(PID);
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('periode terkunci (ended) BOLEH dibuka kembali — tak ada pengecekan status sebelumnya', async () => {
    const c = hrd({ periods: [{ error: null }, { error: null }, LABEL] });
    use(c);
    const r = await activatePeriod(PID);
    expect(r.ok).toBe(true);
    // Tak ada query baca status/laporan final sebelum update.
    expect(opsOn(c, 'periods')[0].op).toBe('update');
    expect(c.calls.some((x) => x.table === 'final_reports')).toBe(false);
  });

  it('label tak ditemukan → audit memakai id sebagai fallback, targetLabel null', async () => {
    use(hrd({ periods: [{ error: null }, { error: null }, { data: null }] }));
    const r = await activatePeriod(PID);
    expect(r.ok).toBe(true);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      summary: `Mengaktifkan periode "${PID}" (periode lain diakhiri)`, targetLabel: null,
    }));
  });

  it('gagal mengakhiri periode lain → berhenti, target tak diaktifkan, tanpa audit', async () => {
    const c = hrd({ periods: [{ error: { message: 'rls' } }] });
    use(c);
    const r = await activatePeriod(PID);
    expect(r).toEqual({ ok: false, error: 'Gagal: rls' });
    expect(opsOn(c, 'periods')).toHaveLength(1);
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockReval).not.toHaveBeenCalled();
  });

  it('gagal mengaktifkan target SETELAH periode lain diakhiri → error, update pertama tak di-rollback', async () => {
    const c = hrd({ periods: [{ error: null }, { error: { message: 'boom' } }] });
    use(c);
    const r = await activatePeriod(PID);
    expect(r).toEqual({ ok: false, error: 'Gagal: boom' });
    // Karakterisasi: tak ada langkah kompensasi — semua periode tetap "ended".
    expect(opsOn(c, 'periods').map((x) => x.payload)).toEqual([{ status: 'ended' }, { status: 'active' }]);
    expect(mockLog).not.toHaveBeenCalled();
  });
});

// ── endPeriod ──────────────────────────────────────────────────────────────────────────────────
describe('endPeriod — Kunci & Akhiri', () => {
  it('jalur sukses: status → ended untuk id itu saja, audit period.lock, revalidate', async () => {
    const c = hrd({ periods: [{ error: null }, LABEL] });
    use(c);
    const r = await endPeriod(PID);
    expect(r).toEqual({ ok: true });
    const p = opsOn(c, 'periods');
    expect(p[0]).toMatchObject({ op: 'update', payload: { status: 'ended' }, filters: [['eq', 'id', PID]] });
    expect(p).toHaveLength(2);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'period.lock', category: 'periode',
      summary: 'Mengunci & mengakhiri periode "Q3 2026"',
      targetType: 'period', targetId: PID, targetLabel: 'Q3 2026',
    });
    expect(mockReval.mock.calls).toEqual([['/admin/periode']]);
  });

  it('tak memeriksa status sebelumnya (mengunci periode yang sudah ended tetap ok)', async () => {
    const c = hrd({ periods: [{ error: null }, LABEL] });
    use(c);
    expect((await endPeriod(PID)).ok).toBe(true);
    expect(opsOn(c, 'periods')[0].op).toBe('update');
  });

  it('error DB → "Gagal mengunci", tanpa audit/revalidate', async () => {
    use(hrd({ periods: [{ error: { message: 'x' } }] }));
    const r = await endPeriod(PID);
    expect(r).toEqual({ ok: false, error: 'Gagal mengunci: x' });
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockReval).not.toHaveBeenCalled();
  });
});

// ── toggleHas360 ───────────────────────────────────────────────────────────────────────────────
describe('toggleHas360 — aktif/nonaktif komponen 360°', () => {
  it('menonaktifkan (false): tanpa validasi pra-peluncuran, update has_360=false', async () => {
    const c = hrd({ periods: [{ error: null }, LABEL] });
    use(c);
    const r = await toggleHas360(PID, false);
    expect(r).toEqual({ ok: true });
    expect(c.calls.map((x) => x.table)).toEqual(['employees', 'periods', 'periods']);
    expect(opsOn(c, 'periods')[0]).toMatchObject({ op: 'update', payload: { has_360: false }, filters: [['eq', 'id', PID]] });
    expect(mockLog).toHaveBeenCalledWith({
      action: 'period.toggle360', category: 'periode',
      summary: 'Menonaktifkan komponen 360° pada periode "Q3 2026"',
      targetType: 'period', targetId: PID, targetLabel: 'Q3 2026', meta: { has_360: false },
    });
    expect(mockReval.mock.calls).toEqual([['/admin/periode'], ['/admin/dashboard']]);
  });

  it('mengaktifkan (true) dengan indikator aktif & pemetaan → update has_360=true', async () => {
    const c = hrd({
      culture_aspects: [{ data: [{ id: 'asp1' }, { id: 'asp2' }] }],
      indicators: [{ count: 10 }],
      mappings: [{ count: 5 }],
      periods: [{ error: null }, LABEL],
    });
    use(c);
    const r = await toggleHas360(PID, true);
    expect(r).toEqual({ ok: true });
    expect(opsOn(c, 'culture_aspects')[0].filters).toEqual([['eq', 'period_id', PID]]);
    expect(opsOn(c, 'indicators')[0].filters).toEqual([['in', 'aspect_id', ['asp1', 'asp2']], ['eq', 'is_active', true]]);
    expect(opsOn(c, 'mappings')[0].filters).toEqual([['eq', 'period_id', PID], ['eq', 'is_active', true]]);
    expect(opsOn(c, 'periods')[0]).toMatchObject({ op: 'update', payload: { has_360: true } });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      summary: 'Mengaktifkan komponen 360° pada periode "Q3 2026"', meta: { has_360: true },
    }));
  });

  it('mengaktifkan tanpa aspek → indikator tak di-query (hitungan 0) → ditolak bersama pemetaan kosong', async () => {
    const c = hrd({ culture_aspects: [{ data: [] }], mappings: [{ count: 0 }] });
    use(c);
    const r = await toggleHas360(PID, true);
    expect(r).toEqual({
      ok: false,
      error: 'Tidak bisa mengaktifkan 360°: belum ada pertanyaan (indikator aktif) & pemetaan penilai→target. Lengkapi dulu di Kelola Pertanyaan / Pemetaan.',
    });
    expect(c.calls.some((x) => x.table === 'indicators')).toBe(false);
    expect(opsOn(c, 'periods')).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('mengaktifkan dengan indikator tapi tanpa pemetaan aktif → ditolak (hanya pemetaan)', async () => {
    use(hrd({ culture_aspects: [{ data: [{ id: 'a' }] }], indicators: [{ count: 3 }], mappings: [{ count: 0 }] }));
    const r = await toggleHas360(PID, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Tidak bisa mengaktifkan 360°: belum ada pemetaan penilai→target. Lengkapi dulu di Kelola Pertanyaan / Pemetaan.');
  });

  it('mengaktifkan dengan pemetaan tapi tanpa indikator aktif → ditolak (hanya pertanyaan)', async () => {
    use(hrd({ culture_aspects: [{ data: [{ id: 'a' }] }], indicators: [{ count: 0 }], mappings: [{ count: 4 }] }));
    const r = await toggleHas360(PID, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Tidak bisa mengaktifkan 360°: belum ada pertanyaan (indikator aktif). Lengkapi dulu di Kelola Pertanyaan / Pemetaan.');
  });

  it('tak memeriksa status periode (ended/terkunci tetap bisa di-toggle)', async () => {
    const c = hrd({ periods: [{ error: null }, LABEL] });
    use(c);
    expect((await toggleHas360(PID, false)).ok).toBe(true);
    // Tak ada select status sebelum update.
    expect(opsOn(c, 'periods')[0].op).toBe('update');
  });

  it('error update → "Gagal: …", tanpa audit', async () => {
    use(hrd({ periods: [{ error: { message: 'nope' } }] }));
    const r = await toggleHas360(PID, false);
    expect(r).toEqual({ ok: false, error: 'Gagal: nope' });
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockReval).not.toHaveBeenCalled();
  });
});

// ── toggleFormOpen ─────────────────────────────────────────────────────────────────────────────
const FULL_GUIDE = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'e' };
const tenInds = (guide: Record<string, string> | null = FULL_GUIDE) =>
  Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, text: `Indikator ${i + 1}`, rating_guide: guide }));

describe('toggleFormOpen — buka/tutup form 360° (BR-06)', () => {
  it('menutup (false): tanpa validasi, update form_open=false, has_360 tak tersentuh', async () => {
    const c = hrd({ periods: [{ error: null }, LABEL] });
    use(c);
    const r = await toggleFormOpen(PID, false);
    expect(r).toEqual({ ok: true });
    const p = opsOn(c, 'periods');
    expect(p[0]).toMatchObject({ op: 'update', payload: { form_open: false }, filters: [['eq', 'id', PID]] });
    expect(p).toHaveLength(2);
    expect(mockLog).toHaveBeenCalledWith({
      action: 'period.toggleForm', category: 'periode',
      summary: 'Menutup form penilaian 360° pada periode "Q3 2026"',
      targetType: 'period', targetId: PID, targetLabel: 'Q3 2026', meta: { form_open: false },
    });
    expect(mockReval.mock.calls).toEqual([['/admin/periode'], ['/penilaian']]);
  });

  it('membuka saat has_360=false → validasi BR-06 dilewati', async () => {
    const c = hrd({ periods: [{ data: { has_360: false } }, { error: null }, LABEL] });
    use(c);
    const r = await toggleFormOpen(PID, true);
    expect(r).toEqual({ ok: true });
    expect(c.calls.some((x) => x.table === 'culture_aspects' || x.table === 'indicators')).toBe(false);
    expect(opsOn(c, 'periods')[1]).toMatchObject({ op: 'update', payload: { form_open: true } });
  });

  it('membuka saat has_360=true dengan tepat 10 indikator ber-BARS lengkap → ok', async () => {
    const c = hrd({
      periods: [{ data: { has_360: true } }, { error: null }, LABEL],
      culture_aspects: [{ data: [{ id: 'asp1' }] }],
      indicators: [{ data: tenInds() }],
    });
    use(c);
    const r = await toggleFormOpen(PID, true);
    expect(r).toEqual({ ok: true });
    expect(opsOn(c, 'indicators')[0].filters).toEqual([['in', 'aspect_id', ['asp1']], ['eq', 'is_active', true]]);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      summary: 'Membuka form penilaian 360° pada periode "Q3 2026"', meta: { form_open: true },
    }));
  });

  it('jumlah indikator ≠ 10 → ditolak tanpa update', async () => {
    const c = hrd({
      periods: [{ data: { has_360: true } }],
      culture_aspects: [{ data: [{ id: 'asp1' }] }],
      indicators: [{ data: tenInds().slice(0, 9) }],
    });
    use(c);
    const r = await toggleFormOpen(PID, true);
    expect(r).toEqual({ ok: false, error: 'Jumlah indikator aktif harus tepat 10 (saat ini 9). Sesuaikan di Kelola Pertanyaan sebelum membuka form (BR-06).' });
    expect(opsOn(c, 'periods').filter((x) => x.op === 'update')).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('tanpa aspek → indikator tak di-query, dianggap 0 → ditolak', async () => {
    const c = hrd({ periods: [{ data: { has_360: true } }], culture_aspects: [{ data: [] }] });
    use(c);
    const r = await toggleFormOpen(PID, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/saat ini 0/);
    expect(c.calls.some((x) => x.table === 'indicators')).toBe(false);
  });

  it('BARS tak lengkap → ditolak, maksimal 3 nama + "…"', async () => {
    const inds = tenInds();
    inds[0] = { ...inds[0], rating_guide: null as unknown as Record<string, string> };
    inds[1] = { ...inds[1], rating_guide: { ...FULL_GUIDE, '5': '   ' } };
    inds[2] = { ...inds[2], rating_guide: { '1': 'a', '2': 'b', '3': 'c', '4': 'd' } };
    inds[3] = { ...inds[3], rating_guide: {} };
    use(hrd({ periods: [{ data: { has_360: true } }], culture_aspects: [{ data: [{ id: 'a' }] }], indicators: [{ data: inds }] }));
    const r = await toggleFormOpen(PID, true);
    expect(r).toEqual({
      ok: false,
      error: '4 indikator belum punya panduan perilaku (BARS) lengkap untuk level 1–5: Indikator 1, Indikator 2, Indikator 3, …. Lengkapi di Kelola Pertanyaan sebelum membuka form.',
    });
  });

  it('BARS tak lengkap pada ≤ 3 indikator → tanpa "…"', async () => {
    const inds = tenInds();
    inds[4] = { ...inds[4], rating_guide: { ...FULL_GUIDE, '3': '' } };
    use(hrd({ periods: [{ data: { has_360: true } }], culture_aspects: [{ data: [{ id: 'a' }] }], indicators: [{ data: inds }] }));
    const r = await toggleFormOpen(PID, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('1 indikator belum punya panduan perilaku (BARS) lengkap untuk level 1–5: Indikator 5. Lengkapi di Kelola Pertanyaan sebelum membuka form.');
  });

  it('periode tak ditemukan (has_360 null) → validasi dilewati, update tetap dijalankan', async () => {
    const c = hrd({ periods: [{ data: null }, { error: null }, { data: null }] });
    use(c);
    const r = await toggleFormOpen(PID, true);
    expect(r).toEqual({ ok: true });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ targetLabel: null }));
  });

  it('tak memeriksa status periode (form bisa dibuka pada periode ended)', async () => {
    const c = hrd({ periods: [{ data: { has_360: false } }, { error: null }, LABEL] });
    use(c);
    expect((await toggleFormOpen(PID, true)).ok).toBe(true);
  });

  it('error update → "Gagal: …"', async () => {
    use(hrd({ periods: [{ error: { message: 'e' } }] }));
    expect(await toggleFormOpen(PID, false)).toEqual({ ok: false, error: 'Gagal: e' });
    expect(mockLog).not.toHaveBeenCalled();
  });
});

// ── deletePeriod ───────────────────────────────────────────────────────────────────────────────
describe('deletePeriod — hapus periode beserta datanya', () => {
  it('konfirmasi salah → ditolak SETELAH otorisasi, service_role tak dibuat', async () => {
    const c = hrd();
    use(c);
    const r = await deletePeriod(PID, 'hapus dong');
    expect(r).toEqual({ ok: false, error: 'Ketik HAPUS untuk konfirmasi.' });
    expect(c.calls.map((x) => x.table)).toEqual(['employees']);
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('konfirmasi tanpa sesi → pesan sesi (otorisasi didahulukan)', async () => {
    use(mk({ user: null }));
    expect(await deletePeriod(PID, 'salah')).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
  });

  it('konfirmasi dinormalisasi: "  hapus " (huruf kecil + spasi) diterima', async () => {
    use(hrd());
    const admin = mk({ tables: { periods: [{ data: null }] } });
    useAdmin(admin);
    const r = await deletePeriod(PID, '  hapus ');
    expect(r).toEqual({ ok: false, error: 'Periode tidak ditemukan' });
    expect(mockAdmin).toHaveBeenCalledTimes(1);
  });

  it('periode tak ditemukan → ditolak', async () => {
    use(hrd());
    useAdmin(mk({ tables: { periods: [{ data: null }] } }));
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: false, error: 'Periode tidak ditemukan' });
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('periode AKTIF ditolak tanpa menghapus apa pun', async () => {
    use(hrd());
    const admin = mk({ tables: { periods: [{ data: { label: 'Q3 2026', status: 'active' } }] } });
    useAdmin(admin);
    const r = await deletePeriod(PID, 'HAPUS');
    expect(r).toEqual({ ok: false, error: 'Periode aktif tidak bisa dihapus. "Kunci & Akhiri" dulu.' });
    expect(admin.calls.filter((x) => x.op === 'delete')).toHaveLength(0);
  });

  it('jalur sukses: KPI & audit KPI dihapus hanya untuk bulan UNIK, lalu baris periods, audit + revalidate', async () => {
    use(hrd());
    const admin = mk({
      tables: {
        periods: [{ data: { label: 'Q2 2026', status: 'ended' } }, { error: null }],
        period_months: [
          { data: [{ ym: '2026-04' }, { ym: '2026-05' }, { ym: '2026-06' }] },
          { data: [{ ym: '2026-06' }] }, // dipakai periode lain → tak dihapus
        ],
        kpi_audit: [{ data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null }],
        kpi_scores: [{ data: [{ employee_id: 'e1' }, { employee_id: 'e2' }], error: null }],
      },
    });
    useAdmin(admin);
    const r = await deletePeriod(PID, 'HAPUS');
    expect(r).toEqual({ ok: true });

    // Urutan operasi service_role.
    expect(admin.calls.map((x) => `${x.op}:${x.table}`)).toEqual([
      'select:periods', 'select:period_months', 'select:period_months',
      'delete:kpi_audit', 'delete:kpi_scores', 'delete:periods',
    ]);
    const pm = opsOn(admin, 'period_months');
    expect(pm[0].filters).toEqual([['eq', 'period_id', PID]]);
    expect(pm[1].filters).toEqual([['neq', 'period_id', PID], ['in', 'ym', ['2026-04', '2026-05', '2026-06']]]);
    expect(opsOn(admin, 'kpi_audit')[0].filters).toEqual([['in', 'ym', ['2026-04', '2026-05']]]);
    expect(opsOn(admin, 'kpi_scores')[0].filters).toEqual([['in', 'ym', ['2026-04', '2026-05']]]);
    expect(opsOn(admin, 'periods')[1].filters).toEqual([['eq', 'id', PID]]);

    expect(mockLog).toHaveBeenCalledWith({
      action: 'period.delete', category: 'periode',
      summary: 'Menghapus periode "Q2 2026" beserta seluruh datanya (2 nilai KPI, 3 jejak audit KPI, bulan 2026-04, 2026-05)',
      targetType: 'period', targetId: PID, targetLabel: 'Q2 2026',
      meta: { kpi_deleted: 2, kpi_audit_deleted: 3, months: ['2026-04', '2026-05'] },
    });
    expect(mockReval.mock.calls).toEqual([['/admin/periode'], ['/admin/dashboard']]);
  });

  it('tak ada guard "data sudah ada": periode ended berisi penilaian/laporan final tetap dihapus (cascade DB)', async () => {
    use(hrd());
    const admin = mk({
      tables: {
        periods: [{ data: { label: 'Q1 2026', status: 'ended' } }, { error: null }],
        period_months: [{ data: [] }],
      },
    });
    useAdmin(admin);
    const r = await deletePeriod(PID, 'HAPUS');
    expect(r).toEqual({ ok: true });
    // Tak ada query hitung assessments/final_reports sebelum menghapus.
    expect(admin.calls.some((x) => ['assessments', 'final_reports', 'mappings'].includes(x.table))).toBe(false);
  });

  it('tanpa bulan (period_months kosong) → KPI tak disentuh, summary "bulan —"', async () => {
    use(hrd());
    const admin = mk({
      tables: { periods: [{ data: { label: 'X', status: 'ended' } }, { error: null }], period_months: [{ data: [] }] },
    });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: true });
    expect(admin.calls.map((x) => `${x.op}:${x.table}`)).toEqual(['select:periods', 'select:period_months', 'delete:periods']);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      summary: 'Menghapus periode "X" beserta seluruh datanya (0 nilai KPI, 0 jejak audit KPI, bulan —)',
      meta: { kpi_deleted: 0, kpi_audit_deleted: 0, months: [] },
    }));
  });

  it('semua bulan dipakai bersama → tak ada bulan unik, KPI tak dihapus', async () => {
    use(hrd());
    const admin = mk({
      tables: {
        periods: [{ data: { label: 'X', status: 'ended' } }, { error: null }],
        period_months: [{ data: [{ ym: '2026-04' }] }, { data: [{ ym: '2026-04' }] }],
      },
    });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: true });
    expect(admin.calls.some((x) => x.table === 'kpi_scores' || x.table === 'kpi_audit')).toBe(false);
  });

  it('gagal hapus audit KPI → berhenti sebelum KPI & periode', async () => {
    use(hrd());
    const admin = mk({
      tables: {
        periods: [{ data: { label: 'X', status: 'ended' } }],
        period_months: [{ data: [{ ym: '2026-04' }] }, { data: [] }],
        kpi_audit: [{ data: null, error: { message: 'a-err' } }],
      },
    });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: false, error: 'Gagal menghapus jejak audit KPI periode: a-err' });
    expect(admin.calls.some((x) => x.table === 'kpi_scores')).toBe(false);
    expect(admin.calls.filter((x) => x.table === 'periods' && x.op === 'delete')).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('gagal hapus KPI → berhenti; audit KPI yang sudah terhapus tidak dipulihkan', async () => {
    use(hrd());
    const admin = mk({
      tables: {
        periods: [{ data: { label: 'X', status: 'ended' } }],
        period_months: [{ data: [{ ym: '2026-04' }] }, { data: [] }],
        kpi_audit: [{ data: [{ id: 1 }], error: null }],
        kpi_scores: [{ data: null, error: { message: 'k-err' } }],
      },
    });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: false, error: 'Gagal menghapus KPI periode: k-err' });
    expect(admin.calls.filter((x) => x.table === 'periods' && x.op === 'delete')).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('gagal hapus baris periods SETELAH KPI terhapus → error, tanpa audit (KPI sudah hilang)', async () => {
    use(hrd());
    const admin = mk({
      tables: {
        periods: [{ data: { label: 'X', status: 'ended' } }, { error: { message: 'fk' } }],
        period_months: [{ data: [{ ym: '2026-04' }] }, { data: [] }],
        kpi_audit: [{ data: [], error: null }],
        kpi_scores: [{ data: [{ employee_id: 'e1' }], error: null }],
      },
    });
    useAdmin(admin);
    expect(await deletePeriod(PID, 'HAPUS')).toEqual({ ok: false, error: 'Gagal menghapus periode: fk' });
    expect(admin.calls.filter((x) => x.op === 'delete').map((x) => x.table)).toEqual(['kpi_audit', 'kpi_scores', 'periods']);
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockReval).not.toHaveBeenCalled();
  });
});
