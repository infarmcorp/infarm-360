import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Uji KARAKTERISASI `computeResult360` (app/(app)/admin/360/actions.ts) — mengunci perilaku
 * saat ini: gerbang otorisasi (canSection laporan|bobot|pemetaan), pengaman backfill (Q1 2026),
 * hanya penilaian `submitted` yang dihitung, pemilihan bobot `schemeFor` (bobot khusus pegawai,
 * bobot otomatis 2 kelas BR-10 untuk periode ≥ 2026-07-01), Self dikecualikan, baris result_360
 * (score_raw = rumus murni, score = setelah potongan keterlambatan), dan pembersihan skor yatim.
 * Angka harapan dihitung manual dari rumus lib/score360.ts (rerata rating ×20, lalu dibobot).
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { computeResult360 } from '@/app/(app)/admin/360/actions';
import { BACKFILL_LOCK_MSG } from '@/lib/backfill-guard';

// ── Mock Supabase IN-MEMORY lokal (khusus file ini) ─────────────────────────────────────────
// Helper bersama (tests/helpers/mock-supabase.ts) berbasis antrean FIFO & tak mendukung .range()/
// count/upsert-merge. Di sini query DIEVALUASI terhadap baris fixture (filter eq/neq/in diterapkan,
// .range() memotong, upsert menggabung per onConflict) agar filter di kode ikut teruji, bukan
// dilewati. Satu `MemDb` dipakai bersama client sesi & service_role (efek tulis terlihat).
type Row = Record<string, unknown>;
type Filter = ['eq' | 'neq', string, unknown] | ['in', string, unknown[]];
type Call = { table: string; op: 'select' | 'update' | 'insert' | 'upsert' | 'delete'; cols?: string; payload?: unknown; filters: Filter[]; onConflict?: string };
type Res = { data: unknown; error: { message: string } | null; count?: number | null };
type MemDb = { tables: Record<string, Row[]>; calls: Call[]; fail: (c: Call) => string | null };

function memDb(tables: Record<string, Row[]>, fail: (c: Call) => string | null = () => null): MemDb {
  const copy: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(tables)) copy[k] = v.map((r) => ({ ...r }));
  return { tables: copy, calls: [], fail };
}

