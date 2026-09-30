import { describe, it, expect } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext — cegah open redirect', () => {
  it('terima jalur internal', () => {
    expect(safeNext('/penilaian')).toBe('/penilaian');
    expect(safeNext('/auth/perbarui-sandi')).toBe('/auth/perbarui-sandi');
    expect(safeNext('/laporan?tab=a')).toBe('/laporan?tab=a');
  });
  it('tolak alamat eksternal & bentuk samaran', () => {
    for (const v of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/\tevil', '/a\\b', '', null, undefined]) {
      expect(safeNext(v)).toBe('/');
    }
  });
});
