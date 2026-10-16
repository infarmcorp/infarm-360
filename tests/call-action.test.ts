import { describe, it, expect } from 'vitest';
import { callAction, ACTION_UNREACHABLE, savedAtLabel } from '@/lib/call-action';

describe('callAction — aksi gagal terkirim tak boleh diam-diam', () => {
  it('meneruskan hasil aksi apa adanya (berhasil maupun gagal biasa)', async () => {
    expect(await callAction(async () => ({ ok: true as const, acc: true }))).toEqual({ ok: true, acc: true });
    expect(await callAction(async () => ({ ok: false as const, error: 'Laporan belum dirilis' }))).toEqual({ ok: false, error: 'Laporan belum dirilis' });
  });

  it('error jaringan / Server Action hilang setelah deploy → hasil gagal dengan pesan muat ulang', async () => {
    const r = await callAction(async () => { throw new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'); });
    expect(r).toEqual({ ok: false, error: ACTION_UNREACHABLE });
    expect(ACTION_UNREACHABLE).toMatch(/TIDAK tersimpan/);
    expect(await callAction(async () => { throw new TypeError('Failed to fetch'); })).toEqual({ ok: false, error: ACTION_UNREACHABLE });
  });

  it('jam tersimpan dalam WIB (HH.MM)', () => {
    expect(savedAtLabel(new Date('2026-10-15T07:20:00Z'))).toMatch(/^14[.:]20$/);
  });
});