function memClient(db: MemDb, user: { id: string } | null = null) {
  function from(table: string) {
    const st: Call = { table, op: 'select', filters: [] };
    let head = false, wantCount = false, single = false;
    let range: [number, number] | null = null, lim: number | null = null;
    const match = (r: Row) => st.filters.every((f) => {
      if (f[0] === 'eq') return r[f[1]] === f[2];
      if (f[0] === 'neq') return r[f[1]] !== f[2];
      return (f[2] as unknown[]).includes(r[f[1]]);
    });
    const run = (): Res => {
      db.calls.push({ ...st, filters: [...st.filters] });
      const msg = db.fail(st);
      if (msg) return { data: null, error: { message: msg } };
      const rows = (db.tables[table] ??= []);
      if (st.op === 'select') {
        let out = rows.filter(match);
        if (head) return { data: null, error: null, count: out.length };
        if (range) out = out.slice(range[0], range[1] + 1);
        if (lim != null) out = out.slice(0, lim);
        if (single) return { data: out[0] ? { ...out[0] } : null, error: null };
        return { data: out.map((r) => ({ ...r })), error: null, count: wantCount ? out.length : null };
      }
      if (st.op === 'update') {
        rows.filter(match).forEach((r) => Object.assign(r, st.payload as Row));
        return { data: null, error: null };
      }
      if (st.op === 'delete') {
        db.tables[table] = rows.filter((r) => !match(r));
        return { data: null, error: null };
      }
      const list = (Array.isArray(st.payload) ? st.payload : [st.payload]) as Row[];
      const keys = st.op === 'upsert' && st.onConflict ? st.onConflict.split(',') : null;
      for (const p of list) {
        const hit = keys ? rows.find((r) => keys.every((k) => r[k] === p[k])) : undefined;
        if (hit) Object.assign(hit, p); else rows.push({ ...p });
      }
      return { data: null, error: null };
    };
    const b = {
      select(cols?: string, opts?: { count?: string; head?: boolean }) {
        if (st.op === 'select') st.cols = cols;
        head = !!opts?.head; wantCount = !!opts?.count; return b;
      },
      update(p: unknown) { st.op = 'update'; st.payload = p; return b; },
      insert(p: unknown) { st.op = 'insert'; st.payload = p; return b; },
      upsert(p: unknown, o?: { onConflict?: string }) { st.op = 'upsert'; st.payload = p; st.onConflict = o?.onConflict; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(c: string, v: unknown) { st.filters.push(['eq', c, v]); return b; },
      neq(c: string, v: unknown) { st.filters.push(['neq', c, v]); return b; },
      in(c: string, v: unknown[]) { st.filters.push(['in', c, v]); return b; },
      order() { return b; },
      limit(n: number) { lim = n; return b; },
      range(f: number, t: number) { range = [f, t]; return b; },
      maybeSingle() { single = true; return Promise.resolve(run()); },
      single() { single = true; return Promise.resolve(run()); },
      then<A, B>(ok?: ((v: Res) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
        return Promise.resolve(run()).then(ok, ko);
      },
    };
    return b;
  }
  return { auth: { getUser: async () => ({ data: { user }, error: null }) }, from };
}
// ─────────────────────────────────────────────────────────────────────────────────────────────

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const mockLog = vi.mocked(logHrdAction);

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOW = '2026-10-12T03:00:00.000Z';
const DL = '2026-09-30T10:00:00Z'; // deadline penilaian (sudah lewat pada NOW)
const MAP_AT = '2026-07-05T00:00:00Z'; // pemetaan dibuat sebelum deadline

const asmt = (id: string, assessor: string, target: string, status: string): Row =>
  ({ id, period_id: 'p', assessor_id: assessor, target_id: target, status, first_submitted_at: status === 'draft' ? null : '2026-09-20T00:00:00Z', forced_by_hrd: false });
const scoresOf = (id: string, ratings: (number | null)[]): Row[] =>
  ratings.map((rating, i) => ({ assessment_id: id, indicator_id: `i${i + 1}`, rating }));
const map = (assessor: string, target: string, relation: string, mandatory = false): Row =>
  ({ period_id: 'p', assessor_id: assessor, target_id: target, relation, mandatory, is_adhoc: false, is_active: true, created_at: MAP_AT });

/**
 * Fixture satu periode aktif `p`.
 *  T1: Atasan A [5,4,null]→90 · Peer P1 [4,4]→80 · Cross P2 [3,4]→70 · Self [5,5]→100 (dikecualikan)
 *      · draft P3 [1,1] & invalidated P4 [1] (harus diabaikan). T1 juga PENILAI yang belum mengirim
 *      kewajiban Wajib (T1→P1) saat deadline lewat → potongan −3.
 *  T2: bobot KHUSUS 4 kelas (Atasan 50 / Peer 50): Atasan A [4]→80 · Peer P1 [3]→60.
 *      T2 terlambat (draft Wajib T2→A) tetapi HRD menetapkan potongan 0 (pengecualian).
 *  T3: hanya Self → tak ada skor (baris lama T3 jadi yatim & dihapus).
 *  T4: semua rating null → dilewati.
 *  T5: Atasan A2 [5]→100 · U [3]→60 TANPA pemetaan → dianggap Peer.
 *  T9: baris result_360 lama tanpa penilaian → yatim, dihapus.
 */
function fixture(over: { start?: string; scheme?: Row; overrides?: Row[]; waivers?: Row[]; audit?: Row[] } = {}): Record<string, Row[]> {
  return {
    periods: [
      { id: 'p0', label: 'Q2 2026', start_date: '2026-04-01', status: 'locked', assessment_deadline: null },
      { id: 'p', label: 'Q3 2026', start_date: over.start ?? '2026-07-01', status: 'active', assessment_deadline: DL },
    ],
    hrd_audit_log: over.audit ?? [{ action: 'score360.backfill', target_id: 'p0' }],
    weight_schemes: [
      { period_id: 'p0', is_active: true, model: '4class', weights: { atasan: 25, peer: 25, cross: 25, bawahan: 25 } },
      over.scheme ?? { period_id: 'p', is_active: true, model: '2class', weights: { atasan: 70, internal: 30 } },
    ],
    employee_weight_overrides: over.overrides ?? [
      { period_id: 'p', employee_id: 'T2', model: '4class', weights: { atasan: 50, peer: 50, cross: 0, bawahan: 0 } },
    ],
    assessments: [
      asmt('a01', 'A', 'T1', 'submitted'),
      asmt('a02', 'P1', 'T1', 'submitted'),
      asmt('a03', 'P2', 'T1', 'submitted'),
      asmt('a04', 'T1', 'T1', 'submitted'),
      asmt('a05', 'P3', 'T1', 'draft'),
      asmt('a06', 'P4', 'T1', 'invalidated'),
      asmt('a07', 'A', 'T2', 'submitted'),
      asmt('a08', 'P1', 'T2', 'submitted'),
      asmt('a09', 'T3', 'T3', 'submitted'),
      asmt('a10', 'T2', 'A', 'draft'),
      asmt('a11', 'X', 'T4', 'submitted'),
      asmt('a12', 'A2', 'T5', 'submitted'),
      asmt('a13', 'U', 'T5', 'submitted'),
    ],
    assessment_indicator_scores: [
      ...scoresOf('a01', [5, 4, null]),
      ...scoresOf('a02', [4, 4]),
      ...scoresOf('a03', [3, 4]),
      ...scoresOf('a04', [5, 5]),
      ...scoresOf('a05', [1, 1]),
      ...scoresOf('a06', [1]),
      ...scoresOf('a07', [4]),
      ...scoresOf('a08', [3]),
      ...scoresOf('a09', [5]),
      ...scoresOf('a10', [2]),
      ...scoresOf('a11', [null, null]),
      ...scoresOf('a12', [5]),
      ...scoresOf('a13', [3]),
    ],
    mappings: [
      map('A', 'T1', 'Atasan'),
      map('P1', 'T1', 'Peer'),
      map('P2', 'T1', 'Cross'),
      map('T1', 'T1', 'Peer'), // relasi pemetaan diri diabaikan: assessor === target → Self
      map('P3', 'T1', 'Peer'),
      map('P4', 'T1', 'Bawahan'),
      map('A', 'T2', 'Atasan'),
      map('P1', 'T2', 'Peer'),
      map('T1', 'P1', 'Peer', true), // kewajiban T1 — belum dikirim sama sekali → terlambat
      map('T2', 'A', 'Bawahan', true), // kewajiban T2 — draft → terlambat (tapi dikecualikan HRD)
      map('X', 'T4', 'Peer'),
      map('A2', 'T5', 'Atasan'),
    ],
    late_penalty_waivers: over.waivers ?? [{ period_id: 'p', employee_id: 'T2', reason: 'Sakit', points: 0 }],
    relation_correction_requests: [],
    result_360: [
      { employee_id: 'T3', period_id: 'p', score: 50, score_raw: 50, late_penalty: 0, computed_at: '2026-09-01T00:00:00Z' },
      { employee_id: 'T9', period_id: 'p', score: 60, score_raw: 60, late_penalty: 0, computed_at: '2026-09-01T00:00:00Z' },
      { employee_id: 'T1', period_id: 'p0', score: 77, score_raw: 77, late_penalty: 0, computed_at: '2026-04-01T00:00:00Z' },
    ],
  };
}

/** Siapkan client sesi (employees pemanggil) + service_role di atas satu MemDb. */
function setup(opts: {
  me?: Row | null;
  user?: { id: string } | null;
  data?: Record<string, Row[]>;
  fail?: (c: Call) => string | null;
}) {
  const me = opts.me === undefined ? { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: null } : opts.me;
  const db = memDb({ employees: me ? [me] : [], ...(opts.data ?? fixture()) }, opts.fail);
  const user = opts.user === undefined ? { id: UID } : opts.user;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(memClient(db, user) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(memClient(db) as any);
  return db;
}

function upsertRows(db: MemDb): Row[] {
  const c = db.calls.find((x) => x.table === 'result_360' && x.op === 'upsert');
  return [...((c?.payload as Row[]) ?? [])].sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)));
}
const pick = (rows: Row[]) => rows.map((r) => ({ id: r.employee_id, raw: r.score_raw, pen: r.late_penalty, score: r.score }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => { vi.useRealTimers(); });

describe('computeResult360 — otorisasi', () => {
  it('tolak bila sesi berakhir (tanpa menyentuh service_role)', async () => {
    setup({ user: null });
    const r = await computeResult360();
    expect(r).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('tolak pegawai biasa / SPV / Direksi tanpa izin HRD Admin', async () => {
    for (const role of ['employee', 'spv', 'direksi']) {
      setup({ me: { id: UID, role, is_hrd_admin: false, hrd_sections: null } });
      const r = await computeResult360();
      expect(r).toEqual({ ok: false, error: 'Hanya HRD yang dapat menghitung skor 360' });
    }
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('tolak bila baris pegawai pemanggil tak ditemukan', async () => {
    setup({ me: null });
    const r = await computeResult360();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/);
  });

  it('tolak HRD berlingkup yang tak memegang bagian laporan/bobot/pemetaan', async () => {
    setup({ me: { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: ['kepatuhan', 'progress', 'dashboard'] } });
    const r = await computeResult360();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Hanya HRD/);
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it.each([['laporan'], ['bobot'], ['pemetaan']])('izinkan HRD berlingkup dengan bagian "%s"', async (sec) => {
    setup({ me: { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: [sec] } });
    const r = await computeResult360();
    expect(r.ok).toBe(true);
  });

  it('izinkan pemegang izin HRD Admin (is_hrd_admin) walau perannya bukan hrd', async () => {
    setup({ me: { id: UID, role: 'spv', is_hrd_admin: true, hrd_sections: null } });
    const r = await computeResult360();
    expect(r.ok).toBe(true);
  });
});

describe('computeResult360 — prasyarat & kegagalan', () => {
  it('tolak bila tak ada periode aktif', async () => {
    const data = fixture();
    data.periods = data.periods.filter((p) => p.status !== 'active');
    setup({ data });
    expect(await computeResult360()).toEqual({ ok: false, error: 'Tidak ada periode aktif' });
  });

  it('pengaman backfill: periode hasil impor (score360.backfill) DITOLAK sebelum bobot dibaca / skor ditulis', async () => {
    const db = setup({ data: fixture({ audit: [{ action: 'score360.backfill', target_id: 'p' }] }) });
    const r = await computeResult360();
    expect(r).toEqual({ ok: false, error: BACKFILL_LOCK_MSG });
    expect(db.calls.some((c) => c.table === 'weight_schemes')).toBe(false);
    expect(db.calls.some((c) => c.table === 'result_360')).toBe(false);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('log audit lain pada periode yang sama / backfill periode lain tidak mengunci', async () => {
    setup({ data: fixture({ audit: [{ action: 'score360.recompute', target_id: 'p' }, { action: 'score360.backfill', target_id: 'p0' }] }) });
    expect((await computeResult360()).ok).toBe(true);
  });

  it('tolak bila bobot periode belum disimpan (tanpa menulis skor)', async () => {
    const data = fixture();
    data.weight_schemes = data.weight_schemes.filter((w) => w.period_id !== 'p');
    const db = setup({ data });
    const r = await computeResult360();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Bobot penilai periode ini belum disimpan/);
    expect(db.calls.some((c) => c.table === 'result_360')).toBe(false);
  });

  it('skema bobot nonaktif (is_active=false) dianggap belum disimpan', async () => {
    setup({ data: fixture({ scheme: { period_id: 'p', is_active: false, model: '2class', weights: { atasan: 70, internal: 30 } } }) });
    const r = await computeResult360();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/belum disimpan/);
  });

  it('tolak bila belum ada penilaian TERKIRIM (draft/invalidated tak dihitung)', async () => {
    const data = fixture();
    data.assessments = data.assessments.map((a) => (a.status === 'submitted' ? { ...a, status: 'draft' } : a));
    const db = setup({ data });
    expect(await computeResult360()).toEqual({ ok: false, error: 'Belum ada penilaian terkirim untuk dihitung' });
    expect(db.calls.some((c) => c.table === 'assessment_indicator_scores')).toBe(false);
  });

  it('tolak bila semua penilaian terkirim tak menghasilkan skor (hanya Self / rating kosong)', async () => {
    const data = fixture();
    data.assessments = data.assessments.filter((a) => ['a04', 'a09', 'a11'].includes(String(a.id)));
    const db = setup({ data });
    expect(await computeResult360()).toEqual({ ok: false, error: 'Tidak ada skor yang dapat dihitung' });
    expect(db.calls.some((c) => c.table === 'result_360')).toBe(false);
  });

  it('gagal baca rating → pesan error, tanpa menulis skor', async () => {
    const db = setup({ fail: (c) => (c.table === 'assessment_indicator_scores' ? 'timeout' : null) });
    expect(await computeResult360()).toEqual({ ok: false, error: 'Gagal membaca data penilaian: timeout' });
    expect(db.calls.some((c) => c.table === 'result_360')).toBe(false);
  });

  it('gagal baca data keterlambatan → pesan error, tanpa menulis skor', async () => {
    const db = setup({ fail: (c) => (c.table === 'late_penalty_waivers' ? 'down' : null) });
    const r = await computeResult360();
    expect(r).toEqual({ ok: false, error: 'Gagal membaca data keterlambatan: Gagal membaca pengaturan potongan: down' });
    expect(db.calls.some((c) => c.table === 'result_360')).toBe(false);
  });

  it('gagal upsert result_360 → pesan error, tanpa hapus yatim & tanpa log audit', async () => {
    const db = setup({ fail: (c) => (c.table === 'result_360' && c.op === 'upsert' ? 'constraint' : null) });
    expect(await computeResult360()).toEqual({ ok: false, error: 'Gagal menulis result_360: constraint' });
    expect(db.calls.some((c) => c.table === 'result_360' && c.op === 'delete')).toBe(false);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('gagal hapus yatim → skor tetap tersimpan tetapi aksi melapor gagal, tanpa log audit', async () => {
    const db = setup({ fail: (c) => (c.table === 'result_360' && c.op === 'delete' ? 'rls' : null) });
    expect(await computeResult360()).toEqual({ ok: false, error: 'Skor tersimpan, tetapi gagal membersihkan skor 360° lama: rls' });
    expect(upsertRows(db)).toHaveLength(3);
    expect(mockLog).not.toHaveBeenCalled();
  });
});

describe('computeResult360 — hanya penilaian terkirim periode aktif', () => {
  it('filter assessments = period_id aktif + status submitted (bukan "bukan draft")', async () => {
    const db = setup({});
    await computeResult360();
    const q = db.calls.find((c) => c.table === 'assessments' && c.cols === 'id, assessor_id, target_id');
    expect(q?.filters).toEqual([['eq', 'period_id', 'p'], ['eq', 'status', 'submitted']]);
    // Rating hanya diminta untuk id penilaian terkirim (draft a05/a10 & invalidated a06 tidak).
    const s = db.calls.find((c) => c.table === 'assessment_indicator_scores');
    const ids = [...((s?.filters.find((f) => f[0] === 'in')?.[2] ?? []) as string[])].sort();
    expect(ids).toEqual(['a01', 'a02', 'a03', 'a04', 'a07', 'a08', 'a09', 'a11', 'a12', 'a13']);
  });
});

describe('computeResult360 — relasi dari pemetaan', () => {
  it('relasi diambil dari pemetaan walau pemetaannya NONAKTIF (is_active tak difilter)', async () => {
    const data = fixture();
    data.mappings = data.mappings.map((m) => (m.assessor_id === 'A' && m.target_id === 'T1' ? { ...m, is_active: false } : m));
    const db = setup({ data });
    await computeResult360();
    // A tetap dihitung sebagai Atasan T1 → angka sama dengan fixture dasar (81).
    expect(pick(upsertRows(db)).find((x) => x.id === 'T1')?.raw).toBe(81);
    const q = db.calls.find((c) => c.table === 'mappings' && c.filters.length === 1);
    expect(q?.filters).toEqual([['eq', 'period_id', 'p']]);
  });
});

describe('computeResult360 — angka result_360 (Q3 2026, 2 kelas → bobot otomatis BR-10)', () => {
  it('menulis score_raw / late_penalty / score per pegawai sesuai rumus', async () => {
    const db = setup({});
    const r = await computeResult360();
    // skippedFinal = pegawai dilewati karena laporannya Final (kunci laporan Final; tak ada di fixture ini).
    expect(r).toEqual({ ok: true, computed: 3, periodLabel: 'Q3 2026', skippedFinal: 0 });
    expect(pick(upsertRows(db))).toEqual([
      // T1: 2 Internal (Peer 80, Cross 70 → rerata 75) → Atasan 40 / Internal 60 (isian 70/30 DIABAIKAN):
      //     (90×40 + 75×60)/100 = 81. Self 100, draft & invalidated tak ikut. Terlambat → −3 = 78.
      { id: 'T1', raw: 81, pen: 3, score: 78 },
      // T2: bobot KHUSUS 4 kelas dipakai apa adanya: (80×50 + 60×50)/100 = 70. Terlambat, tapi
      //     potongan ditetapkan HRD = 0.
      { id: 'T2', raw: 70, pen: 0, score: 70 },
      // T5: penilai tanpa pemetaan → Peer. 1 Internal → Atasan 60 / Internal 40: (100×60 + 60×40)/100 = 84.
      { id: 'T5', raw: 84, pen: 0, score: 84 },
    ]);
  });

  it('upsert per (employee_id, period_id) dengan computed_at = waktu hitung', async () => {
    const db = setup({});
    await computeResult360();
    const c = db.calls.find((x) => x.table === 'result_360' && x.op === 'upsert');
    expect(c?.onConflict).toBe('employee_id,period_id');
    for (const row of upsertRows(db)) {
      expect(row.period_id).toBe('p');
      expect(row.computed_at).toBe(NOW);
    }
  });

  it('Self-only (T3) & rating kosong (T4) tak menghasilkan baris; T3 & T9 lama dihapus sebagai yatim', async () => {
    const db = setup({});
    await computeResult360();
    const ids = upsertRows(db).map((x) => x.employee_id);
    expect(ids).not.toContain('T3');
    expect(ids).not.toContain('T4');
    const del = db.calls.filter((c) => c.table === 'result_360' && c.op === 'delete');
    expect(del).toHaveLength(1);
    expect(del[0].filters[0]).toEqual(['eq', 'period_id', 'p']);
    expect([...((del[0].filters[1]?.[2] as string[]) ?? [])].sort()).toEqual(['T3', 'T9']);
    // Baris periode lain (T1 di p0) tak tersentuh.
    const left = db.tables.result_360.map((x) => `${x.employee_id}@${x.period_id}`).sort();
    expect(left).toEqual(['T1@p', 'T1@p0', 'T2@p', 'T5@p']);
    expect(db.tables.result_360.find((x) => x.period_id === 'p0')?.score).toBe(77);
  });

  it('log audit mencatat jumlah dihitung, yatim dihapus, model DB, & jumlah terpotong', async () => {
    setup({});
    await computeResult360();
    expect(mockLog).toHaveBeenCalledTimes(1);
    const arg = mockLog.mock.calls[0][0];
    expect(arg.action).toBe('score360.recompute');
    expect(arg.targetId).toBe('p');
    // Model yang dicatat = model DB ('2class'), bukan model efektif '2class_auto'.
    expect(arg.meta).toEqual({ computed: 3, removed_orphans: 2, model: '2class', late_penalized: 1 });
    expect(arg.summary).toContain('2-Kelas');
    expect(arg.summary).toContain('2 skor lama tanpa penilaian dihapus');
  });

  it('tanpa yatim → tidak ada delete & removed_orphans 0', async () => {
    const data = fixture();
    data.result_360 = [];
    const db = setup({ data });
    await computeResult360();
    expect(db.calls.some((c) => c.table === 'result_360' && c.op === 'delete')).toBe(false);
    expect(mockLog.mock.calls[0][0].meta).toMatchObject({ removed_orphans: 0 });
  });
});

describe('computeResult360 — pemilihan bobot (schemeFor)', () => {
  it('periode sebelum 2026-07-01 (Q1/Q2) memakai bobot 2 kelas TERSIMPAN (70/30)', async () => {
    const db = setup({ data: fixture({ start: '2026-04-01' }) });
    await computeResult360();
    expect(pick(upsertRows(db))).toEqual([
      // T1: 90×0,7 + 75×0,3 = 85,5 → −3 = 82,5
      { id: 'T1', raw: 85.5, pen: 3, score: 82.5 },
      // T2: bobot khusus tetap (tak bergantung periode)
      { id: 'T2', raw: 70, pen: 0, score: 70 },
      // T5: 100×0,7 + 60×0,3 = 88
      { id: 'T5', raw: 88, pen: 0, score: 88 },
    ]);
  });

  it('tanpa bobot khusus, T2 di Q3 ikut bobot otomatis: 1 Internal → 60/40 = 72', async () => {
    const db = setup({ data: fixture({ overrides: [] }) });
    await computeResult360();
    expect(pick(upsertRows(db)).find((x) => x.id === 'T2')).toEqual({ id: 'T2', raw: 72, pen: 0, score: 72 });
  });

  it('bobot khusus pegawai di periode lain tidak berlaku', async () => {
    const db = setup({ data: fixture({ overrides: [{ period_id: 'p0', employee_id: 'T2', model: '4class', weights: { atasan: 50, peer: 50 } }] }) });
    await computeResult360();
    expect(pick(upsertRows(db)).find((x) => x.id === 'T2')?.raw).toBe(72);
  });

  it('model 4 kelas periode tak diterjemahkan BR-10 (rerata tertimbang kelas yang ada, Self dikecualikan)', async () => {
    const db = setup({ data: fixture({ scheme: { period_id: 'p', is_active: true, model: '4class', weights: { atasan: 40, peer: 30, cross: 20, bawahan: 10, self: 50 } } }) });
    await computeResult360();
    expect(pick(upsertRows(db))).toEqual([
      // T1: (90×40 + 80×30 + 70×20)/(40+30+20) = 7400/90 = 82,222… → 82,22 ; −3 → 79,22
      { id: 'T1', raw: 82.22, pen: 3, score: 79.22 },
      { id: 'T2', raw: 70, pen: 0, score: 70 },
      // T5: (100×40 + 60×30)/70 = 82,857… → 82,86
      { id: 'T5', raw: 82.86, pen: 0, score: 82.86 },
    ]);
    expect(mockLog.mock.calls[0][0].summary).toContain('4-Kelas');
  });
});

describe('computeResult360 — interaksi potongan keterlambatan', () => {
  it('nilai potongan yang ditetapkan HRD menggantikan −3 otomatis; skor dilantai 0', async () => {
    const db = setup({ data: fixture({ waivers: [
      { period_id: 'p', employee_id: 'T1', reason: 'Berulang', points: 100 },
      { period_id: 'p', employee_id: 'T5', reason: 'Disiplin', points: 5 },
    ] }) });
    await computeResult360();
    expect(pick(upsertRows(db))).toEqual([
      { id: 'T1', raw: 81, pen: 100, score: 0 },
      // T2 kini TANPA pengecualian → −3 otomatis (draft Wajib lewat deadline)
      { id: 'T2', raw: 70, pen: 3, score: 67 },
      // T5 tak terlambat, tetapi penetapan HRD tetap berlaku (5 poin)
      { id: 'T5', raw: 84, pen: 5, score: 79 },
    ]);
    expect(mockLog.mock.calls[0][0].meta).toMatchObject({ late_penalized: 3 });
  });

  it('periode tanpa deadline → tak ada keterlambatan otomatis (score = score_raw)', async () => {
    const data = fixture({ waivers: [] });
    data.periods = data.periods.map((p) => (p.id === 'p' ? { ...p, assessment_deadline: null } : p));
    const db = setup({ data });
    await computeResult360();
    for (const r of upsertRows(db)) {
      expect(r.late_penalty).toBe(0);
      expect(r.score).toBe(r.score_raw);
    }
  });

  it('sebelum deadline lewat, kewajiban yang belum dikirim belum dipotong', async () => {
    vi.setSystemTime(new Date('2026-09-25T00:00:00Z'));
    const db = setup({ data: fixture({ waivers: [] }) });
    await computeResult360();
    expect(pick(upsertRows(db)).map((x) => x.pen)).toEqual([0, 0, 0]);
  });

  it('penilai terlambat tanpa skor 360° sendiri (P1) tidak dibuatkan baris result_360', async () => {
    const data = fixture({ waivers: [] });
    data.mappings.push(map('P1', 'T5', 'Peer', true)); // P1 tak pernah mengirim → terlambat
    const db = setup({ data });
    await computeResult360();
    const ids = upsertRows(db).map((x) => x.employee_id);
    expect(ids).toEqual(['T1', 'T2', 'T5']);
  });
});
