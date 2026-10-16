import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * KUNCI LAPORAN FINAL atas Skor 360° (gelombang 2b, poin 1): setelah laporan pegawai Final, baris
 * result_360-nya (score, score_raw, late_penalty) tak boleh berubah kecuali HRD menekan
 * "Buka Kembali (ke Draf)" dulu. Diuji pada:
 *   - refreshLatePenalties / refreshLatePenaltiesDetailed (lib/late-server.ts) — massal → DILEWATI
 *   - computeResult360 (admin/360/actions.ts) — Hitung Ulang massal → DILEWATI (termasuk hapus yatim)
 *   - setLateWaiver (admin/kepatuhan/actions.ts) — satu pegawai → DITOLAK sebelum menyimpan
 *   - applyLatePenalties (idem) — massal → DILEWATI & dilaporkan
 * Tiap jalur: (a) belum Final = seperti biasa · (b) Final = dilewati/ditolak · (c) setelah Buka
 * Kembali (draft) = diproses lagi · (d) status Final tak terbaca = GAGAL (gagal tertutup).
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { refreshLatePenalties, refreshLatePenaltiesDetailed } from '@/lib/late-server';
import { computeResult360 } from '@/app/(app)/admin/360/actions';
import { setLateWaiver, applyLatePenalties } from '@/app/(app)/admin/kepatuhan/actions';
import { FINAL_CHECK_FAILED_MSG, finalLockMsg } from '@/lib/final-lock';

// ── Mock Supabase IN-MEMORY lokal (sama dengan tests/late-penalty-actions.test.ts) ─────────────
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
      return { data: single ? { ...list[0] } : null, error: null };
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
const NOW = '2026-10-12T03:00:00.000Z';
const DL = '2026-09-30T10:00:00Z';
const HRD = { id: UID, role: 'hrd', is_hrd_admin: false, hrd_sections: null };

const fin = (employee_id: string, status = 'finalized', period_id = 'p'): Row => ({ employee_id, period_id, status });
const obligation = (assessor: string, target = 'Z'): Row =>
  ({ period_id: 'p', assessor_id: assessor, target_id: target, relation: 'Peer', mandatory: true, is_adhoc: false, is_active: true, created_at: '2026-07-05T00:00:00Z' });
const r360 = (id: string, score_raw: number | null, score: number | null, late_penalty: number, period_id = 'p'): Row =>
  ({ employee_id: id, period_id, score_raw, score, late_penalty, computed_at: '2026-09-01T00:00:00Z' });

function setup(data: Record<string, Row[]>, fail?: (c: Call) => string | null) {
  const db = memDb({ employees: [HRD], hrd_audit_log: [], ...data }, fail);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(memClient(db, { id: UID }) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(memClient(db) as any);
  return db;
}
const rowOf = (db: MemDb, id: string, period = 'p') => {
  const r = db.tables.result_360.find((x) => x.employee_id === id && x.period_id === period);
  return r ? { raw: r.score_raw, pen: r.late_penalty, score: r.score } : undefined;
};
const r360Writes = (db: MemDb) => db.calls.filter((c) => c.table === 'result_360' && c.op !== 'select');
const failFinal = (c: Call) => (c.table === 'final_reports' ? 'timeout' : null);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => { vi.useRealTimers(); });

// ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Potongan telat: L & F terlambat (−3 belum diterapkan), K terlambat & sudah benar, Q basi (−3 → 0).
 */
function lateData(finals: Row[] = []): Record<string, Row[]> {
  return {
    employees: [HRD, { id: EMP, name: 'Budi', role: 'employee', is_hrd_admin: false, hrd_sections: null }],
    periods: [{ id: 'p', label: 'Q3 2026', start_date: '2026-07-01', status: 'active', assessment_deadline: DL }],
    late_penalty_waivers: [],
    mappings: [obligation('L'), obligation('F'), obligation('K'), obligation(EMP)],
    relation_correction_requests: [],
    assessments: [],
    final_reports: finals,
    result_360: [r360('L', 80, 80, 0), r360('F', 60, 60, 0), r360('K', 75, 72, 3), r360('Q', 50, 47, 3), r360(EMP, 90, 90, 0)],
  };
}

