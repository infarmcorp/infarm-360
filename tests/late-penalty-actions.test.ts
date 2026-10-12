import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Uji KARAKTERISASI potongan keterlambatan menilai pada Skor 360° tersimpan:
 *   - refreshLatePenalties (lib/late-server.ts) — terapkan ulang score = max(0, score_raw − potongan)
 *   - setLateWaiver        (app/(app)/admin/kepatuhan/actions.ts) — HRD menetapkan/mengecualikan potongan
 *   - applyLatePenalties   (idem) — tombol "terapkan ke seluruh Skor 360°" periode aktif
 * Mengunci: gerbang sesi + bagian `kepatuhan`, validasi Zod, flat −3 (min 0), nilai penetapan HRD
 * menggantikan otomatis, dan baris result_360 mana yang diperbarui.
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { refreshLatePenalties } from '@/lib/late-server';
import { setLateWaiver, applyLatePenalties } from '@/app/(app)/admin/kepatuhan/actions';

// ── Mock Supabase IN-MEMORY lokal (khusus file ini) ─────────────────────────────────────────
// Helper bersama (tests/helpers/mock-supabase.ts) berbasis antrean FIFO & tak mendukung .range()/
// upsert-merge. Di sini query DIEVALUASI terhadap baris fixture (filter eq/neq/in diterapkan,
// .range() memotong, upsert menggabung per onConflict — hanya kolom yang dikirim yang ditimpa,
// seperti PostgREST). Satu `MemDb` dipakai bersama client sesi & service_role.
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
const EMP = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const NOW = '2026-10-12T03:00:00.000Z';
const DL = '2026-09-30T10:00:00Z';
const HRD = { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: null };

/** Kewajiban Wajib penilai `assessor` yang BELUM dikirim sama sekali (deadline lewat → terlambat). */
const obligation = (assessor: string, target = 'Z', extra: Row = {}): Row =>
  ({ period_id: 'p', assessor_id: assessor, target_id: target, relation: 'Peer', mandatory: true, is_adhoc: false, is_active: true, created_at: '2026-07-05T00:00:00Z', ...extra });
const r360 = (id: string, score_raw: number | null, score: number | null, late_penalty: number, period_id = 'p'): Row =>
  ({ employee_id: id, period_id, score_raw, score, late_penalty });

/**
 * Fixture result_360 periode aktif `p` (deadline lewat):
 *  L  terlambat, tanpa penetapan HRD          raw 80  → 77 (−3)
 *  W  terlambat, penetapan HRD 0 (dikecualikan) raw 90 (tersimpan 87/−3) → 90 (0)
 *  O  TIDAK terlambat, penetapan HRD 5         raw 70  → 65 (−5)
 *  F  terlambat, raw 2                          → 0 (lantai 0)
 *  N  baris lama tanpa score_raw (score 60), tak terlambat → score_raw diisi 60
 *  K  terlambat, sudah benar (75/72/−3)          → tidak disentuh
 *  Q  tak terlambat, potongan basi (50/47/−3)    → 50 (0)
 *  L@p0 periode lain → tidak disentuh
 */
function fixture(over: { start?: string; deadline?: string | null; waivers?: Row[]; mappings?: Row[]; requests?: Row[]; r360?: Row[] } = {}): Record<string, Row[]> {
  return {
    employees: [HRD, { id: EMP, name: 'Budi', role: 'employee', is_hrd_admin: false, hrd_sections: null }],
    periods: [
      { id: 'p0', label: 'Q2 2026', start_date: '2026-04-01', status: 'locked', assessment_deadline: DL },
      { id: 'p', label: 'Q3 2026', start_date: over.start ?? '2026-07-01', status: 'active', assessment_deadline: over.deadline === undefined ? DL : over.deadline },
    ],
    late_penalty_waivers: over.waivers ?? [
      { period_id: 'p', employee_id: 'W', reason: 'Sakit', points: 0 },
      { period_id: 'p', employee_id: 'O', reason: 'Disiplin', points: 5 },
    ],
    mappings: over.mappings ?? [obligation('L'), obligation('W'), obligation('F'), obligation('K')],
    relation_correction_requests: over.requests ?? [],
    assessments: [],
    result_360: over.r360 ?? [
      r360('L', 80, 80, 0),
      r360('W', 90, 87, 3),
      r360('O', 70, 70, 0),
      r360('F', 2, 2, 0),
      r360('N', null, 60, 0),
      r360('K', 75, 72, 3),
      r360('Q', 50, 47, 3),
      r360('L', 66, 66, 0, 'p0'),
    ],
  };
}

