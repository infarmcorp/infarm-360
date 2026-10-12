import { describe, it, expect } from 'vitest';
import { isMaintenanceOn, maintenanceRoute, bypassToken, tokenMatches } from '@/lib/maintenance';

describe('isMaintenanceOn', () => {
  it('hanya aktif bila MAINTENANCE_MODE = "true" (abaikan huruf besar & spasi)', () => {
    expect(isMaintenanceOn({ MAINTENANCE_MODE: 'true' })).toBe(true);
    expect(isMaintenanceOn({ MAINTENANCE_MODE: ' TRUE ' })).toBe(true);
    expect(isMaintenanceOn({ MAINTENANCE_MODE: 'false' })).toBe(false);
    expect(isMaintenanceOn({ MAINTENANCE_MODE: '1' })).toBe(false);
    expect(isMaintenanceOn({ MAINTENANCE_MODE: '' })).toBe(false);
    expect(isMaintenanceOn({})).toBe(false);
  });
});

describe('maintenanceRoute', () => {
  it('maintenance mati → semua route normal', () => {
    for (const p of ['/', '/login', '/penilaian', '/admin/laporan', '/api/cron/late-penalty']) {
      expect(maintenanceRoute(p, false)).toBe('pass');
    }
  });

  it('maintenance mati tapi user membuka /maintenance → keluar ke /', () => {
    expect(maintenanceRoute('/maintenance', false)).toBe('exit');
  });

  it('maintenance aktif tanpa bypass → semua halaman (termasuk login & auth) dialihkan', () => {
    for (const p of ['/', '/login', '/auth/callback', '/penilaian', '/admin/pegawai', '/panduan/panduan-hrd.pdf']) {
      expect(maintenanceRoute(p, true)).toBe('page');
    }
  });

  it('maintenance aktif → route API dapat 503 JSON, halaman maintenance sendiri lolos', () => {
    expect(maintenanceRoute('/api/cron/late-penalty', true)).toBe('api');
    expect(maintenanceRoute('/maintenance', true)).toBe('pass');
  });

  it('path mirip tapi bukan halaman maintenance tetap dialihkan', () => {
    expect(maintenanceRoute('/maintenance-lama', true)).toBe('page');
  });

  it('developer ber-bypass → app normal, /maintenance mengarah ke /', () => {
    for (const p of ['/', '/penilaian', '/admin/pegawai', '/api/cron/late-penalty']) {
      expect(maintenanceRoute(p, true, true)).toBe('pass');
    }
    expect(maintenanceRoute('/maintenance', true, true)).toBe('exit');
  });
});

describe('bypassToken & tokenMatches', () => {
  const TOKEN = 'a1b2c3d4e5f6g7h8i9';

  it('token kosong / < 16 karakter = bypass mati', () => {
    expect(bypassToken({})).toBeNull();
    expect(bypassToken({ MAINTENANCE_BYPASS_TOKEN: '   ' })).toBeNull();
    expect(bypassToken({ MAINTENANCE_BYPASS_TOKEN: 'pendek123' })).toBeNull();
    expect(bypassToken({ MAINTENANCE_BYPASS_TOKEN: ` ${TOKEN} ` })).toBe(TOKEN);
  });

  it('hanya cocok persis', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(TOKEN.slice(0, -1) + 'x', TOKEN)).toBe(false);
    expect(tokenMatches(TOKEN + 'x', TOKEN)).toBe(false);
    expect(tokenMatches('', TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
  });

  it('tanpa token sah, nilai apa pun ditolak', () => {
    expect(tokenMatches('apa-saja-1234567890', null)).toBe(false);
    expect(tokenMatches('', null)).toBe(false);
  });
});