describe('refreshLatePenalties — pegawai Final dilewati', () => {
  it('(a) tanpa laporan Final → semua yang perlu diperbarui (seperti biasa)', async () => {
    const db = setup(lateData());
    expect(await refreshLatePenaltiesDetailed('p')).toEqual({ changed: 4, skippedFinal: 0 });
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 3, score: 77 });
  });

  it('(b) Final → barisnya tak disentuh & dihitung sebagai dilewati; yang sudah benar tak dihitung', async () => {
    const db = setup(lateData([fin('L'), fin('K')]));
    expect(await refreshLatePenaltiesDetailed('p')).toEqual({ changed: 3, skippedFinal: 1 });
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 0, score: 80 }); // tetap angka saat Final
    expect(rowOf(db, 'K')).toEqual({ raw: 75, pen: 3, score: 72 });
    expect(rowOf(db, 'F')).toEqual({ raw: 60, pen: 3, score: 57 });
    expect(r360Writes(db).some((c) => c.filters.some((f) => f[2] === 'L'))).toBe(false);
  });

  it('(b) Final di periode LAIN / status lain tidak mengunci periode ini', async () => {
    const db = setup(lateData([fin('L', 'finalized', 'p0'), fin('F', 'in_review'), fin('Q', 'approved')]));
    expect(await refreshLatePenaltiesDetailed('p')).toEqual({ changed: 4, skippedFinal: 0 });
    expect(rowOf(db, 'L')?.pen).toBe(3);
  });

  it('(b) jalur onlyIds: pegawai Final yang diminta → 0 berubah, 1 dilewati', async () => {
    const db = setup(lateData([fin('L')]));
    expect(await refreshLatePenaltiesDetailed('p', ['L', 'F'])).toEqual({ changed: 1, skippedFinal: 1 });
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 0, score: 80 });
  });

  it('refreshLatePenalties tetap mengembalikan jumlah berubah (angka) untuk pemanggil lama', async () => {
    setup(lateData([fin('L')]));
    expect(await refreshLatePenalties('p')).toBe(3);
  });

  it('(c) setelah Buka Kembali (status draft) → diproses lagi', async () => {
    const db = setup(lateData([fin('L', 'draft')]));
    expect(await refreshLatePenaltiesDetailed('p')).toEqual({ changed: 4, skippedFinal: 0 });
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 3, score: 77 });
  });

  it('(d) status Final tak terbaca → melempar, tak ada baris yang diubah', async () => {
    const db = setup(lateData(), failFinal);
    await expect(refreshLatePenalties('p')).rejects.toThrow('timeout');
    await expect(refreshLatePenalties('p', ['L'])).rejects.toThrow('timeout');
    expect(r360Writes(db)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
const asmt = (id: string, assessor: string, target: string): Row =>
  ({ id, period_id: 'p', assessor_id: assessor, target_id: target, status: 'submitted', first_submitted_at: '2026-09-20T00:00:00Z', forced_by_hrd: false });
const map = (assessor: string, target: string, relation: string): Row =>
  ({ period_id: 'p', assessor_id: assessor, target_id: target, relation, mandatory: false, is_adhoc: false, is_active: true, created_at: '2026-07-05T00:00:00Z' });

/**
 * Hitung Ulang (tanpa deadline → tanpa potongan): T1 & T2 punya penilaian (skor tersimpan basi 50),
 * T8 & T9 punya baris lama tanpa penilaian (yatim).
 */
function computeData(finals: Row[] = [], result360?: Row[]): Record<string, Row[]> {
  return {
    periods: [{ id: 'p', label: 'Q3 2026', start_date: '2026-07-01', status: 'active', assessment_deadline: null }],
    weight_schemes: [{ period_id: 'p', is_active: true, model: '2class', weights: { atasan: 70, internal: 30 } }],
    employee_weight_overrides: [],
    assessments: [asmt('a1', 'A', 'T1'), asmt('a2', 'P', 'T1'), asmt('a3', 'A', 'T2'), asmt('a4', 'P', 'T2')],
    assessment_indicator_scores: [
      { assessment_id: 'a1', indicator_id: 'i1', rating: 5 }, { assessment_id: 'a2', indicator_id: 'i1', rating: 4 },
      { assessment_id: 'a3', indicator_id: 'i1', rating: 4 }, { assessment_id: 'a4', indicator_id: 'i1', rating: 3 },
    ],
    mappings: [map('A', 'T1', 'Atasan'), map('P', 'T1', 'Peer'), map('A', 'T2', 'Atasan'), map('P', 'T2', 'Peer')],
    late_penalty_waivers: [],
    relation_correction_requests: [],
    final_reports: finals,
    result_360: result360 ?? [r360('T1', 50, 50, 0), r360('T2', 50, 50, 0), r360('T8', 40, 40, 0), r360('T9', 45, 45, 0)],
  };
}

describe('computeResult360 — pegawai Final dilewati', () => {
  it('(a) tanpa laporan Final → semua dihitung, yatim dihapus, skippedFinal 0', async () => {
    const db = setup(computeData());
    const r = await computeResult360();
    expect(r).toEqual({ ok: true, computed: 2, periodLabel: 'Q3 2026', skippedFinal: 0 });
    // T1: Atasan 100 / Internal 80 → 60/40 = 92 ; T2: 80 / 60 → 72
    expect(rowOf(db, 'T1')).toEqual({ raw: 92, pen: 0, score: 92 });
    expect(rowOf(db, 'T2')).toEqual({ raw: 72, pen: 0, score: 72 });
    expect(rowOf(db, 'T8')).toBeUndefined();
    expect(rowOf(db, 'T9')).toBeUndefined();
  });

  it('(b) Final → tak di-upsert & tak dihapus sebagai yatim; jumlah dilewati dilaporkan', async () => {
    const db = setup(computeData([fin('T1'), fin('T9')]));
    const r = await computeResult360();
    expect(r).toEqual({ ok: true, computed: 1, periodLabel: 'Q3 2026', skippedFinal: 2 });
    expect(rowOf(db, 'T1')).toEqual({ raw: 50, pen: 0, score: 50 }); // angka saat Final dipertahankan
    expect(rowOf(db, 'T9')).toEqual({ raw: 45, pen: 0, score: 45 }); // yatim Final tidak dihapus
    expect(rowOf(db, 'T2')).toEqual({ raw: 72, pen: 0, score: 72 });
    expect(rowOf(db, 'T8')).toBeUndefined();                          // yatim biasa tetap dihapus
    const up = db.calls.find((c) => c.table === 'result_360' && c.op === 'upsert');
    expect((up?.payload as Row[]).map((x) => x.employee_id)).toEqual(['T2']);
    const del = db.calls.find((c) => c.table === 'result_360' && c.op === 'delete');
    expect(del?.filters.find((f) => f[0] === 'in')?.[2]).toEqual(['T8']);
    const log = mockLog.mock.calls[0][0];
    expect(log.summary).toContain('2 pegawai dilewati karena laporannya sudah Final');
    expect(log.meta).toMatchObject({ computed: 1, skipped_final: 2 });
  });

  it('(b) Final yang angkanya tak akan berubah tidak dihitung sebagai dilewati', async () => {
    const db = setup(computeData([fin('T1')], [r360('T1', 92, 92, 0), r360('T2', 50, 50, 0)]));
    expect(await computeResult360()).toEqual({ ok: true, computed: 1, periodLabel: 'Q3 2026', skippedFinal: 0 });
    expect(rowOf(db, 'T1')).toEqual({ raw: 92, pen: 0, score: 92 });
  });

  it('(b) semua yang terhitung Final → ok tanpa upsert', async () => {
    const db = setup(computeData([fin('T1'), fin('T2'), fin('T8'), fin('T9')]));
    expect(await computeResult360()).toEqual({ ok: true, computed: 0, periodLabel: 'Q3 2026', skippedFinal: 4 });
    expect(r360Writes(db)).toHaveLength(0);
  });

  it('(c) setelah Buka Kembali (status draft) → dihitung ulang lagi', async () => {
    const db = setup(computeData([fin('T1', 'draft'), fin('T9', 'draft')]));
    expect(await computeResult360()).toEqual({ ok: true, computed: 2, periodLabel: 'Q3 2026', skippedFinal: 0 });
    expect(rowOf(db, 'T1')).toEqual({ raw: 92, pen: 0, score: 92 });
    expect(rowOf(db, 'T9')).toBeUndefined();
  });

  it('(d) status Final tak terbaca → gagal tanpa menulis/menghapus skor & tanpa log', async () => {
    const db = setup(computeData(), failFinal);
    expect(await computeResult360()).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(r360Writes(db)).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('setLateWaiver — pegawai Final ditolak', () => {
  const INPUT = { employeeId: EMP, reason: 'Sakit', points: 5 };

  it('(a) belum Final → tersimpan & diterapkan', async () => {
    const db = setup(lateData([fin(EMP, 'in_review')]));
    expect(await setLateWaiver(INPUT)).toEqual({ ok: true });
    expect(rowOf(db, EMP)).toEqual({ raw: 90, pen: 5, score: 85 });
  });

  it('(b) Final → ditolak dengan pesan baku SEBELUM penetapan disimpan', async () => {
    const db = setup(lateData([fin(EMP)]));
    expect(await setLateWaiver(INPUT)).toEqual({ ok: false, error: finalLockMsg(['Budi']) });
    expect(db.calls.some((c) => c.table === 'late_penalty_waivers' && c.op !== 'select')).toBe(false);
    expect(rowOf(db, EMP)).toEqual({ raw: 90, pen: 0, score: 90 });
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('(b) mengembalikan ke otomatis (alasan kosong) juga ditolak', async () => {
    const db = setup({ ...lateData([fin(EMP)]), late_penalty_waivers: [{ period_id: 'p', employee_id: EMP, reason: 'Sakit', points: 0 }] });
    expect(await setLateWaiver({ employeeId: EMP, reason: null })).toEqual({ ok: false, error: finalLockMsg(['Budi']) });
    expect(db.tables.late_penalty_waivers).toHaveLength(1);
  });

  it('(c) setelah Buka Kembali → boleh lagi', async () => {
    const db = setup(lateData([fin(EMP, 'draft')]));
    expect(await setLateWaiver(INPUT)).toEqual({ ok: true });
    expect(rowOf(db, EMP)).toEqual({ raw: 90, pen: 5, score: 85 });
  });

  it('(d) status Final tak terbaca → ditolak tanpa menyimpan', async () => {
    const db = setup(lateData(), failFinal);
    expect(await setLateWaiver(INPUT)).toEqual({ ok: false, error: FINAL_CHECK_FAILED_MSG });
    expect(db.calls.some((c) => c.table === 'late_penalty_waivers' && c.op !== 'select')).toBe(false);
    expect(r360Writes(db)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('applyLatePenalties — pegawai Final dilewati & dilaporkan', () => {
  it('(a) tanpa laporan Final → skippedFinal 0, log tanpa keterangan dilewati', async () => {
    setup(lateData());
    expect(await applyLatePenalties()).toEqual({ ok: true, changed: 4, skippedFinal: 0 });
    const log = mockLog.mock.calls[0][0];
    expect(log.meta).toEqual({ changed: 4 });
    expect(log.summary).not.toContain('Final');
  });

  it('(b) Final → dilewati, jumlahnya dikembalikan & dicatat di log', async () => {
    const db = setup(lateData([fin('L'), fin('F')]));
    expect(await applyLatePenalties()).toEqual({ ok: true, changed: 2, skippedFinal: 2 });
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 0, score: 80 });
    expect(rowOf(db, 'F')).toEqual({ raw: 60, pen: 0, score: 60 });
    const log = mockLog.mock.calls[0][0];
    expect(log.meta).toEqual({ changed: 2, skipped_final: 2 });
    expect(log.summary).toContain('2 pegawai dilewati karena laporannya sudah Final');
  });

  it('(c) setelah Buka Kembali → diterapkan', async () => {
    const db = setup(lateData([fin('L', 'draft')]));
    expect(await applyLatePenalties()).toEqual({ ok: true, changed: 4, skippedFinal: 0 });
    expect(rowOf(db, 'L')).toEqual({ raw: 80, pen: 3, score: 77 });
  });

  it('(d) status Final tak terbaca → gagal tanpa mengubah skor & tanpa log', async () => {
    const db = setup(lateData(), failFinal);
    expect(await applyLatePenalties()).toEqual({ ok: false, error: 'Gagal menerapkan potongan: timeout' });
    expect(r360Writes(db)).toHaveLength(0);
    expect(mockLog).not.toHaveBeenCalled();
  });
});
