import { describe, it, expect, vi } from 'vitest';
import { hasScoreDrift } from '@/lib/scoring';
import { isBackfilledPeriod, BACKFILL_LOCK_MSG } from '@/lib/backfill-guard';
import type { createAdminClient } from '@/lib/supabase/server';

type Admin = ReturnType<typeof createAdminClient>;

describe('hasScoreDrift — selisih ≥ 0.01 setelah pembulatan 2 desimal', () => {
  it('null di salah satu sisi → false', () => {
    expect(hasScoreDrift(null, 80)).toBe(false);
    expect(hasScoreDrift(80, null)).toBe(false);
    expect(hasScoreDrift(null, null)).toBe(false);
  });

  it('sama persis → false; beda 0.01 → true', () => {
    expect(hasScoreDrift(80, 80)).toBe(false);
    expect(hasScoreDrift(80.01, 80)).toBe(true);
    expect(hasScoreDrift(80, 80.01)).toBe(true);
  });

  it('beda di bawah resolusi pembulatan → false', () => {
    expect(hasScoreDrift(80.004, 80)).toBe(false);
    expect(hasScoreDrift(80.123, 80.12)).toBe(false);
  });

  it('membandingkan nilai TERBULAT, bukan selisih mentah', () => {
    // selisih mentah 0.001 tetapi melintasi batas .xx5 → dianggap berubah
    expect(hasScoreDrift(80.005, 80.004)).toBe(true);
    // selisih mentah 0.008 tetapi terbulat sama (80.01) → tidak berubah
    expect(hasScoreDrift(80.006, 80.014)).toBe(false);
  });

  it('pembulatan half-up via notasi eksponen (1.005 → 1.01, bukan 1.00)', () => {
    expect(hasScoreDrift(1.005, 1.01)).toBe(false);
    expect(hasScoreDrift(1.005, 1.0)).toBe(true);
  });

  it('stored berupa string numerik (kolom numeric) dikonversi Number()', () => {
    expect(hasScoreDrift(80.5, '80.50' as unknown as number)).toBe(false);
    expect(hasScoreDrift(80.5, '80.49' as unknown as number)).toBe(true);
  });

  it('0 bukan null → tetap dibandingkan', () => {
    expect(hasScoreDrift(0, 0)).toBe(false);
    expect(hasScoreDrift(0.01, 0)).toBe(true);
  });

  it('KARAKTERISASI: NaN pada live → true (NaN !== NaN)', () => {
    expect(hasScoreDrift(NaN, 80)).toBe(true);
    expect(hasScoreDrift(NaN, NaN)).toBe(true);
  });

  it('KARAKTERISASI: nilai sangat kecil (notasi eksponen, mis. 1e-7) → roundScore NaN → drift true', () => {
    // roundScore(1e-7) membangun string "1e-7e2" → Number() = NaN.
    expect(hasScoreDrift(1e-7, 0)).toBe(true);
  });
});

function adminWithCount(count: number | null) {
  const calls: { table?: string; select?: unknown[]; eq: [string, unknown][] } = { eq: [] };
  const builder = {
    select: vi.fn((...args: unknown[]) => { calls.select = args; return builder; }),
    eq: vi.fn((col: string, val: unknown) => { calls.eq.push([col, val]); return builder; }),
    then: (resolve: (v: { count: number | null; error: null }) => unknown) => resolve({ count, error: null }),
  };
  const admin = { from: vi.fn((t: string) => { calls.table = t; return builder; }) };
  return { admin: admin as unknown as Admin, calls };
}

describe('isBackfilledPeriod — periode hasil impor (score360.backfill) dikunci', () => {
  it('ada log score360.backfill untuk periode → true; query yang dikirim tepat', async () => {
    const { admin, calls } = adminWithCount(1);
    await expect(isBackfilledPeriod(admin, 'p-q1')).resolves.toBe(true);
    expect(calls.table).toBe('hrd_audit_log');
    expect(calls.select).toEqual(['*', { count: 'exact', head: true }]);
    expect(calls.eq).toEqual([['action', 'score360.backfill'], ['target_id', 'p-q1']]);
  });

  it('count > 1 → true', async () => {
    const { admin } = adminWithCount(3);
    await expect(isBackfilledPeriod(admin, 'p')).resolves.toBe(true);
  });

  it('count 0 → false', async () => {
    const { admin } = adminWithCount(0);
    await expect(isBackfilledPeriod(admin, 'p')).resolves.toBe(false);
  });

  it('count null (mis. query error) → true: gagal tertutup (gelombang 2b; dulu fail-open)', async () => {
    const { admin } = adminWithCount(null);
    await expect(isBackfilledPeriod(admin, 'p')).resolves.toBe(true);
  });

  it('pesan kunci baku menyebut impor resmi', () => {
    expect(BACKFILL_LOCK_MSG).toContain('hasil impor resmi');
  });
});
