import { describe, expect, it } from 'vitest';
import { GUIDES, guidesFor } from '@/lib/panduan';

describe('guidesFor — panduan di Akun Saya mengikuti izin terkini', () => {
  it('pegawai biasa → 2A', () => {
    expect(guidesFor({ role: 'employee' }, false)).toEqual(['2A']);
  });

  it('pegawai berizin Koordinator → 2C saja (sudah mencakup tugas pegawai)', () => {
    expect(guidesFor({ role: 'employee', is_coordinator: true }, false)).toEqual(['2C']);
  });

  it('izin Koordinator dicabut → kembali 2A', () => {
    expect(guidesFor({ role: 'employee', is_coordinator: false }, false)).toEqual(['2A']);
  });

  it('SPV → 2B; Direksi → 2E', () => {
    expect(guidesFor({ role: 'spv' }, false)).toEqual(['2B']);
    expect(guidesFor({ role: 'direksi' }, false)).toEqual(['2E']);
  });

  it('flag koordinator pada SPV diabaikan (sama dengan gerbang menu)', () => {
    expect(guidesFor({ role: 'spv', is_coordinator: true }, false)).toEqual(['2B']);
  });

  it('HRD posisi atau pegawai berizin HRD Admin (penuh) → 2D saja', () => {
    expect(guidesFor({ role: 'hrd' }, false)).toEqual(['2D']);
    expect(guidesFor({ role: 'employee', is_hrd_admin: true }, false)).toEqual(['2D']);
    expect(guidesFor({ role: 'employee', is_hrd_admin: true, hrd_sections: [] }, false)).toEqual(['2D']);
  });

  it('SPV berizin HRD Admin → 2D + 2B', () => {
    expect(guidesFor({ role: 'spv', is_hrd_admin: true }, false)).toEqual(['2D', '2B']);
  });

  it('HRD Admin berizin Koordinator → 2D + 2C', () => {
    expect(guidesFor({ role: 'employee', is_hrd_admin: true, is_coordinator: true }, false)).toEqual(['2D', '2C']);
  });

  it('HRD terbatas → + 2F', () => {
    expect(guidesFor({ role: 'employee', is_hrd_admin: true, hrd_sections: ['ekspor'] }, false)).toEqual(['2D', '2F']);
  });

  it('pemegang akses halaman → + 2F', () => {
    expect(guidesFor({ role: 'employee' }, true)).toEqual(['2A', '2F']);
    expect(guidesFor({ role: 'spv' }, true)).toEqual(['2B', '2F']);
  });

  it('data pegawai tak terbaca → 2A (aman)', () => {
    expect(guidesFor(null, false)).toEqual(['2A']);
  });

  it('semua tautan = halaman Notion', () => {
    for (const g of Object.values(GUIDES)) expect(g.url).toMatch(/^https:\/\/www\.notion\.so\/[0-9a-f]{32}$/);
  });
});
