import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';

/**
 * Ekspor Bahan Laporan per Pegawai — lembar 4 "Catatan di Luar Pemetaan" (0054).
 * Dikunci: hanya isi + periode + pegawai + aspek (tanpa kolom penulis/relasi/tanggal), urut abjad isi per aspek,
 * dan HANYA saat pengekspor di Mode Admin (aturan baca catatan). Tabel belum ada → lembar kosong, ekspor tetap jalan.
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

const NOTES = [
  { id: 'n1', period_id: 'p1', target_id: T, aspect_id: 'asp2', body: 'Zona gudang selalu rapi setelah shift malam.' },
  { id: 'n2', period_id: 'p1', target_id: T, aspect_id: 'asp1', body: 'Mengembalikan uang kembalian yang berlebih.' },
  { id: 'n3', period_id: 'p1', target_id: T, aspect_id: 'asp1', body: 'Berani mengakui salah input stok di depan tim.' },
  { id: 'n4', period_id: 'p0', target_id: T, aspect_id: 'asp1', body: 'Catatan periode lain yang tak boleh ikut.' },
];

function setup(tables: Record<string, Record<string, unknown>[]>) {
  const me = fakeDb({ employees: [{ id: U, role: 'hrd', is_hrd_admin: false, hrd_sections: null }] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(Object.assign(me, { auth: { getUser: async () => ({ data: { user: { id: U } } }) } }) as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(fakeDb({
    employees: [{ id: T, emp_code: 'E1', name: 'Target', dept: 'Gudang', role: 'employee' }],
    periods: [{ id: 'p1', label: 'Q4 2026', start_date: '2026-10-01', end_date: '2026-12-31' }],
    culture_aspects: [{ id: 'asp1', name: 'Jujur & Tanggung Jawab', order_idx: 0 }, { id: 'asp2', name: 'Berusaha Semaksimal Mungkin', order_idx: 1 }],
    ...tables,
  }) as any);
}

const notesSheet = (r: Awaited<ReturnType<typeof exportReportMaterials>>) =>
  r.ok ? r.sheets.find((s) => s.name === 'Catatan di Luar Pemetaan') : undefined;

beforeEach(() => { vi.clearAllMocks(); mode = 'admin'; });

describe('Bahan Laporan — lembar Catatan di Luar Pemetaan', () => {
  it('Mode Admin: lembar ke-4 berisi isi saja, tersaring periode, urut aspek → abjad isi', async () => {
    setup({ outside_mapping_notes: NOTES });
    const r = await exportReportMaterials('p1');
    expect(r.ok).toBe(true);
    const s = notesSheet(r)!;
    expect(r.ok && r.sheets.map((x) => x.name)).toEqual(['Skor', 'Komentar Aspek', 'Komentar Esai', 'Catatan di Luar Pemetaan']);
    expect(s.rows.map((x) => x.catatan)).toEqual([
      'Berani mengakui salah input stok di depan tim.',
      'Mengembalikan uang kembalian yang berlebih.',
      'Zona gudang selalu rapi setelah shift malam.',
    ]);
    expect(s.rows[0]).toEqual({
      periode: expect.stringContaining('Q4 2026'), kode: 'E1', nama: 'Target', divisi: 'Gudang',
      aspek: 'Jujur & Tanggung Jawab', catatan: 'Berani mengakui salah input stok di depan tim.',
    });
    // Tak ada kolom penulis / relasi / waktu dalam bentuk apa pun.
    for (const row of s.rows) {
      expect(Object.keys(row).sort()).toEqual(['aspek', 'catatan', 'divisi', 'kode', 'nama', 'periode']);
    }
  });

  it('di luar Mode Admin → lembar catatan tidak ikut (tanpa petunjuk ada yang disembunyikan)', async () => {
    mode = 'spv';
    setup({ outside_mapping_notes: NOTES });
    const r = await exportReportMaterials('p1');
    expect(r.ok).toBe(true);
    expect(notesSheet(r)).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('kembalian');
  });

  it('tanpa catatan → lembar ada tapi kosong', async () => {
    setup({ outside_mapping_notes: [] });
    const r = await exportReportMaterials('p1');
    expect(notesSheet(r)?.rows).toEqual([]);
  });
});
