import { describe, it, expect } from 'vitest';
import {
  fmtDateId, periodMonthsText, nextPeriodLabel, methodText, defaultPaPdfSettings, resolvePaPdfSettings,
  defaultFollowRows, classifyQualQuestions, pdfFileName, sectionNumbers,
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
  it('nama berkas seperti paket HRD, tanpa karakter terlarang', () => {
    expect(pdfFileName('Supply Chain', 'Adistya Dwi', 'Q3 2026')).toBe('Supply Chain - Adistya Dwi - Q3 2026.pdf');
    expect(pdfFileName(null, 'A/B "C"', 'Q3 2026')).toBe('A B C - Q3 2026.pdf');
  });
  it('nomor bagian bergeser bila periode tanpa 360°', () => {
    expect(sectionNumbers(true)).toMatchObject({ score: 1, qual: 2, aspects: 3, narr: 4, plan: 5, follow: 6, comment: 7, sign: 8 });
    expect(sectionNumbers(false)).toMatchObject({ score: 1, qual: 0, plan: 2, follow: 3, comment: 4, sign: 5 });
  });
});

describe('pa-pdf: pengaturan periode', () => {
  it('bawaan Q3 2026 sama dengan templat HRD', () => {
    const s = defaultPaPdfSettings('2026-09-30', 'Q4 2026');
    expect(s.reportDate).toBe('2026-10-12');
    expect(s.rows.map((r) => r.tenggat)).toEqual([
      '16—20 Oktober 2026', '21—27 Oktober 2026', 'Mulai 10 November 2026, setiap dua minggu', 'November sampai Desember 2026',
    ]);
    expect(s.rows[1]).toMatchObject({ aksi: 'Sesi empat mata, lalu isi bagian 5 bersama atasan', target: 'Prioritas dan rencana pengembangan Q4 2026 disepakati' });
  });
  it('bawaan Q4 melintasi tahun; rujukan bagian mengikuti nomor', () => {
    const s = defaultPaPdfSettings('2026-12-31', 'Q1 2027', { plan: 2, comment: 4 });
    expect(s.reportDate).toBe('2027-01-12');
    expect(s.rows[3].tenggat).toBe('Februari sampai Maret 2027');
    expect(s.rows[1].selesai).toContain('Bagian 2 dan 4');
  });
  it('isian tersimpan dipakai; rusak/kosong → bawaan', () => {
    const rows = defaultFollowRows('2026-09-30', 'Q4 2026').slice(0, 2);
    const stored = { reportDate: '2026-10-15', rows };
    expect(resolvePaPdfSettings(stored, '2026-09-30', 'Q4 2026')).toEqual({ settings: stored, isDefault: false });
    expect(resolvePaPdfSettings(null, '2026-09-30', 'Q4 2026').isDefault).toBe(true);
    expect(resolvePaPdfSettings({ reportDate: '2026-10-15', rows: [] }, '2026-09-30', 'Q4 2026').isDefault).toBe(true);
    expect(resolvePaPdfSettings({ reportDate: '2026-10-15', rows: [{ aksi: '' }] }, '2026-09-30', 'Q4 2026').isDefault).toBe(true);
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
