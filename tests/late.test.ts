import { describe, it, expect } from 'vitest';
import {
  LATE_PENALTY_360, submitTimingOf, isPenalizableLate, latePenaltyOf, apply360Penalty,
  isPastDeadline, formatWib, toWibInput, ajuanPenaltyApplies, progressStatusOf, type LateCandidate,
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

// "now" dipakai untuk cek status draft/belum-mulai — sengaja SESUDAH deadline pada sebagian
// besar uji, kecuali disebut lain. Fungsi WAJIB diberi nowMs eksplisit (tak boleh diam-diam
// pakai Date.now() — hasil harus deterministik & tak berubah seiring jam berjalan).
const AFTER_DL = Date.parse('2026-09-30T12:00:00Z');  // 2 jam sesudah deadline
const BEFORE_DL = Date.parse('2026-09-30T09:00:00Z'); // 1 jam sebelum deadline

describe('isPenalizableLate — terkirim (submitted)', () => {
  it('penilaian wajib terkirim sesudah deadline → terhitung', () => {
    expect(isPenalizableLate(base, DL, AFTER_DL)).toBe(true);
  });
  it('terkirim tepat waktu → tidak, meski dicek lama sesudahnya', () => {
    expect(isPenalizableLate({ ...base, firstSubmittedAt: '2026-09-30T09:00:00Z' }, DL, AFTER_DL)).toBe(false);
  });
  it('tanpa deadline → tidak pernah terhitung', () => {
    expect(isPenalizableLate(base, null, AFTER_DL)).toBe(false);
  });
  it('AJUAN (opsional hasil permohonan disetujui HRD) ikut terhitung', () => {
    expect(isPenalizableLate({ ...base, mandatory: false, requested: true, firstSubmittedAt: '2026-09-30T11:00:00Z' }, DL, AFTER_DL)).toBe(true);
    expect(isPenalizableLate({ ...base, mandatory: false, requested: true, status: 'not_started', firstSubmittedAt: null }, DL, AFTER_DL)).toBe(true);
    // Ad-Hoc Mandiri lama tetap tidak, walau ditandai ajuan.
    expect(isPenalizableLate({ ...base, mandatory: false, requested: true, isAdhoc: true, firstSubmittedAt: '2026-09-30T11:00:00Z' }, DL, AFTER_DL)).toBe(false);
  });

  it('dikecualikan: opsional, ad-hoc, paksa selesai HRD', () => {
    expect(isPenalizableLate({ ...base, mandatory: false }, DL, AFTER_DL)).toBe(false);
    expect(isPenalizableLate({ ...base, isAdhoc: true }, DL, AFTER_DL)).toBe(false);
    expect(isPenalizableLate({ ...base, forcedByHrd: true }, DL, AFTER_DL)).toBe(false);
  });
  it('pemetaan dibuat sesudah deadline → tidak (tak mungkin tepat waktu)', () => {
    expect(isPenalizableLate({ ...base, mappingCreatedAt: '2026-10-01T00:00:00Z' }, DL, AFTER_DL)).toBe(false);
    expect(isPenalizableLate({ ...base, mappingCreatedAt: null }, DL, AFTER_DL)).toBe(true);
  });
});

/**
 * Sejak 2026-09-28: "belum selesai saat deadline" JUGA mencakup yang tak pernah mengirim
 * sama sekali (draft atau belum disentuh) — bukan cuma yang terlanjur kirim telat. Ini
 * menutup celah "diam-diam untung": dulu tak mengirim sama sekali tak kena potongan sama
 * sekali, sedangkan kirim telat 1 detik kena −3.
 */
describe('isPenalizableLate — draft / belum mulai (celah 2026-09-28)', () => {
  const draft = { ...base, status: 'draft', firstSubmittedAt: null };
  const notStarted = { ...base, status: 'not_started', firstSubmittedAt: null };

  it('draft & deadline SUDAH lewat → terhitung terlambat', () => {
    expect(isPenalizableLate(draft, DL, AFTER_DL)).toBe(true);
  });
  it('belum pernah disentuh (not_started) & deadline sudah lewat → terhitung terlambat juga', () => {
    expect(isPenalizableLate(notStarted, DL, AFTER_DL)).toBe(true);
  });
  it('draft tapi deadline BELUM lewat → belum terhitung (masih ada waktu)', () => {
    expect(isPenalizableLate(draft, DL, BEFORE_DL)).toBe(false);
  });
  it('tepat PADA detik deadline → belum terhitung (belum "lewat")', () => {
    expect(isPenalizableLate(draft, DL, Date.parse(DL))).toBe(false);
  });
  it('draft tapi opsional/ad-hoc/paksa-selesai → tetap tidak terhitung', () => {
    expect(isPenalizableLate({ ...draft, mandatory: false }, DL, AFTER_DL)).toBe(false);
    expect(isPenalizableLate({ ...draft, isAdhoc: true }, DL, AFTER_DL)).toBe(false);
    expect(isPenalizableLate({ ...draft, forcedByHrd: true }, DL, AFTER_DL)).toBe(false);
  });
  it('pemetaan dibuat sesudah deadline → tetap tidak terhitung meski belum mulai', () => {
    expect(isPenalizableLate({ ...notStarted, mappingCreatedAt: '2026-10-01T00:00:00Z' }, DL, AFTER_DL)).toBe(false);
  });
});

describe('latePenaltyOf — flat, sekali per periode', () => {
  it('0 terlambat → 0; ≥1 → 3 otomatis (tidak dikali jumlah)', () => {
    expect(LATE_PENALTY_360).toBe(3);
    expect(latePenaltyOf(0)).toBe(0);
    expect(latePenaltyOf(1)).toBe(3);
    expect(latePenaltyOf(7)).toBe(3);
  });
  it('nilai yang DITETAPKAN HRD menggantikan otomatis (0 = dikecualikan)', () => {
    expect(latePenaltyOf(2, 0)).toBe(0);
    expect(latePenaltyOf(2, 1.5)).toBe(1.5);
    expect(latePenaltyOf(0, 2)).toBe(2);     // keputusan eksplisit HRD tetap berlaku
    expect(latePenaltyOf(2, null)).toBe(3);  // tanpa campur tangan → otomatis
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

describe('ajuanPenaltyApplies — aturan ajuan berlaku Q3 2026 dst.', () => {
  it('periode mulai sebelum 1 Jul 2026 → tidak berlaku; sesudahnya → berlaku', () => {
    expect(ajuanPenaltyApplies('2026-04-01')).toBe(false); // Q2 2026
    expect(ajuanPenaltyApplies('2026-07-01')).toBe(true);  // Q3 2026
    expect(ajuanPenaltyApplies('2027-01-01')).toBe(true);
    expect(ajuanPenaltyApplies(null)).toBe(false);
  });
});

describe('progressStatusOf (BR-07)', () => {
  it('belum ada baris → Belum Mulai; draf → Sedang Diisi', () => {
    expect(progressStatusOf(null, null, DL)).toBe('not_started');
    expect(progressStatusOf(undefined, null, DL)).toBe('not_started');
    expect(progressStatusOf('draft', null, DL)).toBe('in_progress');
  });
  it('terkirim: dibandingkan waktu kirim PERTAMA vs deadline', () => {
    expect(progressStatusOf('submitted', '2026-09-30T09:00:00Z', DL)).toBe('on_time');
    expect(progressStatusOf('submitted', DL, DL)).toBe('on_time');
    expect(progressStatusOf('submitted', '2026-09-30T10:00:01Z', DL)).toBe('late');
  });
  it('tanpa deadline / tanpa waktu kirim → tak bisa terlambat', () => {
    expect(progressStatusOf('submitted', '2026-10-05T00:00:00Z', null)).toBe('on_time');
    expect(progressStatusOf('submitted', null, DL)).toBe('on_time');
  });
  it('Paksa Selesai HRD tak pernah tercatat terlambat', () => {
    expect(progressStatusOf('submitted', '2026-10-05T00:00:00Z', DL, true)).toBe('on_time');
  });
});

describe('penilaian dibatalkan validitasnya (0046)', () => {
  it('progressStatusOf → invalidated', () => {
    expect(progressStatusOf('invalidated', '2026-10-05T00:00:00Z', DL)).toBe('invalidated');
  });
  it('tak pernah terhitung terlambat', () => {
    expect(isPenalizableLate({ ...base, status: 'invalidated' }, DL, Date.parse('2026-10-10T00:00:00Z'))).toBe(false);
  });
});
