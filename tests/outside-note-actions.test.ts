import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

/**
 * Uji Server Action "Catatan di Luar Pemetaan" (migrasi 0054) — submitOutsideNote.
 *
 * Kenapa diuji: catatan dijanjikan ANONIM ("Nama Anda tidak ikut tersimpan"). Kebocoran identitas tak
 * memunculkan error — hanya janji yang diam-diam dilanggar. Jadi selain gerbang (fase/kandidat/aspek/isi),
 * tes ini mengunci bentuk baris yang ditulis (tanpa id pengirim) dan bahwa tak ada Log Aktivitas/console.
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction, logAuditAsService } from '@/lib/audit/log';
import { submitOutsideNote } from '@/app/(app)/penilaian/outside-note-actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rls(c: MockClient) { mockCreate.mockResolvedValue(c as any); return c; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function svc(c: MockClient) { mockAdmin.mockReturnValue(c as any); return c; }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TARGET = '11111111-1111-1111-1111-111111111111';
const ASPECT = '22222222-2222-2222-2222-222222222222';
const BODY = 'Rekan ini menolong tim gudang saat stok opname malam.';
const DATE = '2026-10-20';

const OPEN = { data: { id: 'p1', has_360: true, form_open: true } };
const ME = { data: { is_external: false } };
const TGT_OK = { data: { id: TARGET, role: 'employee', is_external: false, is_active: true } };
const NOT_MAPPED = { data: null };
const ASPECT_OK = { data: { id: ASPECT } };

/** Klien RLS dengan antrean lengkap jalur sukses; `over` mengganti antrean tabel tertentu. */
function happy(over: Record<string, { data?: unknown; error?: unknown }[]> = {}) {
  return rls(makeClient({
    user: { id: UID },
    tables: {
      periods: [OPEN],
      employees: [ME, TGT_OK],
      mappings: [NOT_MAPPED],
      culture_aspects: [ASPECT_OK],
      ...over,
    },
  }));
}

beforeEach(() => { vi.clearAllMocks(); });

describe('submitOutsideNote — validasi isi & sesi', () => {
  it('tolak isi < 20 karakter setelah di-trim (tanpa menyentuh DB)', async () => {
    const c = rls(makeClient({ user: { id: UID } }));
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, '   terlalu pendek    ', '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/minimal 20 karakter/) });
    expect(c.calls).toHaveLength(0);
  });

  it('tolak rekan/aspek bukan UUID', async () => {
    rls(makeClient({ user: { id: UID } }));
    expect((await submitOutsideNote('x', ASPECT, DATE, BODY, '')).ok).toBe(false);
    expect((await submitOutsideNote(TARGET, 'x', DATE, BODY, '')).ok).toBe(false);
  });

  it('tolak bila sesi berakhir', async () => {
    rls(makeClient({ user: null }));
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Sesi berakhir/) });
  });
});

describe('submitOutsideNote — gerbang fase', () => {
  it('tolak bila tak ada periode aktif', async () => {
    happy({ periods: [{ data: null }] });
    expect(await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '')).toEqual({ ok: false, error: 'Tidak ada periode aktif' });
  });

  it('tolak bila 360° belum dibuka', async () => {
    happy({ periods: [{ data: { id: 'p1', has_360: false, form_open: true } }] });
    expect((await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '')).ok).toBe(false);
  });

  it('tolak saat form ditutup — termasuk TAHAP TINJAU pemetaan (form belum dibuka)', async () => {
    const admin = svc(makeClient({}));
    happy({ periods: [{ data: { id: 'p1', has_360: true, form_open: false } }] });
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Form penilaian sedang ditutup/) });
    expect(admin.calls).toHaveLength(0);
  });
});

describe('submitOutsideNote — kandidat (divalidasi ulang di server)', () => {
  it('tolak diri sendiri', async () => {
    const c = happy();
    const r = await submitOutsideNote(UID, ASPECT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/diri sendiri/) });
    expect(c.calls).toHaveLength(0);
  });

  it('tolak rekan yang sudah ada di pemetaan aktif penilai', async () => {
    happy({ mappings: [{ data: { id: 'm1' } }] });
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sudah ada di daftar penilaian/) });
  });

  it.each([
    ['Direksi', { role: 'direksi', is_external: false, is_active: true }, /Direksi/],
    ['pegawai eksternal', { role: 'employee', is_external: true, is_active: true }, /eksternal/],
    ['pegawai nonaktif', { role: 'employee', is_external: false, is_active: false }, /nonaktif/],
  ])('tolak target %s', async (_l, row, msg) => {
    const admin = svc(makeClient({}));
    happy({ employees: [ME, { data: { id: TARGET, ...row } }] });
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
    expect(admin.calls).toHaveLength(0);
  });

  it('tolak target tak dikenal', async () => {
    happy({ employees: [ME, { data: null }] });
    expect((await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '')).ok).toBe(false);
  });

  it('tolak PENGIRIM eksternal (vendor/freelance) — belum boleh mengirim', async () => {
    const admin = svc(makeClient({}));
    happy({ employees: [{ data: { is_external: true } }] });
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '');
    expect(r.ok).toBe(false);
    expect(admin.calls).toHaveLength(0);
  });
});

