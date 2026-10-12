import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Edge Config tiruan — isi diatur per tes lewat `edgeItems` / `edgeFails`.
let edgeItems: Record<string, unknown> = {};
let edgeFails = false;
vi.mock('@vercel/edge-config', () => ({
  getAll: vi.fn(async () => {
    if (edgeFails) throw new Error('Edge Config down');
    return edgeItems;
  }),
}));
// Jalur normal (sesi Supabase) diganti penanda agar tes tak menyentuh jaringan.
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(async () => new Response('APP', { status: 200 })),
}));

import {
  resolveMaintenance, readMaintenance, maintenanceRoute, bypassToken, tokenMatches,
} from '@/lib/maintenance';
import { proxy } from '@/proxy';

const TOKEN = 'a1b2c3d4e5f6g7h8i9';
const PROD = { VERCEL_ENV: 'production', EDGE_CONFIG: 'https://edge-config.vercel.com/x?token=y' };

describe('resolveMaintenance', () => {
  it('hanya aktif di production dengan maintenance === true', () => {
    expect(resolveMaintenance({ maintenance: true }, 'production')).toEqual({ on: true, until: null });
    expect(resolveMaintenance({ maintenance: true }, 'preview').on).toBe(false);
    expect(resolveMaintenance({ maintenance: true }, 'development').on).toBe(false);
    expect(resolveMaintenance({ maintenance: true }, undefined).on).toBe(false);
  });

  it('nilai selain boolean true = mati (cegah salah ketik "true"/"false" sebagai teks)', () => {
    for (const v of ['true', 'false', 1, false, null, undefined]) {
      expect(resolveMaintenance({ maintenance: v }, 'production').on).toBe(false);
    }
    expect(resolveMaintenance(null, 'production').on).toBe(false);
  });

  it('maintenance_until dipangkas; kosong/non-teks → null', () => {
    expect(resolveMaintenance({ maintenance: true, maintenance_until: ' pukul 15.00 WIB ' }, 'production').until).toBe('pukul 15.00 WIB');
    expect(resolveMaintenance({ maintenance: true, maintenance_until: '  ' }, 'production').until).toBeNull();
    expect(resolveMaintenance({ maintenance: true, maintenance_until: 15 }, 'production').until).toBeNull();
  });
});

describe('readMaintenance', () => {
  beforeEach(() => { edgeItems = { maintenance: true }; edgeFails = false; });

  it('production + Edge Config terhubung → aktif', async () => {
    expect((await readMaintenance(PROD)).on).toBe(true);
  });

  it('Preview (branch dev) & lokal tak pernah terkunci walau saklar ON', async () => {
    expect((await readMaintenance({ ...PROD, VERCEL_ENV: 'preview' })).on).toBe(false);
    expect((await readMaintenance({ EDGE_CONFIG: PROD.EDGE_CONFIG })).on).toBe(false);
  });

  it('Edge Config belum dihubungkan / gangguan → dianggap mati, tak melempar', async () => {
    expect((await readMaintenance({ VERCEL_ENV: 'production' })).on).toBe(false);
    edgeFails = true;
    expect((await readMaintenance(PROD)).on).toBe(false);
  });
});

describe('maintenanceRoute', () => {
  it('maintenance mati → semua route normal; /maintenance → keluar ke /', () => {
    for (const p of ['/', '/login', '/penilaian', '/admin/laporan', '/api/cron/late-penalty']) {
      expect(maintenanceRoute(p, false)).toBe('pass');
    }
    expect(maintenanceRoute('/maintenance', false)).toBe('exit');
  });

  it('aktif tanpa bypass → semua halaman (termasuk login & auth) dialihkan; API 503', () => {
    for (const p of ['/', '/login', '/auth/callback', '/penilaian', '/admin/pegawai', '/panduan/panduan-hrd.pdf', '/maintenance-lama']) {
      expect(maintenanceRoute(p, true)).toBe('page');
    }
    expect(maintenanceRoute('/api/cron/late-penalty', true)).toBe('api');
    expect(maintenanceRoute('/maintenance', true)).toBe('pass');
  });

  it('developer ber-bypass → app normal, /maintenance mengarah ke /', () => {
    for (const p of ['/', '/penilaian', '/admin/pegawai', '/api/cron/late-penalty']) {
      expect(maintenanceRoute(p, true, true)).toBe('pass');
    }
    expect(maintenanceRoute('/maintenance', true, true)).toBe('exit');
  });
});

describe('bypassToken & tokenMatches', () => {
  it('token kosong / < 16 karakter = bypass mati', () => {
    expect(bypassToken({})).toBeNull();
    expect(bypassToken({ MAINTENANCE_BYPASS_TOKEN: '   ' })).toBeNull();
    expect(bypassToken({ MAINTENANCE_BYPASS_TOKEN: 'pendek123' })).toBeNull();
    expect(bypassToken({ MAINTENANCE_BYPASS_TOKEN: ` ${TOKEN} ` })).toBe(TOKEN);
  });

  it('hanya cocok persis; tanpa token sah semua ditolak', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(TOKEN.slice(0, -1) + 'x', TOKEN)).toBe(false);
    expect(tokenMatches(TOKEN + 'x', TOKEN)).toBe(false);
    expect(tokenMatches('', TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
    expect(tokenMatches('apa-saja-1234567890', null)).toBe(false);
  });
});

describe('proxy — alur ujung ke ujung', () => {
  const saved = { ...process.env };
  const req = (path: string, cookie?: string) =>
    new NextRequest(`https://app.test${path}`, cookie ? { headers: { cookie } } : undefined);

  beforeEach(() => {
    Object.assign(process.env, PROD, { MAINTENANCE_BYPASS_TOKEN: TOKEN });
    edgeItems = { maintenance: true };
    edgeFails = false;
  });
  afterEach(() => { process.env = { ...saved }; });

  it('saklar ON di production → halaman maintenance 503, API 503 JSON', async () => {
    const page = await proxy(req('/penilaian'));
    expect(page.status).toBe(503);
    expect(page.headers.get('x-middleware-rewrite')).toContain('/maintenance');
    const api = await proxy(req('/api/cron/late-penalty'));
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: 'Sedang maintenance' });
  });

  it('saklar OFF → jalur normal', async () => {
    edgeItems = { maintenance: false };
    expect(await (await proxy(req('/penilaian'))).text()).toBe('APP');
  });

  it('Preview (branch dev) tak terganggu walau saklar ON', async () => {
    process.env.VERCEL_ENV = 'preview';
    expect(await (await proxy(req('/penilaian'))).text()).toBe('APP');
  });

  it('?bypass=<kode benar> pasang cookie & buang param; cookie itu lalu lolos', async () => {
    const res = await proxy(req(`/penilaian?bypass=${TOKEN}`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app.test/penilaian');
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toContain(`maintenance_bypass=${TOKEN}`);
    expect(set.toLowerCase()).toContain('httponly');
    expect(await (await proxy(req('/penilaian', `maintenance_bypass=${TOKEN}`))).text()).toBe('APP');
  });

  it('kode salah → tak ada cookie, tetap 503', async () => {
    const res = await proxy(req('/penilaian?bypass=salah-salah-123456789'));
    expect(res.headers.get('set-cookie')).toBeNull();
    expect((await proxy(req('/penilaian', 'maintenance_bypass=salah-salah-123456789'))).status).toBe(503);
  });

  it('?bypass=off menghapus cookie', async () => {
    const res = await proxy(req('/?bypass=off', `maintenance_bypass=${TOKEN}`));
    expect(res.headers.get('set-cookie') ?? '').toMatch(/maintenance_bypass=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
