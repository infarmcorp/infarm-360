import { describe, it, expect } from 'vitest';
import {
  fmtDateId, periodMonthsText, nextPeriodLabel, methodText, defaultPaPdfSettings, resolvePaPdfSettings,
  followUpRows, classifyQualQuestions, cssString, pageCss,
} from '@/lib/pa-pdf';

describe('pa-pdf: tanggal & label', () => {
  it('format tanggal Indonesia', () => {
    expect(fmtDateId('2026-10-12')).toBe('12 Oktober 2026');
  });
  it('rentang bulan periode', () => {
    expect(periodMonthsText('2026-07-01', '2026-09-30')).toBe('Juli—September 2026');
    expect(periodMonthsText('2026-11-01', '2027-01-31')).toBe('November 2026—Januari 2027');
  });
  it('periode berikutnya', () => {
    expect(nextPeriodLabel('Q3 2026')).toBe('Q4 2026');
    expect(nextPeriodLabel('Q4 2026')).toBe('Q1 2027');
    expect(nextPeriodLabel('Semester 1')).toBe('Periode Berikutnya');
  });
  it('metode penilaian', () => {
    expect(methodText(true, true)).toBe('KPI dan Umpan Balik 360°');
    expect(methodText(false, true)).toBe('Umpan Balik 360°');
    expect(methodText(true, false)).toBe('KPI');
  });
});

describe('pa-pdf: pengaturan periode', () => {
  it('bawaan Q3 2026 sama dengan templat HRD', () => {
    expect(defaultPaPdfSettings('2026-09-30')).toEqual({
      reportDate: '2026-10-12',
      tenggat: ['16—20 Oktober 2026', '21—27 Oktober 2026', 'Mulai 10 November 2026, setiap dua minggu', 'November sampai Desember 2026'],
    });
  });
  it('bawaan Q4 melintasi tahun', () => {
    const s = defaultPaPdfSettings('2026-12-31');
    expect(s.reportDate).toBe('2027-01-12');
    expect(s.tenggat[3]).toBe('Februari sampai Maret 2027');
  });
  it('isian tersimpan dipakai; rusak/kosong → bawaan', () => {
    const stored = { reportDate: '2026-10-15', tenggat: ['a', 'b', 'c', 'd'] };
    expect(resolvePaPdfSettings(stored, '2026-09-30')).toEqual({ settings: stored, isDefault: false });
    expect(resolvePaPdfSettings(null, '2026-09-30').isDefault).toBe(true);
    expect(resolvePaPdfSettings({ reportDate: 'x', tenggat: [] }, '2026-09-30').isDefault).toBe(true);
  });
  it('baris tindak lanjut memakai tenggat & periode berikutnya', () => {
    const rows = followUpRows('Q4 2026', ['t1', 't2', 't3', 't4']);
    expect(rows).toHaveLength(4);
    expect(rows[1].target).toContain('Q4 2026');
    expect(rows.map((r) => r.tenggat)).toEqual(['t1', 't2', 't3', 't4']);
  });
});

describe('pa-pdf: pertanyaan kualitatif', () => {
  it('kekuatan & perlu dikembangkan dipetakan menurut kata kunci', () => {
    const q = [
      'Apa yang menjadi kekuatan utama orang ini dalam pekerjaan atau dalam tim?',
      'Apa satu hal yang perlu dikembangkan untuk performa atau kontribusi orang ini lebih baik lagi?',
      'Pesan lain?',
    ];
    expect(classifyQualQuestions(q)).toEqual({ strength: q[0], growth: q[1], others: [q[2]] });
  });
  it('tanpa kata kunci → semua jadi blok terpisah', () => {
    expect(classifyQualQuestions(['A?', 'B?'])).toEqual({ strength: null, growth: null, others: ['A?', 'B?'] });
  });
});

describe('pa-pdf: CSS kepala/kaki halaman', () => {
  it('string CSS tak bisa menutup kutip atau tag style', () => {
    const s = cssString('Nama "aneh"\\ </style><script>');
    expect(s.startsWith('"') && s.endsWith('"')).toBe(true);
    expect(s).not.toContain('</style>');
    expect(s.slice(1, -1)).not.toMatch(/(^|[^\\])"/);
  });
  it('@page memuat nomor halaman & menyembunyikan kepala di halaman pertama', () => {
    const css = pageCss('Laporan Performance Appraisal Q3 2026', 'Pegawai 046');
    expect(css).toContain('counter(pages)');
    expect(css).toContain('@page :first');
    expect(css).toContain('"Pegawai 046"');
  });
});
