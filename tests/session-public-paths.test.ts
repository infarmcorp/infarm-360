import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type SetAll = (c: { name: string; value: string; options?: object }[], h: Record<string, string>) => void;
const auth = { getClaims: vi.fn(), getUser: vi.fn() };
let capturedSetAll: SetAll | null = null;
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: SetAll } }) => {
    capturedSetAll = opts.cookies.setAll;
    return { auth };
  },
}));

import { isPublicPath, updateSession } from '@/lib/supabase/middleware';

/**
 * Daftar route tanpa cek sesi di proxy. Menambah route publik = keputusan keamanan:
 * pastikan route itu tak mengembalikan data pegawai, atau memeriksa login/haknya sendiri.
 */
describe('isPublicPath', () => {
  it('route publik yang disengaja', () => {
    for (const p of ['/', '/login', '/auth/callback', '/auth/signout', '/panduan/panduan-hrd.pdf',
      '/api/cron/release-email', '/api/version']) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it('/api/version dicocokkan persis, bukan awalan', () => {
    for (const p of ['/api/version/x', '/api/versions', '/api/version-data']) expect(isPublicPath(p), p).toBe(false);
  });

  it('halaman & API lain tetap wajib sesi', () => {
    for (const p of ['/penilaian', '/penilaian/abc', '/admin/laporan', '/laporan/abc', '/kpi', '/akun',
      '/review-hasil', '/pengembangan', '/api', '/api/other', '/maintenance']) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});

describe('updateSession (gerbang sesi proxy)', () => {
  beforeEach(() => { auth.getClaims.mockReset(); auth.getUser.mockReset(); capturedSetAll = null; });

  it('tanpa sesi valid → redirect /login?next=', async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: new Error('no session') });
    const res = await updateSession(new NextRequest('http://localhost/admin/laporan'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/admin/laporan');
  });

  it('klaim tanpa sub (bukan sesi pengguna) → redirect', async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { role: 'anon' } }, error: null });
    const res = await updateSession(new NextRequest('http://localhost/penilaian'));
    expect(res.status).toBe(307);
  });

  it('sesi valid → lolos, tanpa panggilan getUser di proxy', async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'u1', role: 'authenticated' } }, error: null });
    const res = await updateSession(new NextRequest('http://localhost/penilaian'));
    expect(res.status).toBe(200);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('refresh token → cookie baru + header anti-cache ikut di respons', async () => {
    auth.getClaims.mockImplementation(async () => {
      capturedSetAll!([{ name: 'sb-x-auth-token', value: 'baru', options: { path: '/' } }],
        { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0' });
      return { data: { claims: { sub: 'u1' } }, error: null };
    });
    const res = await updateSession(new NextRequest('http://localhost/kpi'));
    expect(res.status).toBe(200);
    expect(res.cookies.get('sb-x-auth-token')?.value).toBe('baru');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('route publik tak menyentuh Supabase', async () => {
    const res = await updateSession(new NextRequest('http://localhost/api/version'));
    expect(res.status).toBe(200);
    expect(auth.getClaims).not.toHaveBeenCalled();
  });
});
