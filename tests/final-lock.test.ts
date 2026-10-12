import { describe, it, expect } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';
import {
  finalizedEmployees, finalLockError, finalLockErrorForMonths, periodLockError,
  finalLockMsg, periodFinalLockMsg, FINAL_CHECK_FAILED_MSG,
} from '@/lib/final-lock';

// Helper kunci laporan Final (gelombang 2b, poin 1) — dipakai semua jalur yang bisa mengubah angka.
type Admin = Parameters<typeof finalizedEmployees>[0];
const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const C = 'cccccccc-0000-0000-0000-000000000003';

function db(opts: { failOn?: string[] } = {}) {
  return fakeDb({
    final_reports: [
      { employee_id: A, period_id: 'q3', status: 'finalized' },
      { employee_id: B, period_id: 'q3', status: 'in_review' },
      { employee_id: C, period_id: 'q2', status: 'finalized' },
    ],
    employees: [{ id: A, name: 'Andi' }, { id: B, name: 'Budi' }, { id: C, name: 'Citra' }],
    period_months: [
      { period_id: 'q3', ym: '2026-07' }, { period_id: 'q3', ym: '2026-08' }, { period_id: 'q3', ym: '2026-09' },
      { period_id: 'q2', ym: '2026-06' }, { period_id: 'q2', ym: '2026-07' }, // bulan dipakai bersama
    ],
  }, opts) as unknown as Admin;
}

describe('finalizedEmployees', () => {
  it('hanya status finalized di periode itu', async () => {
    expect([...await finalizedEmployees(db(), 'q3')]).toEqual([A]);
    expect([...await finalizedEmployees(db(), 'q3', [A, B])]).toEqual([A]);
    expect([...await finalizedEmployees(db(), 'q3', [B])]).toEqual([]);
    expect([...await finalizedEmployees(db(), 'q3', [])]).toEqual([]);
  });
  it('gagal baca → melempar (bukan dianggap kosong)', async () => {
    await expect(finalizedEmployees(db({ failOn: ['final_reports'] }), 'q3')).rejects.toThrow();
  });
});

describe('finalLockError — perubahan untuk pegawai tertentu', () => {
  it('pegawai belum Final → boleh (null)', async () => {
    expect(await finalLockError(db(), 'q3', [B])).toBeNull();
  });
  it('pegawai Final → pesan baku dengan namanya', async () => {
    expect(await finalLockError(db(), 'q3', [A, B])).toBe('Laporan Andi sudah Final. Buka Kembali laporannya dulu untuk mengubah data ini.');
  });
  it('gagal baca → ditolak (gagal tertutup)', async () => {
    expect(await finalLockError(db({ failOn: ['final_reports'] }), 'q3', [B])).toBe(FINAL_CHECK_FAILED_MSG);
  });
});

describe('finalLockErrorForMonths — KPI per bulan, lintas periode', () => {
  it('Final di periode LAIN yang memakai bulan yang sama → ditolak', async () => {
    // Citra Final di Q2; Juli 2026 dipakai Q2 & Q3.
    expect(await finalLockErrorForMonths(db(), [C], ['2026-07'])).toBe(finalLockMsg(['Citra']));
  });
  it('bulan yang tak dipakai periode Final pegawai itu → boleh', async () => {
    expect(await finalLockErrorForMonths(db(), [C], ['2026-08'])).toBeNull();
    expect(await finalLockErrorForMonths(db(), [B], ['2026-07'])).toBeNull();
  });
  it('gagal baca → ditolak', async () => {
    expect(await finalLockErrorForMonths(db({ failOn: ['period_months'] }), [B], ['2026-07'])).toBe(FINAL_CHECK_FAILED_MSG);
  });
});

describe('periodLockError — pengaturan seluruh periode', () => {
  const countClient = (count: number | null, error: unknown = null) => ({
    from: () => {
      const q = { select: () => q, eq: () => q, then: (f: (v: unknown) => unknown) => Promise.resolve({ count, error }).then(f) };
      return q;
    },
  }) as unknown as Admin;
  it('ada laporan Final → pesan dengan jumlahnya', async () => {
    expect(await periodLockError(countClient(3), 'q3', 'bobot penilai')).toBe(periodFinalLockMsg(3, 'bobot penilai'));
    expect(periodFinalLockMsg(3, 'bobot penilai')).toBe('Sudah ada 3 laporan Final di periode ini. Buka Kembali laporan-laporan itu dulu untuk mengubah bobot penilai.');
  });
  it('belum ada laporan Final → boleh', async () => {
    expect(await periodLockError(countClient(0), 'q3', 'x')).toBeNull();
  });
  it('gagal baca → ditolak', async () => {
    expect(await periodLockError(countClient(null, { message: 'timeout' }), 'q3', 'x')).toBe(FINAL_CHECK_FAILED_MSG);
  });
});
