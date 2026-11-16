import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeClient, type MockClient } from './helpers/mock-supabase';

/**
 * Uji Server Action Laporkan Pelanggaran (migrasi 0054 + 0058 + 0061) — submitOutsideNote.
 *
 * Kenapa diuji: laporan dijanjikan ANONIM ("Nama dan identitas Anda tidak disimpan"). Kebocoran identitas tak
 * memunculkan error — hanya janji yang diam-diam dilanggar. Jadi selain gerbang (saklar/kandidat/kategori/isi),
 * tes ini mengunci bentuk baris yang ditulis (tanpa id pengirim) dan bahwa tak ada Log Aktivitas/console.
 *
 * Sejak 0061 (pemilik 2026-11-16): gerbang = periode aktif + saklar `violation_open` — status 360° & formulir
 * tidak menentukan; kategori = NAMA aspek budaya dari periode terbaru yang punya aspek; rekan di daftar penilaian
 * hanya ditolak selama formulir 360° terbuka.
 */
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logHrdAction: vi.fn(async () => {}), logAuditAsService: vi.fn(async () => {}) }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logHrdAction, logAuditAsService } from '@/lib/audit/log';
import { submitOutsideNote } from '@/app/(app)/lapor-pelanggaran/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rls(c: MockClient) { mockCreate.mockResolvedValue(c as any); return c; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function svc(c: MockClient) { mockAdmin.mockReturnValue(c as any); return c; }

const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TARGET = '11111111-1111-1111-1111-111111111111';
const CAT = 'Integritas';
const BODY = 'Rekan ini menolong tim gudang saat stok opname malam.';
const DATE = '2026-10-20';

/** Periode aktif: saklar terbuka, formulir 360° terbuka. */
const period = (o: Partial<{ has_360: boolean; form_open: boolean; violation_open: boolean }> = {}) =>
  ({ data: { id: 'p1', label: 'Q4 2026', has_360: true, form_open: true, violation_open: true, ...o } });
const ME = { data: { is_external: false } };
const TGT_OK = { data: { id: TARGET, role: 'employee', is_external: false, is_active: true } };
const NOT_MAPPED = { data: null };
/** Daftar kategori: periode aktif p1 belum punya aspek → pakai aspek periode p0 (periode terbaru yang punya aspek). */
const PERIOD_LIST = { data: [{ id: 'p1', start_date: '2026-10-01' }, { id: 'p0', start_date: '2026-07-01' }] };
const ASPECTS = { data: [{ period_id: 'p0', name: 'Integritas', order_idx: 1 }, { period_id: 'p0', name: 'Kolaborasi', order_idx: 2 }] };

/** Klien RLS dengan antrean lengkap jalur sukses; `over` mengganti antrean tabel tertentu. */
function happy(over: Record<string, { data?: unknown; error?: unknown }[]> = {}) {
  return rls(makeClient({
    user: { id: UID },
    tables: {
      periods: [period(), PERIOD_LIST],
      employees: [ME, TGT_OK],
      mappings: [NOT_MAPPED],
      culture_aspects: [ASPECTS],
      ...over,
    },
  }));
}

beforeEach(() => { vi.clearAllMocks(); });

describe('submitOutsideNote — validasi isi & sesi', () => {
  it('tolak isi < 20 karakter setelah di-trim (tanpa menyentuh DB)', async () => {
    const c = rls(makeClient({ user: { id: UID } }));
    const r = await submitOutsideNote(TARGET, CAT, DATE, '   terlalu pendek    ', '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/minimal 20 karakter/) });
    expect(c.calls).toHaveLength(0);
  });

  it('tolak rekan bukan UUID & kategori kosong', async () => {
    rls(makeClient({ user: { id: UID } }));
    expect((await submitOutsideNote('x', CAT, DATE, BODY, '')).ok).toBe(false);
    expect(await submitOutsideNote(TARGET, '  ', DATE, BODY, '')).toEqual({ ok: false, error: 'Pilih kategori laporan' });
  });

  it('tolak bila sesi berakhir', async () => {
    rls(makeClient({ user: null }));
    const r = await submitOutsideNote(TARGET, CAT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Sesi berakhir/) });
  });
});

