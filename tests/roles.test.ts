import { describe, it, expect } from 'vitest';
import { canAdmin, canCrossReview, canCoordinate, isHrdDept } from '@/lib/auth/roles';

describe('canAdmin — gerbang fitur HRD (role hrd ATAU grant is_hrd_admin)', () => {
  it('true untuk posisi hrd', () => {
    expect(canAdmin({ role: 'hrd' })).toBe(true);
  });
  it('true untuk non-hrd yang diberi grant is_hrd_admin', () => {
    expect(canAdmin({ role: 'spv', is_hrd_admin: true })).toBe(true);
    expect(canAdmin({ role: 'employee', is_hrd_admin: true })).toBe(true);
  });
  it('false untuk non-hrd tanpa grant', () => {
    expect(canAdmin({ role: 'spv' })).toBe(false);
    expect(canAdmin({ role: 'employee', is_hrd_admin: false })).toBe(false);
    expect(canAdmin({ role: 'direksi' })).toBe(false);
  });
  it('false untuk null/undefined (tak ada baris pegawai)', () => {
    expect(canAdmin(null)).toBe(false);
    expect(canAdmin(undefined)).toBe(false);
    expect(canAdmin({})).toBe(false);
  });
});

describe('canCrossReview / canCoordinate — grant sempit (tak menyalakan is_hrd)', () => {
  it('bergantung murni pada flag grant-nya', () => {
    expect(canCrossReview({ is_cross_reviewer: true })).toBe(true);
    expect(canCrossReview({ role: 'hrd' })).toBe(false); // hrd penuh ≠ cross-reviewer otomatis
    expect(canCoordinate({ is_coordinator: true })).toBe(true);
    expect(canCoordinate({ role: 'spv' })).toBe(false);
    expect(canCrossReview(null)).toBe(false);
    expect(canCoordinate(undefined)).toBe(false);
  });
});

describe('isHrdDept — grant sensitif hanya utk divisi HRD (dept diawali "HRD")', () => {
  it('true untuk divisi berawalan HRD (case & spasi toleran)', () => {
    expect(isHrdDept('HRD')).toBe(true);
    expect(isHrdDept('HRD-GA')).toBe(true);
    expect(isHrdDept('hrd-ga')).toBe(true);
    expect(isHrdDept('  HRD  ')).toBe(true);
  });
  it('false untuk divisi lain / kosong', () => {
    expect(isHrdDept('Sales')).toBe(false);
    expect(isHrdDept('Finance')).toBe(false);
    expect(isHrdDept('')).toBe(false);
    expect(isHrdDept(null)).toBe(false);
    expect(isHrdDept(undefined)).toBe(false);
  });
});
