import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canSection, isFullHrd, HRD_SECTIONS } from '@/lib/auth/roles';

const { cookieSet, redirectMock } = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  redirectMock: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: cookieSet })) }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import { setHrdMode } from '@/app/(app)/mode-actions';

describe('canSection — akses granular bagian admin HRD', () => {
  it('non-HRD selalu false, berapa pun hrd_sections', () => {
    expect(canSection({ role: 'spv' }, 'pegawai')).toBe(false);
    expect(canSection({ role: 'employee', hrd_sections: ['pegawai'] }, 'pegawai')).toBe(false);
    expect(canSection({ role: 'direksi', hrd_sections: null }, 'dashboard')).toBe(false);
    expect(canSection(null, 'pegawai')).toBe(false);
    expect(canSection(undefined, 'pegawai')).toBe(false);
  });

  it('hrd_sections null/undefined/kosong → akses penuh semua bagian', () => {
    for (const s of HRD_SECTIONS) {
      expect(canSection({ role: 'hrd' }, s)).toBe(true);
      expect(canSection({ role: 'hrd', hrd_sections: null }, s)).toBe(true);
      expect(canSection({ role: 'hrd', hrd_sections: [] }, s)).toBe(true);
      expect(canSection({ role: 'spv', is_hrd_admin: true, hrd_sections: [] }, s)).toBe(true);
    }
  });

  it('hrd_sections berisi daftar → hanya bagian tercantum', () => {
    const m = { role: 'hrd', hrd_sections: ['pegawai', 'laporan'] };
    expect(canSection(m, 'pegawai')).toBe(true);
    expect(canSection(m, 'laporan')).toBe(true);
    expect(canSection(m, 'periode')).toBe(false);
    expect(canSection(m, 'audit')).toBe(false);
  });

  it('berlaku sama untuk role hrd dan grant is_hrd_admin', () => {
    const grant = { role: 'employee', is_hrd_admin: true, hrd_sections: ['ekspor'] };
    expect(canSection(grant, 'ekspor')).toBe(true);
    expect(canSection(grant, 'pegawai')).toBe(false);
  });

  it('is_hrd_admin false + role non-hrd → false walau daftar memuat bagian', () => {
    expect(canSection({ role: 'spv', is_hrd_admin: false, hrd_sections: ['pegawai'] }, 'pegawai')).toBe(false);
  });

  it('daftar berisi kunci tak dikenal saja → tidak penuh, semua bagian ditolak', () => {
    const m = { role: 'hrd', hrd_sections: ['tidak-ada'] };
    for (const s of HRD_SECTIONS) expect(canSection(m, s)).toBe(false);
  });
});

describe('isFullHrd — HRD tanpa pembatasan hrd_sections', () => {
  it('true untuk HRD/grant dengan hrd_sections null/undefined/kosong', () => {
    expect(isFullHrd({ role: 'hrd' })).toBe(true);
    expect(isFullHrd({ role: 'hrd', hrd_sections: null })).toBe(true);
    expect(isFullHrd({ role: 'hrd', hrd_sections: [] })).toBe(true);
    expect(isFullHrd({ role: 'spv', is_hrd_admin: true })).toBe(true);
  });

  it('false bila hrd_sections berisi (bahkan berisi SEMUA bagian)', () => {
    expect(isFullHrd({ role: 'hrd', hrd_sections: ['pegawai'] })).toBe(false);
    expect(isFullHrd({ role: 'hrd', hrd_sections: [...HRD_SECTIONS] })).toBe(false);
  });

  it('false untuk non-HRD / null', () => {
    expect(isFullHrd({ role: 'spv' })).toBe(false);
    expect(isFullHrd({ role: 'direksi', hrd_sections: [] })).toBe(false);
    expect(isFullHrd(null)).toBe(false);
    expect(isFullHrd(undefined)).toBe(false);
  });
});

describe('setHrdMode — cookie hrd_mode + redirect ke "/"', () => {
  beforeEach(() => { cookieSet.mockClear(); redirectMock.mockClear(); });

  it.each(['admin', 'spv'] as const)('mode %s → set cookie lalu redirect "/"', async (mode) => {
    await expect(setHrdMode(mode)).rejects.toThrow('NEXT_REDIRECT:/');
    expect(cookieSet).toHaveBeenCalledTimes(1);
    expect(cookieSet).toHaveBeenCalledWith('hrd_mode', mode, { path: '/', sameSite: 'lax', httpOnly: false });
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('cookie di-set SEBELUM redirect', async () => {
    await setHrdMode('admin').catch(() => {});
    expect(cookieSet.mock.invocationCallOrder[0]).toBeLessThan(redirectMock.mock.invocationCallOrder[0]);
  });

  it('KARAKTERISASI: nilai mode tidak divalidasi di runtime (nilai di luar union ditulis apa adanya)', async () => {
    await setHrdMode('lain' as unknown as 'admin').catch(() => {});
    expect(cookieSet).toHaveBeenCalledWith('hrd_mode', 'lain', { path: '/', sameSite: 'lax', httpOnly: false });
  });
});