describe('submitOutsideNote — gerbang = periode aktif + saklar Laporkan Pelanggaran (lepas dari 360°)', () => {
  it('tolak bila tak ada periode aktif', async () => {
    happy({ periods: [{ data: null }] });
    expect(await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).toEqual({ ok: false, error: 'Tidak ada periode aktif' });
  });

  it('tolak bila saklar ditutup HRD — walau formulir 360° terbuka', async () => {
    const admin = svc(makeClient({}));
    happy({ periods: [period({ violation_open: false })] });
    const r = await submitOutsideNote(TARGET, CAT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sedang ditutup HRD/) });
    expect(admin.calls).toHaveLength(0);
  });

  it.each([
    ['periode tanpa 360°', { has_360: false, form_open: false }],
    ['formulir 360° ditutup', { form_open: false }],
  ])('TERIMA saat %s bila saklar terbuka', async (_l, o) => {
    svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    const c = happy({ periods: [period(o), PERIOD_LIST] });
    expect(await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).toEqual({ ok: true });
    // Formulir tertutup → aturan "rekan di daftar penilaian" tidak dicek sama sekali.
    expect(c.calls.some((x) => x.table === 'mappings')).toBe(false);
  });

  it('kolom saklar belum ada (0061 belum dijalankan) → gerbang lama: 360° aktif + formulir dibuka', async () => {
    const missing = { error: { code: '42703', message: 'column periods.violation_open does not exist' } };
    happy({ periods: [missing, { data: { id: 'p1', label: 'Q4', has_360: true, form_open: false } }] });
    expect(await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).toEqual({ ok: false, error: expect.stringMatching(/sedang ditutup HRD/) });

    svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    happy({ periods: [missing, { data: { id: 'p1', label: 'Q4', has_360: true, form_open: true } }, PERIOD_LIST] });
    expect(await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).toEqual({ ok: true });
  });
});

describe('submitOutsideNote — kandidat (divalidasi ulang di server)', () => {
  it('tolak diri sendiri', async () => {
    const c = happy();
    const r = await submitOutsideNote(UID, CAT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/diri sendiri/) });
    expect(c.calls).toHaveLength(0);
  });

  it('tolak rekan yang ada di pemetaan aktif SELAMA formulir 360° terbuka', async () => {
    happy({ mappings: [{ data: { id: 'm1' } }] });
    const r = await submitOutsideNote(TARGET, CAT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/sudah ada di daftar penilaian/) });
  });

  it.each([
    ['Direksi', { role: 'direksi', is_external: false, is_active: true }, /Direksi/],
    ['pegawai eksternal', { role: 'employee', is_external: true, is_active: true }, /eksternal/],
    ['pegawai nonaktif', { role: 'employee', is_external: false, is_active: false }, /nonaktif/],
  ])('tolak target %s', async (_l, row, msg) => {
    const admin = svc(makeClient({}));
    happy({ employees: [ME, { data: { id: TARGET, ...row } }] });
    const r = await submitOutsideNote(TARGET, CAT, DATE, BODY, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
    expect(admin.calls).toHaveLength(0);
  });

  it('tolak target tak dikenal', async () => {
    happy({ employees: [ME, { data: null }] });
    expect((await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).ok).toBe(false);
  });

  it('tolak PENGIRIM eksternal (vendor/freelance) — belum boleh mengirim', async () => {
    const admin = svc(makeClient({}));
    happy({ employees: [{ data: { is_external: true } }] });
    const r = await submitOutsideNote(TARGET, CAT, DATE, BODY, '');
    expect(r.ok).toBe(false);
    expect(admin.calls).toHaveLength(0);
  });
});

describe('submitOutsideNote — kategori = nama aspek budaya (tak terikat periode aktif)', () => {
  it('tolak nama yang tak ada di daftar aspek', async () => {
    const admin = svc(makeClient({}));
    happy();
    expect(await submitOutsideNote(TARGET, 'Karangan Bebas', DATE, BODY, '')).toEqual({ ok: false, error: 'Kategori tidak ditemukan' });
    expect(admin.calls).toHaveLength(0);
  });

  it('cocokkan tanpa beda huruf besar/kecil → simpan nama baku', async () => {
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    happy();
    expect(await submitOutsideNote(TARGET, '  kolaborasi ', DATE, BODY, '')).toEqual({ ok: true });
    expect(admin.calls.find((x) => x.op === 'insert')?.payload).toMatchObject({ category: 'Kolaborasi', aspect_id: null, is_other: false });
  });
});

