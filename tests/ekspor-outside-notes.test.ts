import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';

/**
 * Ekspor Bahan Laporan per Pegawai — lembar 4 "Laporan Pelanggaran" (tabel catatan 0054 + 0058).
 * Dikunci: hanya isian pelapor (tanggal kejadian, kategori, laporan, catatan) + periode + pegawai — TANPA kolom
 * pelapor/relasi/waktu kirim; urut pegawai → tanggal kejadian terbaru → abjad isi; HANYA saat pengekspor di Mode
 * Admin. Tabel belum ada → lembar kosong, ekspor tetap jalan.
 */
let mode = 'admin';
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: mode }) })) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { exportReportMaterials } from '@/app/(app)/admin/ekspor/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const U = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const T = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const base = { period_id: 'p1', target_id: T, is_other: false, note: null };
const NOTES = [
  { ...base, id: 'n1', aspect_id: 'asp2', incident_date: '2026-10-05', body: 'Zona gudang dibiarkan berantakan setelah shift malam.' },
  { ...base, id: 'n2', aspect_id: null, is_other: true, incident_date: '2026-11-02', body: 'Datang terlambat tanpa kabar.', note: 'Pelanggaran jam kerja.' },
  { ...base, id: 'n3', aspect_id: 'asp1', incident_date: '2026-10-05', body: 'Berbohong soal salah input stok.' },
  { ...base, id: 'n4', aspect_id: 'asp1', incident_date: null, body: 'Laporan lama sebelum pembaruan formulir.' },
  { ...base, id: 'n5', period_id: 'p0', aspect_id: 'asp1', incident_date: '2026-07-01', body: 'Laporan periode lain yang tak boleh ikut.' },
];

function setup(tables: Record<string, Record<string, unknown>[]>) {
  const me = fakeDb({ employees: [{ id: U, role: 'hrd', is_hrd_admin: false, hrd_sections: null }] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(Object.assign(me, { auth: { getUser: async () => ({ data: { user: { id: U } } }) } }) as any);
  const db = fakeDb({
    employees: [{ id: T, emp_code: 'E1', name: 'Target', dept: 'Gudang', role: 'employee' }],
    periods: [{ id: 'p1', label: 'Q4 2026', start_date: '2026-10-01', end_date: '2026-12-31' }],
    culture_aspects: [{ id: 'asp1', name: 'Jujur & Tanggung Jawab', order_idx: 0 }, { id: 'asp2', name: 'Berusaha Semaksimal Mungkin', order_idx: 1 }],
    ...tables,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(db as any);
}

const notesSheet = (r: Awaited<ReturnType<typeof exportReportMaterials>>) =>
  r.ok ? r.sheets.find((s) => s.name === 'Laporan Pelanggaran') : undefined;

beforeEach(() => { vi.clearAllMocks(); mode = 'admin'; });

describe('Bahan Laporan — lembar Laporan Pelanggaran', () => {
  it('Mode Admin: lembar ke-4 berisi isian pelapor saja, tersaring periode, urut tanggal kejadian terbaru → abjad isi', async () => {
    setup({ outside_mapping_notes: NOTES });
    const r = await exportReportMaterials('p1');
    expect(r.ok).toBe(true);
    const s = notesSheet(r)!;
    expect(r.ok && r.sheets.map((x) => x.name)).toEqual(['Skor', 'Komentar Aspek', 'Komentar Esai', 'Laporan Pelanggaran']);
    expect(s.rows.map((x) => x.laporan)).toEqual([
      'Datang terlambat tanpa kabar.',
      'Berbohong soal salah input stok.',
      'Zona gudang dibiarkan berantakan setelah shift malam.',
      'Laporan lama sebelum pembaruan formulir.',
    ]);
    expect(s.rows[0]).toEqual({
      periode: expect.stringContaining('Q4 2026'), kode: 'E1', nama: 'Target', divisi: 'Gudang',
      tanggal_kejadian: '2026-11-02', kategori: 'Lainnya', laporan: 'Datang terlambat tanpa kabar.', catatan: 'Pelanggaran jam kerja.',
    });
    expect(s.rows[1]).toMatchObject({ kategori: 'Jujur & Tanggung Jawab', catatan: '' });
    expect(s.rows[3]).toMatchObject({ tanggal_kejadian: '' });
    // Tak ada kolom pelapor / relasi / waktu kirim dalam bentuk apa pun.
    for (const row of s.rows) {
      expect(Object.keys(row).sort()).toEqual(['catatan', 'divisi', 'kategori', 'kode', 'laporan', 'nama', 'periode', 'tanggal_kejadian']);
    }
  });

  it('di luar Mode Admin → lembar laporan tidak ikut (tanpa petunjuk ada yang disembunyikan)', async () => {
    mode = 'spv';
    setup({ outside_mapping_notes: NOTES });
    const r = await exportReportMaterials('p1');
    expect(r.ok).toBe(true);
    expect(notesSheet(r)).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('terlambat tanpa kabar');
  });

  it('tanpa laporan → lembar ada tapi kosong', async () => {
    setup({ outside_mapping_notes: [] });
    const r = await exportReportMaterials('p1');
    expect(notesSheet(r)?.rows).toEqual([]);
  });
});
