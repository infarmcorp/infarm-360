import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug 2026-10-12: potongan yang sudah ditetapkan (mis. −7) lalu diubah ke 0 ("dikecualikan") tetap −7,
// karena upsert ditulis TANPA kolom `points` — PostgREST hanya menimpa kolom yang dikirim.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}) }));
vi.mock('@/lib/late-server', () => ({ refreshLatePenalties: vi.fn(async () => 1) }));

import { createClient } from '@/lib/supabase/server';
import { logHrdAction } from '@/lib/audit/log';
import { refreshLatePenalties } from '@/lib/late-server';
import { setLateWaiver } from '@/app/(app)/admin/kepatuhan/actions';

const HRD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = '11111111-1111-1111-1111-111111111111';
const P = 'p-q3';

type Waiver = { employee_id: string; period_id: string; reason: string; points: number; set_by: string };

/**
 * Tiruan DB kecil dengan semantik upsert PostgREST: baris baru memakai default kolom (points = 0);
 * baris yang sudah ada hanya ditimpa kolom yang DIKIRIM. `noPointsColumn` = sebelum migrasi 0043.
 */
function db(opts: { existing?: Waiver; noPointsColumn?: boolean } = {}) {
  const waivers = new Map<string, Waiver>();
  if (opts.existing) waivers.set(`${opts.existing.employee_id}|${opts.existing.period_id}`, { ...opts.existing });
  const colErr = { message: 'column late_penalty_waivers.points does not exist' };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: HRD } } }) },
    from(table: string) {
      if (table === 'employees') {
        return { select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({
          data: v === HRD ? { role: 'hrd', is_hrd_admin: false, hrd_sections: null } : { name: 'Sari' },
        }) }) }) };
      }
      if (table === 'periods') {
        return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: P } }) }) }) }) };
      }
      if (table === 'late_penalty_waivers') {
        const upsert = (row: Partial<Waiver>) => {
          const run = (cols?: string) => {
            if (opts.noPointsColumn && ('points' in row || cols?.includes('points'))) return { data: null, error: colErr };
            const key = `${row.employee_id}|${row.period_id}`;
            const prev = waivers.get(key);
            const next = { ...(prev ?? { points: 0 }), ...row } as Waiver;
            waivers.set(key, next);
            return { data: cols ? next : null, error: null };
          };
          return {
            select: (cols: string) => ({ maybeSingle: async () => run(cols) }),
            then: (f: (v: unknown) => unknown) => Promise.resolve(run()).then(f),
          };
        };
        return {
          upsert,
          delete: () => ({ eq: (_a: string, e: string) => ({ eq: async (_b: string, p: string) => { waivers.delete(`${e}|${p}`); return { error: null }; } }) }),
        };
      }
      throw new Error('tabel tak terduga: ' + table);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(createClient).mockResolvedValue(client as any);
  return { stored: () => waivers.get(`${EMP}|${P}`) };
}

const lastLog = () => vi.mocked(logHrdAction).mock.calls.at(-1)?.[0];

beforeEach(() => { vi.clearAllMocks(); });

describe('setLateWaiver — potongan 0 benar-benar tersimpan', () => {
  it('BUG: potongan −7 diubah ke 0 → tersimpan 0, Skor 360° diterapkan ulang', async () => {
    const d = db({ existing: { employee_id: EMP, period_id: P, reason: 'telat input', points: 7, set_by: HRD } });
    const r = await setLateWaiver({ employeeId: EMP, reason: 'Sakit, ada surat dokter', points: 0 });
    expect(r).toEqual({ ok: true });
    expect(d.stored()?.points).toBe(0);
    expect(d.stored()?.reason).toBe('Sakit, ada surat dokter');
    expect(refreshLatePenalties).toHaveBeenCalledWith(P, [EMP]);
    expect(lastLog()).toMatchObject({ action: 'late_penalty.waive', meta: { points: 0 } });
  });

  it('menetapkan 0 untuk pertama kali tetap berfungsi', async () => {
    const d = db();
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Cuti melahirkan', points: 0 })).toEqual({ ok: true });
    expect(d.stored()?.points).toBe(0);
    expect(lastLog()).toMatchObject({ action: 'late_penalty.waive', meta: { points: 0 } });
  });

  it('mengubah dari 0 ke nilai lain tetap berfungsi', async () => {
    const d = db({ existing: { employee_id: EMP, period_id: P, reason: 'Cuti', points: 0, set_by: HRD } });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Ternyata tidak cuti', points: 5 })).toEqual({ ok: true });
    expect(d.stored()?.points).toBe(5);
    expect(lastLog()).toMatchObject({ action: 'late_penalty.set', meta: { points: 5 } });
    expect(lastLog()?.summary).toContain('−5');
  });

  it('mengubah dari nilai lain ke nilai lain tetap berfungsi (−7 → −2)', async () => {
    const d = db({ existing: { employee_id: EMP, period_id: P, reason: 'a', points: 7, set_by: HRD } });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'koreksi nilai', points: 2 })).toEqual({ ok: true });
    expect(d.stored()?.points).toBe(2);
    expect(lastLog()).toMatchObject({ action: 'late_penalty.set', meta: { points: 2 } });
  });

  it('Log Aktivitas mencatat nilai yang tersimpan di database', async () => {
    const d = db({ existing: { employee_id: EMP, period_id: P, reason: 'a', points: 7, set_by: HRD } });
    await setLateWaiver({ employeeId: EMP, reason: 'Sakit', points: 0 });
    const log = lastLog();
    expect(log?.meta).toEqual({ reason: 'Sakit', points: d.stored()?.points });
    expect(log?.meta).toEqual({ reason: 'Sakit', points: 0 });
    expect(log?.summary).toContain('Mengecualikan');
  });

  it('mengembalikan ke otomatis (alasan kosong) tetap menghapus penetapan', async () => {
    const d = db({ existing: { employee_id: EMP, period_id: P, reason: 'a', points: 7, set_by: HRD } });
    expect(await setLateWaiver({ employeeId: EMP, reason: null })).toEqual({ ok: true });
    expect(d.stored()).toBeUndefined();
    expect(lastLog()).toMatchObject({ action: 'late_penalty.unwaive', meta: { reason: null, points: null } });
  });
});

describe('setLateWaiver — database sebelum migrasi 0043 (tanpa kolom points)', () => {
  it('menetapkan 0 tetap berfungsi (pengecualian penuh = arti satu-satunya sebelum 0043)', async () => {
    const d = db({ noPointsColumn: true });
    expect(await setLateWaiver({ employeeId: EMP, reason: 'Sakit', points: 0 })).toEqual({ ok: true });
    expect(d.stored()?.reason).toBe('Sakit');
    expect(lastLog()).toMatchObject({ action: 'late_penalty.waive', meta: { points: 0 } });
  });

  it('menetapkan nilai selain 0 → pesan perlu migrasi (seperti sebelumnya)', async () => {
    db({ noPointsColumn: true });
    const r = await setLateWaiver({ employeeId: EMP, reason: 'Sakit', points: 5 });
    expect(r).toEqual({ ok: false, error: 'Mengubah nilai potongan (selain 0) memerlukan migrasi database 0043 — hubungi admin sistem.' });
    expect(logHrdAction).not.toHaveBeenCalled();
  });
});