describe('submitOutsideNote — aspek', () => {
  it('tolak aspek dari periode lain (tak ditemukan di periode aktif)', async () => {
    const admin = svc(makeClient({}));
    const c = happy({ culture_aspects: [{ data: null }] });
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: 'Kategori tidak ditemukan di periode aktif' });
    const q = c.calls.find((x) => x.table === 'culture_aspects');
    expect(q?.filters).toEqual(expect.arrayContaining([['eq', 'id', ASPECT], ['eq', 'period_id', 'p1']]));
    expect(admin.calls).toHaveLength(0);
  });
});

describe('submitOutsideNote — tersimpan ANONIM', () => {
  it('menulis tepat {period_id, target_id, aspect_id, body} lewat service_role — tanpa identitas & waktu', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    const c = happy();

    const r = await submitOutsideNote(TARGET, ASPECT, DATE, `  ${BODY}  `, '');
    expect(r).toEqual({ ok: true });

    // Klien RLS tak pernah menulis apa pun (tabel tertutup untuk authenticated).
    expect(c.calls.filter((x) => x.op !== 'select')).toHaveLength(0);
    const writes = admin.calls.filter((x) => x.op !== 'select');
    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe('outside_mapping_notes');
    expect(writes[0].op).toBe('insert');
    expect(writes[0].payload).toEqual({ period_id: 'p1', target_id: TARGET, aspect_id: ASPECT, is_other: false, incident_date: DATE, body: BODY, note: null });
    // Id pengirim tak muncul di mana pun dalam baris yang ditulis.
    expect(JSON.stringify(writes[0].payload)).not.toContain(UID);

    // Tanpa Log Aktivitas & tanpa console.
    expect(logHrdAction).not.toHaveBeenCalled();
    expect(logAuditAsService).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    log.mockRestore(); warn.mockRestore(); errSpy.mockRestore();
  });

  it('pesan error tak membawa identitas maupun detail database', async () => {
    svc(makeClient({ tables: { outside_mapping_notes: [{ error: { code: '23514', message: `violates check for ${UID}` } }] } }));
    happy();
    const r = await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: 'Gagal mengirim laporan, coba lagi' });
  });

  it('tabel belum ada (migrasi 0054 belum dijalankan) → "belum aktif"', async () => {
    svc(makeClient({ tables: { outside_mapping_notes: [{ error: { code: 'PGRST205', message: 'Could not find the table' } }] } }));
    happy();
    expect(await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '')).toEqual({ ok: false, error: 'Fitur Laporkan Pelanggaran belum aktif' });
  });

  it('kolom 0058 belum ada → "sedang diperbarui" (bukan menyimpan tanpa tanggal/kategori)', async () => {
    svc(makeClient({ tables: { outside_mapping_notes: [{ error: { code: 'PGRST204', message: "Could not find the 'incident_date' column" } }] } }));
    happy();
    expect(await submitOutsideNote(TARGET, ASPECT, DATE, BODY, '')).toEqual({ ok: false, error: expect.stringMatching(/sedang diperbarui/) });
  });
});

describe('submitOutsideNote — Laporkan Pelanggaran (0058): tanggal, kategori Lainnya, catatan', () => {
  it('kategori Lainnya: tanpa cek aspek, aspect_id kosong, is_other true, catatan tersimpan (trim)', async () => {
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    const c = happy({ culture_aspects: [] });
    const r = await submitOutsideNote(TARGET, 'other', DATE, BODY, '  Pelanggaran jam kerja.  ');
    expect(r).toEqual({ ok: true });
    expect(c.calls.some((x) => x.table === 'culture_aspects')).toBe(false);
    const w = admin.calls.find((x) => x.op === 'insert')!;
    expect(w.payload).toEqual({ period_id: 'p1', target_id: TARGET, aspect_id: null, is_other: true, incident_date: DATE, body: BODY, note: 'Pelanggaran jam kerja.' });
    expect(JSON.stringify(w.payload)).not.toContain(UID);
  });

  it.each([
    ['tanggal kosong', '', /Tanggal kejadian wajib/],
    ['format salah', '20-10-2026', /Tanggal kejadian wajib/],
    ['tanggal mustahil', '2026-02-30', /tidak valid/],
    ['setelah hari ini', '2999-01-01', /tidak boleh setelah hari ini/],
  ])('tolak %s (tanpa menyentuh DB)', async (_l, date, msg) => {
    const c = rls(makeClient({ user: { id: UID } }));
    const r = await submitOutsideNote(TARGET, ASPECT, date, BODY, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
    expect(c.calls).toHaveLength(0);
  });

  it('tolak catatan > 1000 karakter dan kategori yang bukan UUID/Lainnya', async () => {
    rls(makeClient({ user: { id: UID } }));
    expect((await submitOutsideNote(TARGET, ASPECT, DATE, BODY, 'x'.repeat(1001))).ok).toBe(false);
    expect((await submitOutsideNote(TARGET, 'lainnya', DATE, BODY, '')).ok).toBe(false);
  });
});