function setup(opts: { me?: Row | null; user?: { id: string } | null; data?: Record<string, Row[]>; fail?: (c: Call) => string | null } = {}) {
  const data = opts.data ?? fixture();
  if (opts.me !== undefined) data.employees = [...data.employees.filter((e) => e.id !== UID), ...(opts.me ? [opts.me] : [])];
  const db = memDb(data, opts.fail);
  const user = opts.user === undefined ? { id: UID } : opts.user;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(memClient(db, user) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(memClient(db) as any);
  return db;
}

const rowOf = (db: MemDb, id: string, period = 'p') => {
  const r = db.tables.result_360.find((x) => x.employee_id === id && x.period_id === period);
  return r ? { raw: r.score_raw, pen: r.late_penalty, score: r.score } : undefined;
};
const updatedIds = (db: MemDb) => db.calls
  .filter((c) => c.table === 'result_360' && c.op === 'update')
  .map((c) => c.filters.find((f) => f[1] === 'employee_id')?.[2] as string)
  .sort();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => { vi.useRealTimers(); });

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('refreshLatePenalties — seluruh periode', () => {
  it('score = max(0, score_raw − potongan); hanya baris yang berubah diperbarui', async () => {
    const db = setup();
    const n = await refreshLatePenalties('p');
    expect(n).toBe(6);
    expect(updatedIds(db)).toEqual(['F', 'L', 'N', 'O', 'Q', 'W']);
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 3, score: 77 }); // −3 flat otomatis
    expect(rowOf(db, 'W')).toEqual({ raw: 90, pen: 0, score: 90 }); // dikecualikan HRD (0)
    expect(rowOf(db, 'O')).toEqual({ raw: 70, pen: 5, score: 65 }); // nilai HRD berlaku walau tak terlambat
    expect(rowOf(db, 'F')).toEqual({ raw: 2, pen: 3, score: 0 });   // lantai 0
    expect(rowOf(db, 'N')).toEqual({ raw: 60, pen: 0, score: 60 }); // score_raw kosong → diisi dari score
    expect(rowOf(db, 'K')).toEqual({ raw: 75, pen: 3, score: 72 }); // sudah benar, tak disentuh
    expect(rowOf(db, 'Q')).toEqual({ raw: 50, pen: 0, score: 50 }); // potongan basi dicabut
    expect(rowOf(db, 'L', 'p0')).toEqual({ raw: 66, pen: 0, score: 66 }); // periode lain aman
  });

  it('payload update = {score, score_raw, late_penalty} difilter period_id + employee_id', async () => {
    const db = setup();
    await refreshLatePenalties('p');
    const c = db.calls.find((x) => x.table === 'result_360' && x.op === 'update' && x.filters.some((f) => f[2] === 'L'));
    expect(c?.payload).toEqual({ score: 77, score_raw: 80, late_penalty: 3 });
    expect(c?.filters).toEqual([['eq', 'period_id', 'p'], ['eq', 'employee_id', 'L']]);
  });

  it('idempoten: panggilan kedua tak mengubah apa pun', async () => {
    const db = setup();
    await refreshLatePenalties('p');
    const before = db.calls.length;
    expect(await refreshLatePenalties('p')).toBe(0);
    expect(db.calls.slice(before).some((c) => c.op === 'update')).toBe(false);
  });

  it('periode tanpa deadline → potongan otomatis 0, penetapan HRD tetap berlaku', async () => {
    const db = setup({ data: fixture({ deadline: null }) });
    await refreshLatePenalties('p');
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 0, score: 80 });
    expect(rowOf(db, 'K')).toEqual({ raw: 75, pen: 0, score: 75 });
    expect(rowOf(db, 'O')).toEqual({ raw: 70, pen: 5, score: 65 });
  });

  it('potongan flat −3 tak bertambah walau kewajiban terlambat lebih dari satu', async () => {
    const db = setup({ data: fixture({ mappings: [obligation('L', 'Z1'), obligation('L', 'Z2'), obligation('L', 'Z3')] }) });
    await refreshLatePenalties('p');
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 3, score: 77 });
  });

  it('pemetaan Opsional biasa tak ditagih; Opsional hasil AJUAN disetujui ditagih (periode ≥ 2026-07-01)', async () => {
    const data = fixture({
      waivers: [],
      mappings: [obligation('L', 'Z', { mandatory: false }), obligation('Q', 'Z', { mandatory: false })],
      requests: [{ period_id: 'p', assessor_id: 'Q', target_id: 'Z', kind: 'add', status: 'approved' }],
    });
    const db = setup({ data });
    await refreshLatePenalties('p');
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 0, score: 80 });
    expect(rowOf(db, 'Q')).toEqual({ raw: 50, pen: 3, score: 47 });
  });

  it('AJUAN tak ditagih pada periode sebelum 2026-07-01', async () => {
    const data = fixture({
      start: '2026-04-01',
      waivers: [],
      mappings: [obligation('Q', 'Z', { mandatory: false })],
      requests: [{ period_id: 'p', assessor_id: 'Q', target_id: 'Z', kind: 'add', status: 'approved' }],
    });
    const db = setup({ data });
    await refreshLatePenalties('p');
    expect(rowOf(db, 'Q')).toEqual({ raw: 50, pen: 0, score: 50 });
    expect(db.calls.some((c) => c.table === 'relation_correction_requests')).toBe(false);
  });

  it('pemetaan Ad-Hoc / nonaktif / dibuat sesudah deadline tak memicu potongan', async () => {
    const data = fixture({
      waivers: [],
      mappings: [
        obligation('L', 'Z', { is_adhoc: true }),
        obligation('F', 'Z', { is_active: false }),
        obligation('K', 'Z', { created_at: '2026-10-01T00:00:00Z' }),
      ],
    });
    const db = setup({ data });
    await refreshLatePenalties('p');
    expect(rowOf(db, 'L')?.pen).toBe(0);
    expect(rowOf(db, 'F')?.pen).toBe(0);
    expect(rowOf(db, 'K')).toEqual({ raw: 75, pen: 0, score: 75 });
  });

  it('kirim tepat waktu tidak dipotong; kirim pertama sesudah deadline dipotong; Paksa Selesai HRD tidak', async () => {
    const data = fixture({ waivers: [], mappings: [obligation('L'), obligation('F'), obligation('Q')] });
    data.assessments = [
      { period_id: 'p', assessor_id: 'L', target_id: 'Z', status: 'submitted', first_submitted_at: '2026-09-29T00:00:00Z', forced_by_hrd: false },
      { period_id: 'p', assessor_id: 'F', target_id: 'Z', status: 'submitted', first_submitted_at: '2026-10-02T00:00:00Z', forced_by_hrd: false },
      { period_id: 'p', assessor_id: 'Q', target_id: 'Z', status: 'submitted', first_submitted_at: null, forced_by_hrd: true },
    ];
    const db = setup({ data });
    await refreshLatePenalties('p');
    expect(rowOf(db, 'L')?.pen).toBe(0);
    expect(rowOf(db, 'F')).toEqual({ raw: 2, pen: 3, score: 0 });
    expect(rowOf(db, 'Q')).toEqual({ raw: 50, pen: 0, score: 50 });
  });

  it('penilai terlambat tanpa baris result_360 diabaikan (tak dibuatkan baris)', async () => {
    const db = setup({ data: fixture({ mappings: [obligation('TANPA_SKOR')] }) });
    await refreshLatePenalties('p');
    expect(db.tables.result_360.some((r) => r.employee_id === 'TANPA_SKOR')).toBe(false);
    expect(db.calls.some((c) => c.table === 'result_360' && (c.op === 'insert' || c.op === 'upsert'))).toBe(false);
  });

  it('gagal update → melempar error berpesan', async () => {
    setup({ fail: (c) => (c.table === 'result_360' && c.op === 'update' ? 'rls' : null) });
    await expect(refreshLatePenalties('p')).rejects.toThrow('Gagal memperbarui potongan 360°: rls');
  });

  it('gagal baca result_360 (tanpa onlyIds) → melempar error', async () => {
    setup({ fail: (c) => (c.table === 'result_360' && c.op === 'select' ? 'timeout' : null) });
    await expect(refreshLatePenalties('p')).rejects.toThrow('timeout');
  });
});

