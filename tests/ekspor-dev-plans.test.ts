import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeDb } from './helpers/fake-postgrest';

/**
 * Ekspor "Rencana Pengembangan & 1-on-1" (Tahap 3): 3 lembar bernama, disaring periode LAPORAN asal rencana,
 * rencana tanpa prioritas tetap satu baris, kemajuan per prioritas ditulis "P<n> <status>: catatan".
 */
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'admin' }) })) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { exportDevPlans } from '@/app/(app)/admin/ekspor/actions';

const mockCreate = vi.mocked(createClient);
const mockAdmin = vi.mocked(createAdminClient);
const U = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function setup(role = 'hrd') {
  const me = fakeDb({ employees: [{ id: U, role, is_hrd_admin: false, hrd_sections: null }] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue(Object.assign(me, { auth: { getUser: async () => ({ data: { user: { id: U } } }) } }) as any);
  const db = fakeDb({
    employees: [
      { id: 'e1', emp_code: 'E1', name: 'Budi', dept: 'Gudang', role: 'employee' },
      { id: 'e2', emp_code: 'E2', name: 'Ani', dept: 'Gudang', role: 'employee' },
    ],
    periods: [
      { id: 'p3', label: 'Q3 2026', start_date: '2026-07-01', end_date: '2026-09-30' },
      { id: 'p2', label: 'Q2 2026', start_date: '2026-04-01', end_date: '2026-06-30' },
    ],
    development_plans: [
      { id: 'd1', employee_id: 'e1', source_period_id: 'p3', status: 'agreed', sup_confirmation: 'Sesuai', sup_context: null, sup_support: 'Coaching', sup_hope: null,
        revision_reason: null, employee_signed_at: '2026-10-21T03:00:00Z', supervisor_id: 's', supervisor_name: 'SPV A', supervisor_signed_at: '2026-10-22T03:00:00Z',
        hrd_id: 'h', hrd_name: 'HRD A', hrd_signed_at: '2026-10-23T03:00:00Z' },
      { id: 'd2', employee_id: 'e2', source_period_id: 'p3', status: 'draft' },
      { id: 'd0', employee_id: 'e1', source_period_id: 'p2', status: 'agreed' },
    ],
    development_plan_items: [
      { id: 'i1', plan_id: 'd1', order_idx: 0, area: 'Konfirmasi', target: 'T', actions: 'L', due_text: 'Des', companion: 'SPV', success_indicator: 'I' },
      { id: 'i2', plan_id: 'd1', order_idx: 1, area: 'Tegas', target: 'T2', actions: 'L2', due_text: 'Des', companion: 'HRD', success_indicator: 'I2' },
    ],
    development_plan_sessions: [
      { id: 's1', plan_id: 'd1', kind: 'one_on_one', session_date: '2026-11-10', author_name: 'SPV A', summary: 'Sesi pertama', overall_status: 'behind',
        item_progress: [{ item_id: 'i2', status: 'behind', note: 'Belum mulai' }], employee_note: 'Siap' },
    ],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockAdmin.mockReturnValue(db as any);
}

beforeEach(() => { vi.clearAllMocks(); });

describe('exportDevPlans', () => {
  it('3 lembar bernama, tersaring periode laporan', async () => {
    setup();
    const r = await exportDevPlans('p3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [rencana, persetujuan, sesi] = r.sheets;
    expect(r.sheets.map((s) => s.name)).toEqual(['Rencana', 'Komentar & Persetujuan', 'Sesi & Tinjauan']);
    // Ani (tanpa prioritas) tetap satu baris; Budi dua prioritas. Periode Q2 tidak ikut.
    expect(rencana.rows.map((x) => [x.nama, x.prioritas_ke])).toEqual([['Ani', null], ['Budi', 1], ['Budi', 2]]);
    expect(rencana.rows[1]).toMatchObject({ rencana: 'Rencana Pengembangan Q4 2026', status: 'Disepakati', area: 'Konfirmasi' });
    expect(persetujuan.rows.find((x) => x.nama === 'Budi')).toMatchObject({ disetujui_atasan_oleh: 'SPV A', disetujui_hrd_oleh: 'HRD A', dukungan_diberikan: 'Coaching' });
    expect(sesi.rows).toEqual([expect.objectContaining({
      nama: 'Budi', jenis: 'Sesi 1-on-1', tanggal_sesi: '2026-11-10', status_umum: 'Tertinggal',
      kemajuan_per_prioritas: 'P2 Tertinggal: Belum mulai', tanggapan_pegawai: 'Siap',
    })]);
  });

  it('bukan HRD berbagian Ekspor → ditolak', async () => {
    setup('spv');
    expect(await exportDevPlans('p3')).toEqual({ ok: false, error: 'Hanya HRD' });
  });
});
