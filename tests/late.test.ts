import { describe, it, expect } from 'vitest';
import {
  LATE_PENALTY_360, submitTimingOf, isPenalizableLate, latePenaltyOf, apply360Penalty,
  isPastDeadline, formatWib, toWibInput, type LateCandidate,
} from '@/lib/late';

// Deadline 30 Sep 2026 17:00 WIB = 10:00 UTC.
const DL = '2026-09-30T10:00:00.000Z';

const base: LateCandidate = {
  firstSubmittedAt: '2026-09-30T11:00:00+00:00', // 1 jam sesudah deadline
  status: 'submitted', forcedByHrd: false, mandatory: true, isAdhoc: false,
  mappingCreatedAt: '2026-09-01T00:00:00Z',
};

describe('submitTimingOf', () => {
  it('none bila belum terkirim atau tanpa deadline', () => {
    expect(submitTimingOf(null, DL)).toBe('none');
    expect(submitTimingOf('2026-09-30T09:00:00Z', null)).toBe('none');
  });
  it('tepat pada deadline = on_time; sesudahnya = late', () => {
    expect(submitTimingOf(DL, DL)).toBe('on_time');
    expect(submitTimingOf('2026-09-30T10:00:01Z', DL)).toBe('late');
    expect(submitTimingOf('2026-09-29T23:00:00Z', DL)).toBe('on_time');
  });
  it('membandingkan instan, bukan teks (offset zona waktu berbeda)', () => {
    // 16:30 WIB = 09:30 UTC → sebelum deadline meski teksnya "lebih besar".
    expect(submitTimingOf('2026-09-30T16:30:00+07:00', DL)).toBe('on_time');
  });
});

describe('isPenalizableLate', () => {
  it('penilaian wajib terkirim sesudah deadline → terhitung', () => {
    expect(isPenalizableLate(base, DL)).toBe(true);
  });
  it('tepat waktu / tanpa deadline / belum terkirim → tidak', () => {
    expect(isPenalizableLate({ ...base, firstSubmittedAt: '2026-09-30T09:00:00Z' }, DL)).toBe(false);
    expect(isPenalizableLate(base, null)).toBe(false);
    expect(isPenalizableLate({ ...base, status: 'draft' }, DL)).toBe(false);
  });
  it('dikecualikan: opsional, ad-hoc, paksa selesai HRD', () => {
    expect(isPenalizableLate({ ...base, mandatory: false }, DL)).toBe(false);
    expect(isPenalizableLate({ ...base, isAdhoc: true }, DL)).toBe(false);
    expect(isPenalizableLate({ ...base, forcedByHrd: true }, DL)).toBe(false);
  });
  it('pemetaan dibuat sesudah deadline → tidak (tak mungkin tepat waktu)', () => {
    expect(isPenalizableLate({ ...base, mappingCreatedAt: '2026-10-01T00:00:00Z' }, DL)).toBe(false);
    expect(isPenalizableLate({ ...base, mappingCreatedAt: null }, DL)).toBe(true);
  });
});

describe('latePenaltyOf — flat, sekali per periode', () => {
  it('0 terlambat → 0; ≥1 → 3 (tidak dikali jumlah)', () => {
    expect(LATE_PENALTY_360).toBe(3);
    expect(latePenaltyOf(0, false)).toBe(0);
    expect(latePenaltyOf(1, false)).toBe(3);
    expect(latePenaltyOf(7, false)).toBe(3);
  });
  it('pengecualian HRD → 0', () => {
    expect(latePenaltyOf(2, true)).toBe(0);
  });
});

describe('apply360Penalty', () => {
  it('mengurangi, 2 desimal, lantai 0, null tetap null', () => {
    expect(apply360Penalty(82.47, 3)).toBe(79.47);
    expect(apply360Penalty(80, 0)).toBe(80);
    expect(apply360Penalty(2, 3)).toBe(0);
    expect(apply360Penalty(null, 3)).toBeNull();
  });
});

describe('waktu WIB', () => {
  it('isPastDeadline', () => {
    expect(isPastDeadline(DL, Date.parse('2026-09-30T10:00:01Z'))).toBe(true);
    expect(isPastDeadline(DL, Date.parse(DL))).toBe(false);
    expect(isPastDeadline(null)).toBe(false);
  });
  it('formatWib & toWibInput (UTC → WIB, lintas tanggal)', () => {
    expect(formatWib(DL)).toBe('30 Sep 2026, 17:00 WIB');
    expect(formatWib('2026-12-31T20:30:00Z')).toBe('1 Jan 2027, 03:30 WIB');
    expect(formatWib(null)).toBe('—');
    expect(toWibInput(DL)).toBe('2026-09-30T17:00');
    expect(toWibInput(null)).toBe('');
  });
});