describe('submitOutsideNote — tersimpan ANONIM', () => {
  it('menulis tepat isian pelapor lewat service_role — tanpa identitas & waktu', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    const c = happy();

    const r = await submitOutsideNote(TARGET, CAT, DATE, `  ${BODY}  `, '');
    expect(r).toEqual({ ok: true });

    // Klien RLS tak pernah menulis apa pun (tabel tertutup untuk authenticated).
    expect(c.calls.filter((x) => x.op !== 'select')).toHaveLength(0);
    const writes = admin.calls.filter((x) => x.op !== 'select');
    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe('outside_mapping_notes');
    expect(writes[0].op).toBe('insert');
    expect(writes[0].payload).toEqual({
      period_id: 'p1', target_id: TARGET, aspect_id: null, category: CAT, is_other: false, incident_date: DATE, body: BODY, note: null,
    });
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
    const r = await submitOutsideNote(TARGET, CAT, DATE, BODY, '');
    expect(r).toEqual({ ok: false, error: 'Gagal mengirim laporan, coba lagi' });
  });

  it('tabel belum ada (migrasi 0054 belum dijalankan) → "belum aktif"', async () => {
    svc(makeClient({ tables: { outside_mapping_notes: [{ error: { code: 'PGRST205', message: 'Could not find the table' } }] } }));
    happy();
    expect(await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).toEqual({ ok: false, error: 'Fitur Laporkan Pelanggaran belum aktif' });
  });

  it('kolom 0058 belum ada → "sedang diperbarui" (bukan menyimpan tanpa tanggal/kategori)', async () => {
    svc(makeClient({ tables: { outside_mapping_notes: [{ error: { code: 'PGRST204', message: "Could not find the 'incident_date' column" } }] } }));
    happy();
    expect(await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).toEqual({ ok: false, error: expect.stringMatching(/sedang diperbarui/) });
  });

  it('kolom kategori (0061) belum ada → cara lama: rujukan aspek periode laporan dengan nama sama', async () => {
    const ASP = '22222222-2222-2222-2222-222222222222';
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [
      { error: { code: 'PGRST204', message: "Could not find the 'category' column" } }, { data: null },
    ] } }));
    happy({ culture_aspects: [ASPECTS, { data: [{ id: ASP, name: 'Integritas' }] }] });
    expect(await submitOutsideNote(TARGET, CAT, DATE, BODY, '')).toEqual({ ok: true });
    const inserts = admin.calls.filter((x) => x.op === 'insert');
    expect(inserts[1].payload).toEqual({ period_id: 'p1', target_id: TARGET, aspect_id: ASP, is_other: false, incident_date: DATE, body: BODY, note: null });
  });
});

describe('submitOutsideNote — tanggal, kategori Lainnya, catatan', () => {
  it('kategori Lainnya: tanpa memuat daftar aspek, kategori & aspek kosong, catatan tersimpan (trim)', async () => {
    const admin = svc(makeClient({ tables: { outside_mapping_notes: [{ data: null }] } }));
    const c = happy({ culture_aspects: [] });
    const r = await submitOutsideNote(TARGET, 'other', DATE, BODY, '  Pelanggaran jam kerja.  ');
    expect(r).toEqual({ ok: true });
    expect(c.calls.some((x) => x.table === 'culture_aspects')).toBe(false);
    const w = admin.calls.find((x) => x.op === 'insert')!;
    expect(w.payload).toEqual({ period_id: 'p1', target_id: TARGET, aspect_id: null, category: null, is_other: true, incident_date: DATE, body: BODY, note: 'Pelanggaran jam kerja.' });
    expect(JSON.stringify(w.payload)).not.toContain(UID);
  });

  it.each([
    ['tanggal kosong', '', /Tanggal kejadian wajib/],
    ['format salah', '20-10-2026', /Tanggal kejadian wajib/],
    ['tanggal mustahil', '2026-02-30', /tidak valid/],
    ['setelah hari ini', '2999-01-01', /tidak boleh setelah hari ini/],
  ])('tolak %s (tanpa menyentuh DB)', async (_l, date, msg) => {
    const c = rls(makeClient({ user: { id: UID } }));
    const r = await submitOutsideNote(TARGET, CAT, date, BODY, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
    expect(c.calls).toHaveLength(0);
  });

  it('tolak catatan > 1000 karakter', async () => {
    rls(makeClient({ user: { id: UID } }));
    expect((await submitOutsideNote(TARGET, CAT, DATE, BODY, 'x'.repeat(1001))).ok).toBe(false);
  });
});