describe('refreshLatePenalties — onlyIds', () => {
  it('hanya pegawai yang disebut yang dibaca & diperbarui', async () => {
    const db = setup();
    expect(await refreshLatePenalties('p', ['L', 'K'])).toBe(1);
    expect(updatedIds(db)).toEqual(['L']);
    expect(rowOf(db, 'Q')).toEqual({ raw: 50, pen: 3, score: 47 }); // basi, tapi di luar onlyIds
    const sel = db.calls.find((c) => c.table === 'result_360' && c.op === 'select');
    expect(sel?.filters).toEqual([['eq', 'period_id', 'p'], ['in', 'employee_id', ['L', 'K']]]);
  });

  it('onlyIds kosong → 0 tanpa membaca result_360 (ringkasan keterlambatan tetap dimuat)', async () => {
    const db = setup();
    expect(await refreshLatePenalties('p', [])).toBe(0);
    expect(db.calls.some((c) => c.table === 'result_360')).toBe(false);
    expect(db.calls.some((c) => c.table === 'periods')).toBe(true);
  });

  it('gagal baca result_360 di jalur onlyIds → DITELAN, mengembalikan 0 (perilaku saat ini)', async () => {
    const db = setup({ fail: (c) => (c.table === 'result_360' && c.op === 'select' ? 'timeout' : null) });
    await expect(refreshLatePenalties('p', ['L'])).resolves.toBe(0);
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 0, score: 80 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('setLateWaiver — validasi Zod (sebelum menyentuh DB)', () => {
  it.each([
    ['employeeId bukan UUID', { employeeId: 'x', reason: 'Sakit', points: 0 }],
    ['points negatif', { employeeId: EMP, reason: 'Sakit', points: -1 }],
    ['points > 100', { employeeId: EMP, reason: 'Sakit', points: 101 }],
    ['points bukan angka', { employeeId: EMP, reason: 'Sakit', points: 'abc' }],
    ['reason > 300 karakter', { employeeId: EMP, reason: 'x'.repeat(301), points: 0 }],
    ['reason tidak dikirim (wajib string|null)', { employeeId: EMP, points: 0 }],
    ['input bukan objek', 'EMP'],
  ])('tolak: %s', async (_label, input) => {
    const r = await setLateWaiver(input);
    expect(r.ok).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('pesan batas points dari Zod', async () => {
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Sakit', points: -1 })).toEqual({ ok: false, error: 'Potongan minimal 0' });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Sakit', points: 101 })).toEqual({ ok: false, error: 'Potongan maksimal 100' });
  });

  it('alasan < 3 karakter (setelah trim) ditolak', async () => {
    expect(await setLateWaiver({ employeeId: EMP, reason: '  ab  ', points: 0 })).toEqual({ ok: false, error: 'Alasan pengecualian minimal 3 karakter' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('batas inklusif: points 0 dan 100, alasan tepat 3 & 300 karakter lolos validasi', async () => {
    for (const input of [
      { employeeId: EMP, reason: 'abc', points: 0 },
      { employeeId: EMP, reason: 'x'.repeat(300), points: 100 },
    ]) {
      setup({ data: fixture({ r360: [r360(EMP, 80, 80, 0)], mappings: [], waivers: [] }) });
      expect(await setLateWaiver(input)).toEqual({ ok: true });
    }
  });
});

describe('setLateWaiver — otorisasi & periode', () => {
  const INPUT = { employeeId: EMP, reason: 'Sakit', points: 0 };

  it('tolak bila sesi berakhir', async () => {
    setup({ user: null });
    expect(await setLateWaiver(INPUT)).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
  });

  it.each([
    ['pegawai biasa', { id: UID, role: 'employee', is_hrd_admin: false, hrd_sections: null }],
    ['SPV', { id: UID, role: 'spv', is_hrd_admin: false, hrd_sections: null }],
    ['HRD berlingkup tanpa kepatuhan', { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: ['laporan', 'bobot'] }],
  ])('tolak %s', async (_l, me) => {
    const db = setup({ me });
    expect(await setLateWaiver(INPUT)).toEqual({ ok: false, error: 'Hanya HRD yang dapat mengecualikan potongan' });
    expect(db.calls.some((c) => c.table === 'late_penalty_waivers')).toBe(false);
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('izinkan HRD berlingkup `kepatuhan` dan pemegang is_hrd_admin', async () => {
    for (const me of [
      { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: ['kepatuhan'] },
      { id: UID, role: 'spv', is_hrd_admin: true, hrd_sections: null },
    ]) {
      setup({ me, data: fixture({ r360: [r360(EMP, 80, 80, 0)], mappings: [], waivers: [] }) });
      expect(await setLateWaiver(INPUT)).toEqual({ ok: true });
    }
  });

  it('tolak bila tak ada periode aktif', async () => {
    const data = fixture();
    data.periods = data.periods.filter((p) => p.status !== 'active');
    setup({ data });
    expect(await setLateWaiver(INPUT)).toEqual({ ok: false, error: 'Tidak ada periode aktif' });
  });
});

describe('setLateWaiver — penulisan & penerapan ke Skor 360°', () => {
  /** EMP terlambat (Wajib belum dikirim), skor tersimpan masih −3 otomatis. OTHER basi (sengaja). */
  const base = (waivers: Row[] = []) => fixture({
    waivers,
    mappings: [obligation(EMP)],
    r360: [r360(EMP, 80, 77, 3), r360(OTHER, 50, 47, 3)],
  });

  it('points 0 → upsert TANPA kolom points, skor EMP kembali ke score_raw; pegawai lain tak disentuh', async () => {
    const db = setup({ data: base() });
    expect(await setLateWaiver({ employeeId: EMP, reason: '  Sakit  ', points: 0 })).toEqual({ ok: true });
    const up = db.calls.find((c) => c.table === 'late_penalty_waivers' && c.op === 'upsert');
    expect(up?.payload).toEqual({ employee_id: EMP, period_id: 'p', reason: 'Sakit', set_by: UID });
    expect(up?.onConflict).toBe('employee_id,period_id');
    expect(rowOf(db, EMP)).toEqual({ raw: 80, pen: 0, score: 80 });
    expect(rowOf(db, OTHER)).toEqual({ raw: 50, pen: 3, score: 47 });
    expect(updatedIds(db)).toEqual([EMP]);
    const log = mockLog.mock.calls[0][0];
    expect(log.action).toBe('late_penalty.waive');
    expect(log.meta).toEqual({ reason: 'Sakit', points: 0 });
    expect(log.targetLabel).toBe('Budi');
  });

  it('points tidak dikirim → default 0 (dikecualikan)', async () => {
    const db = setup({ data: base() });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Cuti' })).toEqual({ ok: true });
    expect(rowOf(db, EMP)).toEqual({ raw: 80, pen: 0, score: 80 });
  });

  it('points > 0 (string di-coerce) → upsert DENGAN points, nilai HRD menggantikan −3', async () => {
    const db = setup({ data: base() });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Berulang', points: '7' })).toEqual({ ok: true });
    const up = db.calls.find((c) => c.table === 'late_penalty_waivers' && c.op === 'upsert');
    expect(up?.payload).toEqual({ employee_id: EMP, period_id: 'p', reason: 'Berulang', points: 7, set_by: UID });
    expect(rowOf(db, EMP)).toEqual({ raw: 80, pen: 7, score: 73 });
    const log = mockLog.mock.calls[0][0];
    expect(log.action).toBe('late_penalty.set');
    expect(log.summary).toContain('−7');
  });

  it('points 100 pada skor 80 → skor dilantai 0', async () => {
    const db = setup({ data: base() });
    await setLateWaiver({ employeeId: EMP, reason: 'Berat', points: 100 });
    expect(rowOf(db, EMP)).toEqual({ raw: 80, pen: 100, score: 0 });
  });

  it('reason null → hapus penetapan, kembali ke −3 otomatis', async () => {
    const db = setup({ data: base([{ period_id: 'p', employee_id: EMP, reason: 'Sakit', points: 0 }]) });
    db.tables.result_360[0] = r360(EMP, 80, 80, 0);
    expect(await setLateWaiver({ employeeId: EMP, reason: null, points: 9 })).toEqual({ ok: true });
    const del = db.calls.find((c) => c.table === 'late_penalty_waivers' && c.op === 'delete');
    expect(del?.filters).toEqual([['eq', 'employee_id', EMP], ['eq', 'period_id', 'p']]);
    expect(db.tables.late_penalty_waivers).toHaveLength(0);
    expect(rowOf(db, EMP)).toEqual({ raw: 80, pen: 3, score: 77 });
    const log = mockLog.mock.calls[0][0];
    expect(log.action).toBe('late_penalty.unwaive');
    expect(log.meta).toEqual({ reason: null, points: null }); // points diabaikan saat unwaive
  });

  it('reason hanya spasi → diperlakukan null (hapus penetapan), bukan ditolak', async () => {
    const db = setup({ data: base([{ period_id: 'p', employee_id: EMP, reason: 'Sakit', points: 0 }]) });
    expect(await setLateWaiver({ employeeId: EMP, reason: '   ', points: 0 })).toEqual({ ok: true });
    expect(db.calls.some((c) => c.table === 'late_penalty_waivers' && c.op === 'delete')).toBe(true);
  });

  it('CATATAN: ubah penetapan −7 → 0 mengirim upsert tanpa points, sehingga nilai 7 LAMA tetap tersimpan', async () => {
    // Upsert PostgREST hanya menimpa kolom yang dikirim; payload points=0 tak menyertakan `points`.
    const db = setup({ data: base([{ period_id: 'p', employee_id: EMP, reason: 'Berulang', points: 7 }]) });
    db.tables.result_360[0] = r360(EMP, 80, 73, 7);
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Ternyata sakit', points: 0 })).toEqual({ ok: true });
    expect(db.tables.late_penalty_waivers[0]).toMatchObject({ reason: 'Ternyata sakit', points: 7 });
    expect(rowOf(db, EMP)).toEqual({ raw: 80, pen: 7, score: 73 }); // BUKAN 0 seperti yang dimaksud
    expect(mockLog.mock.calls[0][0].action).toBe('late_penalty.waive'); // log menyebut "dikecualikan"
  });

  it('error DB menyebut "points" → pesan perlu migrasi 0043; tanpa menerapkan ke skor', async () => {
    const db = setup({ data: base(), fail: (c) => (c.table === 'late_penalty_waivers' && c.op === 'upsert' ? 'column "points" does not exist' : null) });
    const r = await setLateWaiver({ employeeId: EMP, reason: 'Berulang', points: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/migrasi database 0043/);
    expect(db.calls.some((c) => c.table === 'result_360')).toBe(false);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('error DB lain → "Gagal menyimpan: …"', async () => {
    setup({ data: base(), fail: (c) => (c.table === 'late_penalty_waivers' && c.op === 'delete' ? 'rls denied' : null) });
    expect(await setLateWaiver({ employeeId: EMP, reason: null })).toEqual({ ok: false, error: 'Gagal menyimpan: rls denied' });
  });

  it('gagal menerapkan ke result_360 → penetapan tetap tersimpan, aksi melapor gagal, tanpa log', async () => {
    const db = setup({ data: base(), fail: (c) => (c.table === 'result_360' && c.op === 'update' ? 'lock' : null) });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Sakit', points: 0 })).toEqual({
      ok: false, error: 'Pengecualian tersimpan, tapi gagal menerapkan ke Skor 360°: Gagal memperbarui potongan 360°: lock',
    });
    expect(db.tables.late_penalty_waivers).toHaveLength(1);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('pegawai tanpa baris result_360 → tetap ok (potongan gugur, tak ada baris dibuat)', async () => {
    const db = setup({ data: fixture({ waivers: [], mappings: [obligation(EMP)], r360: [] }) });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Berulang', points: 4 })).toEqual({ ok: true });
    expect(db.tables.result_360).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('applyLatePenalties', () => {
  it('tolak bila sesi berakhir', async () => {
    setup({ user: null });
    expect(await applyLatePenalties()).toEqual({ ok: false, error: 'Sesi berakhir, silakan login ulang' });
  });

  it('tolak non-HRD & HRD berlingkup tanpa kepatuhan (tanpa service_role)', async () => {
    for (const me of [
      { id: UID, role: 'employee', is_hrd_admin: false, hrd_sections: null },
      { id: UID, role: 'direksi', is_hrd_admin: false, hrd_sections: null },
      { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: ['laporan'] },
    ]) {
      setup({ me });
      expect(await applyLatePenalties()).toEqual({ ok: false, error: 'Hanya HRD yang dapat menerapkan potongan keterlambatan' });
    }
    expect(mockAdmin).not.toHaveBeenCalled();
  });

  it('tolak bila tak ada periode aktif', async () => {
    const data = fixture();
    data.periods = data.periods.filter((p) => p.status !== 'active');
    setup({ data });
    expect(await applyLatePenalties()).toEqual({ ok: false, error: 'Tidak ada periode aktif' });
  });

  it('menerapkan ke seluruh baris periode aktif & melaporkan jumlah berubah', async () => {
    const db = setup({ me: { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: ['kepatuhan'] } });
    expect(await applyLatePenalties()).toEqual({ ok: true, changed: 6 });
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 3, score: 77 });
    expect(rowOf(db, 'L', 'p0')).toEqual({ raw: 66, pen: 0, score: 66 });
    expect(mockLog).toHaveBeenCalledTimes(1);
    const log = mockLog.mock.calls[0][0];
    expect(log.action).toBe('late_penalty.apply');
    expect(log.targetId).toBe('p');
    expect(log.meta).toEqual({ changed: 6 });
    expect(log.summary).toContain('6 pegawai diperbarui');
  });

  it('tak ada yang berubah → ok dengan changed 0 (tetap dicatat di log)', async () => {
    const db = setup();
    await refreshLatePenalties('p');
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreate.mockResolvedValue(memClient(db, { id: UID }) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAdmin.mockReturnValue(memClient(db) as any);
    expect(await applyLatePenalties()).toEqual({ ok: true, changed: 0 });
    expect(mockLog).toHaveBeenCalledTimes(1);
  });

  it('gagal → "Gagal menerapkan potongan: …" tanpa log', async () => {
    setup({ fail: (c) => (c.table === 'result_360' && c.op === 'update' ? 'lock' : null) });
    expect(await applyLatePenalties()).toEqual({ ok: false, error: 'Gagal menerapkan potongan: Gagal memperbarui potongan 360°: lock' });
    expect(mockLog).not.toHaveBeenCalled();
  });
});
